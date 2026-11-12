import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { isSubscriptionCommerciallyActive } from "@atlas/shared";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import type { AuthUser } from "../auth/auth.types";

const TICKET_STATUSES = ["open", "waiting", "resolved", "closed"] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

/**
 * SAV / incidents — rôles support/ops/admin.
 * Un approver peut lire mais le SAV ne constitue jamais une approbation de mission.
 *
 * Prise en charge client (`requestPragmaHandoff`) : seul egress volontaire
 * des findings locaux → ticket Pragma (abonnement support, pas de metering domaine).
 */
@Injectable()
export class TicketsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  list(status?: string) {
    return this.prisma.supportTicket.findMany({
      where: status ? { status } : undefined,
      orderBy: { createdAt: "desc" },
      include: {
        tenant: { select: { id: true, slug: true, name: true } },
        mission: { select: { id: true, title: true, status: true } },
      },
      take: 100,
    });
  }

  async create(
    user: AuthUser,
    body: {
      tenantId: string;
      subject: string;
      body: string;
      missionId?: string;
      category?: string;
      synthetic?: boolean;
    },
  ) {
    if (!user.staffRoles.some((r) => ["support", "ops", "admin"].includes(r))) {
      throw new ForbiddenException(
        "SAV : rôles support|ops|admin uniquement — approver ne gère pas les tickets ici.",
      );
    }
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: body.tenantId },
    });
    if (!tenant) throw new NotFoundException("Tenant introuvable");
    if (body.missionId) {
      const mission = await this.prisma.mission.findFirst({
        where: { id: body.missionId, tenantId: body.tenantId },
      });
      if (!mission) {
        throw new BadRequestException(
          "Mission absente ou hors tenant du ticket",
        );
      }
    }
    const ticket = await this.prisma.supportTicket.create({
      data: {
        tenantId: body.tenantId,
        missionId: body.missionId,
        subject: body.subject,
        body: body.body,
        category: body.category ?? "question",
        createdByUserId: user.userId,
        assigneeUserId: user.userId,
        synthetic: body.synthetic ?? true,
        status: "open",
      },
      include: {
        tenant: { select: { slug: true, name: true } },
        mission: { select: { id: true, title: true } },
      },
    });
    await this.audit.append({
      tenantId: body.tenantId,
      actorId: user.userId,
      action: "support_ticket.created",
      objectType: "support_ticket",
      objectId: ticket.id,
      payload: {
        status: ticket.status,
        missionId: body.missionId ?? null,
        disclaimer: "SAV ≠ approbation mission",
      },
    });
    return {
      ...ticket,
      notice:
        "Ticket SAV créé. Ceci n'approuve aucune mission et ne remplace pas le Policy Guard.",
    };
  }

  /**
   * Client support → Pragma : crée un ticket SAV à partir du rapport choisi.
   * Prérequis : tenant + abonnement commercialement actif (facturation Pragma).
   * Scan local reste gratuit ; aucun compteur de domaines ici.
   */
  async requestPragmaHandoff(
    user: AuthUser,
    body: {
      reportMarkdown: string;
      fingerprints?: string[];
      shortIds?: string[];
      subject?: string;
      missionId?: string;
    },
  ) {
    if (!user.tenantId) {
      throw new BadRequestException("tenant requis");
    }
    const report = (body.reportMarkdown ?? "").trim();
    if (report.length < 20) {
      throw new BadRequestException("Rapport de prise en charge trop court");
    }

    const now = new Date();
    const subs = await this.prisma.subscription.findMany({
      where: { tenantId: user.tenantId },
      include: { plan: true },
    });
    const active = subs.find((s) => isSubscriptionCommerciallyActive(s, now));
    if (!active) {
      throw new ForbiddenException(
        "Prise en charge réservée aux clients support (abonnement Pragma actif). Le scan local reste gratuit et les findings restent sur la machine.",
      );
    }

    if (body.missionId) {
      const mission = await this.prisma.mission.findFirst({
        where: { id: body.missionId, tenantId: user.tenantId },
      });
      if (!mission) {
        throw new BadRequestException(
          "Mission absente ou hors tenant de la prise en charge",
        );
      }
    }

    const shortIds = (body.shortIds ?? []).filter(
      (id): id is string => typeof id === "string",
    );
    const fingerprints = (body.fingerprints ?? []).filter(
      (id): id is string => typeof id === "string",
    );
    const subject =
      (body.subject ?? "").trim() ||
      `Prise en charge Atlas (${shortIds.slice(0, 3).join(", ") || "rapport"})`;

    const ticket = await this.prisma.supportTicket.create({
      data: {
        tenantId: user.tenantId,
        missionId: body.missionId,
        subject: subject.slice(0, 200),
        body: report,
        category: "prise_en_charge",
        createdByUserId: user.userId,
        synthetic: true,
        status: "open",
      },
    });

    await this.audit.append({
      tenantId: user.tenantId,
      actorId: user.userId,
      action: "support.handoff",
      objectType: "support_ticket",
      objectId: ticket.id,
      payload: {
        category: "prise_en_charge",
        fingerprintCount: fingerprints.length,
        shortIds: shortIds.slice(0, 20),
        planCode: active.plan.code,
        billing: "pragma_support_subscription",
        domainMetering: false,
        notice:
          "Seul egress client vulns → Pragma ; scan local non facturé à la domaine.",
      },
    });

    return {
      ticketId: ticket.id,
      id: ticket.id,
      status: ticket.status,
      category: ticket.category,
      notice:
        "Rapport transmis à Pragma (prise en charge). Scan local gratuit ; support facturé par abonnement — pas de metering par domaine.",
    };
  }

  async updateStatus(
    id: string,
    user: AuthUser,
    status: TicketStatus,
  ) {
    if (!user.staffRoles.some((r) => ["support", "ops", "admin"].includes(r))) {
      throw new ForbiddenException(
        "Seul support|ops|admin peut changer le statut SAV (pas l'approbation).",
      );
    }
    if (!TICKET_STATUSES.includes(status)) {
      throw new BadRequestException(`Statut invalide: ${status}`);
    }
    const existing = await this.prisma.supportTicket.findUnique({
      where: { id },
    });
    if (!existing) throw new NotFoundException("Ticket introuvable");
    const ticket = await this.prisma.supportTicket.update({
      where: { id },
      data: {
        status,
        resolvedAt:
          status === "resolved" || status === "closed"
            ? new Date()
            : existing.resolvedAt,
      },
      include: {
        tenant: { select: { slug: true } },
        mission: { select: { id: true, title: true } },
      },
    });
    await this.audit.append({
      tenantId: ticket.tenantId,
      actorId: user.userId,
      action: "support_ticket.status",
      objectType: "support_ticket",
      objectId: id,
      payload: { from: existing.status, to: status },
    });
    return ticket;
  }
}
