import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { MissionsService } from "../missions/missions.service";
import type { AuthUser } from "../auth/auth.types";
import { assertTransition } from "../mission/mission-state";

@Injectable()
export class ApprovalsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(MissionsService) private readonly missions: MissionsService,
  ) {}

  async listQueue() {
    return this.prisma.approvalRequest.findMany({
      where: { status: { in: ["pending", "blocked_no_route"] } },
      include: {
        mission: {
          include: {
            scopeVersions: { orderBy: { version: "desc" }, take: 1 },
            ownerAuths: true,
            tenant: true,
          },
        },
        decisions: true,
      },
      orderBy: { createdAt: "asc" },
    });
  }

  async listTenants() {
    return this.prisma.tenant.findMany({
      orderBy: { slug: "asc" },
      select: {
        id: true,
        slug: true,
        name: true,
        syntheticDemo: true,
        status: true,
        _count: { select: { missions: true } },
      },
    });
  }

  async listApproverUserIds(orgId: string): Promise<string[]> {
    const rows = await this.prisma.staffMembership.findMany({
      where: { orgId, staffRole: "approver" },
      select: { userId: true },
    });
    return rows.map((r) => r.userId);
  }

  async decide(
    requestId: string,
    user: AuthUser,
    decision: "approved" | "rejected" | "returned",
    comment?: string,
  ) {
    if (!user.staffRoles.includes("approver")) {
      throw new ForbiddenException(
        "Seul le rôle approver peut décider (support/billing/ops ne peuvent pas).",
      );
    }
    const req = await this.prisma.approvalRequest.findUnique({
      where: { id: requestId },
      include: { mission: true },
    });
    if (!req) throw new NotFoundException();
    if (req.status === "blocked_no_route") {
      throw new BadRequestException(
        "NO_APPROVAL_ROUTE — importez le stub de routage (admin) pour débloquer la démo.",
      );
    }

    await this.prisma.approvalDecision.create({
      data: {
        requestId,
        decision,
        approverUserId: user.userId,
        scopeHash: req.scopeHash,
        comment,
      },
    });
    await this.prisma.approvalRequest.update({
      where: { id: requestId },
      data: { status: decision === "returned" ? "returned" : decision },
    });

    await this.audit.append({
      tenantId: req.mission.tenantId,
      actorId: user.userId,
      action: "approval.decision",
      objectType: "approval_request",
      objectId: requestId,
      payload: { decision, comment, roleUsed: "approver" },
    });

    if (decision === "approved") {
      const mission = req.mission;
      assertTransition(mission.status as never, "A_APPROVED");
      await this.missions.transition(mission.id, "A_APPROVED", user);
      await this.missions.issueToken(mission.id, user);
    }

    return this.prisma.approvalRequest.findUnique({
      where: { id: requestId },
      include: { decisions: true, mission: true },
    });
  }

  async getRouting() {
    return this.prisma.approvalRoutingPolicy.findMany({
      include: { staffGroup: true, tenant: true },
    });
  }

  /**
   * Import stub hiérarchie — clairement marqué isStub.
   * Peut cibler un tenant (débloque ce tenant en démo) ou être org-wide.
   * N'invente PAS une hiérarchie réelle d'entreprise A.
   */
  async importStubHierarchy(
    orgId: string,
    approverUserIds: string[],
    tenantId?: string | null,
  ) {
    if (tenantId) {
      const tenant = await this.prisma.tenant.findFirst({
        where: { id: tenantId, orgId },
      });
      if (!tenant) {
        throw new BadRequestException("Tenant introuvable pour cette org");
      }
    }

    const group = await this.prisma.staffGroup.create({
      data: {
        orgId,
        name: tenantId
          ? `[STUB] Approbateurs fictifs — tenant ${tenantId.slice(0, 8)}`
          : "[STUB] Groupe approbateurs fictifs (org-wide)",
        isStub: true,
        memberIds: approverUserIds,
      },
    });
    const policy = await this.prisma.approvalRoutingPolicy.create({
      data: {
        tenantId: tenantId ?? null,
        orgWide: !tenantId,
        modulePattern: "*",
        staffGroupId: group.id,
        enabled: true,
        isStub: true,
      },
    });

    // Débloque les demandes bloquées faute de route pour ce tenant / org
    if (tenantId) {
      await this.prisma.approvalRequest.updateMany({
        where: {
          status: "blocked_no_route",
          mission: { tenantId },
        },
        data: { status: "pending" },
      });
    } else {
      await this.prisma.approvalRequest.updateMany({
        where: { status: "blocked_no_route" },
        data: { status: "pending" },
      });
    }

    // Missions réelles BLOCKED pour NO_APPROVAL_ROUTE → repasser en A_APPROVAL_PENDING si encore pertinentes
    const blocked = await this.prisma.mission.findMany({
      where: {
        status: "BLOCKED",
        blockedReason: { contains: "NO_APPROVAL_ROUTE" },
        ...(tenantId ? { tenantId } : {}),
      },
    });
    for (const m of blocked) {
      await this.prisma.mission.update({
        where: { id: m.id },
        data: {
          status: "A_APPROVAL_PENDING",
          blockedReason: null,
        },
      });
      await this.audit.append({
        tenantId: m.tenantId,
        action: "mission.unblocked_after_stub_route",
        objectType: "mission",
        objectId: m.id,
        payload: { via: "import-stub", isStub: true },
      });
    }

    await this.audit.append({
      actorId: null,
      action: "approval_routing.stub_imported",
      objectType: "approval_routing_policy",
      objectId: policy.id,
      payload: {
        warning:
          "Stub uniquement — ne représente pas la hiérarchie réelle entreprise A",
        tenantId: tenantId ?? null,
        orgWide: !tenantId,
        unblockedMissions: blocked.length,
      },
    });
    return {
      group,
      policy,
      unblockedMissions: blocked.map((m) => m.id),
      disclaimer:
        "Import stub FICTIF — débloque le routage en démo uniquement, pas une org chart réelle.",
    };
  }
}
