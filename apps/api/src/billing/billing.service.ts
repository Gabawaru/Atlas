import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { isSubscriptionCommerciallyActive } from "@atlas/shared";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import type { AuthUser } from "../auth/auth.types";
import { BILLING_DISCLAIMER, BILLING_PRINCIPLE } from "./billing.policy";

export type ActivateInput = {
  tenantId: string;
  planCode: string;
  /** Durée en jours ; omit = sans endsAt (ouvert) */
  durationDays?: number;
  status?: "trialing" | "active";
};

export type PaymentStubInput = {
  amountCents: number;
  currency?: string;
  /** simulated_success réactive past_due → active ; simulated_failure → past_due */
  outcome?: "recorded" | "simulated_success" | "simulated_failure";
  note?: string;
};

@Injectable()
export class BillingService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  principle() {
    return {
      principle: BILLING_PRINCIPLE,
      disclaimer: BILLING_DISCLAIMER,
      hardRule: "abonnement_actif_≠_autorisation_pentest",
      paymentProvider: "stub",
      pspReal: false,
    };
  }

  async listPlans() {
    const plans = await this.prisma.plan.findMany({ orderBy: { code: "asc" } });
    return plans.map((p) => ({
      id: p.id,
      code: p.code,
      name: p.name,
      modulesEntitled: p.modulesEntitled,
      maxUsers: p.maxUsers,
      llmTokenCapMonthly: p.llmTokenCapMonthly,
      llmEuroCapCentsMonthly: p.llmEuroCapCentsMonthly,
    }));
  }

  /** Identité commerciale des tenants — pas de missions / RoE / findings. */
  async listTenantsCommercial() {
    return this.prisma.tenant.findMany({
      orderBy: { slug: "asc" },
      select: { id: true, slug: true, name: true, status: true },
    });
  }

  /** Vue commerciale seule — pas de RoE / jetons / findings. */
  async listSubscriptionsCommercial() {
    const now = new Date();
    const rows = await this.prisma.subscription.findMany({
      include: {
        plan: true,
        tenant: { select: { id: true, slug: true, name: true } },
        payments: { orderBy: { createdAt: "desc" }, take: 3 },
      },
      orderBy: { startsAt: "desc" },
    });
    return {
      ...this.principle(),
      subscriptions: rows.map((s) => this.toCommercial(s, now)),
    };
  }

  async activate(input: ActivateInput, actor: AuthUser) {
    const plan = await this.prisma.plan.findUnique({
      where: { code: input.planCode },
    });
    if (!plan) {
      throw new NotFoundException(`Plan inconnu: ${input.planCode}`);
    }
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: input.tenantId },
    });
    if (!tenant) {
      throw new NotFoundException(`Tenant inconnu: ${input.tenantId}`);
    }

    const status = input.status ?? "active";
    const startsAt = new Date();
    let endsAt: Date | null = null;
    if (input.durationDays != null) {
      if (input.durationDays <= 0) {
        throw new BadRequestException("durationDays doit être > 0");
      }
      endsAt = new Date(startsAt);
      endsAt.setUTCDate(endsAt.getUTCDate() + input.durationDays);
    }

    // Annuler les abonnements commercialement actifs du tenant (1 licence courante)
    const existing = await this.prisma.subscription.findMany({
      where: { tenantId: input.tenantId },
    });
    for (const e of existing) {
      if (isSubscriptionCommerciallyActive(e, startsAt)) {
        await this.prisma.subscription.update({
          where: { id: e.id },
          data: { status: "canceled", endsAt: startsAt },
        });
      }
    }

    const created = await this.prisma.subscription.create({
      data: {
        tenantId: input.tenantId,
        planId: plan.id,
        status,
        startsAt,
        endsAt,
      },
      include: {
        plan: true,
        tenant: { select: { id: true, slug: true, name: true } },
        payments: true,
      },
    });

    await this.audit.append({
      tenantId: input.tenantId,
      actorId: actor.userId,
      action: "subscription.activated",
      objectType: "subscription",
      objectId: created.id,
      payload: {
        planCode: plan.code,
        status,
        startsAt: startsAt.toISOString(),
        endsAt: endsAt?.toISOString() ?? null,
        note: "Activation commerciale — ne crée pas d'autorisation pentest",
      },
    });

    return this.toCommercial(created, new Date());
  }

  async expire(subscriptionId: string, actor: AuthUser) {
    const sub = await this.prisma.subscription.findUnique({
      where: { id: subscriptionId },
      include: {
        plan: true,
        tenant: { select: { id: true, slug: true, name: true } },
        payments: { orderBy: { createdAt: "desc" }, take: 3 },
      },
    });
    if (!sub) throw new NotFoundException("Abonnement introuvable");

    const now = new Date();
    const updated = await this.prisma.subscription.update({
      where: { id: subscriptionId },
      data: { status: "canceled", endsAt: now },
      include: {
        plan: true,
        tenant: { select: { id: true, slug: true, name: true } },
        payments: { orderBy: { createdAt: "desc" }, take: 3 },
      },
    });

    await this.audit.append({
      tenantId: sub.tenantId,
      actorId: actor.userId,
      action: "subscription.expired",
      objectType: "subscription",
      objectId: subscriptionId,
      payload: {
        previousStatus: sub.status,
        endsAt: now.toISOString(),
        note: "Expiration commerciale — exécution bloquée (SUBSCRIPTION_INACTIVE)",
      },
    });

    return this.toCommercial(updated, now);
  }

  /**
   * Enregistre un paiement stub. Ne contacte aucun PSP.
   * Ne crée jamais d'autorisation pentest.
   */
  async recordPaymentStub(
    subscriptionId: string,
    input: PaymentStubInput,
    actor: AuthUser,
  ) {
    const sub = await this.prisma.subscription.findUnique({
      where: { id: subscriptionId },
    });
    if (!sub) throw new NotFoundException("Abonnement introuvable");
    if (input.amountCents < 0) {
      throw new BadRequestException("amountCents invalide");
    }

    const outcome = input.outcome ?? "recorded";
    const status =
      outcome === "simulated_success"
        ? "simulated_success"
        : outcome === "simulated_failure"
          ? "simulated_failure"
          : "stub_recorded";

    const externalRef = `stub_pay_${Date.now().toString(36)}`;
    const payment = await this.prisma.paymentStub.create({
      data: {
        subscriptionId,
        amountCents: input.amountCents,
        currency: input.currency ?? "EUR",
        status,
        provider: "stub",
        externalRef,
        note:
          input.note ??
          "Stub — aucun débit réel. Hors chemin Policy Guard.",
        createdByUserId: actor.userId,
      },
    });

    if (outcome === "simulated_success" && sub.status === "past_due") {
      await this.prisma.subscription.update({
        where: { id: subscriptionId },
        data: { status: "active", endsAt: null },
      });
    } else if (outcome === "simulated_failure") {
      await this.prisma.subscription.update({
        where: { id: subscriptionId },
        data: { status: "past_due" },
      });
    }

    await this.audit.append({
      tenantId: sub.tenantId,
      actorId: actor.userId,
      action: "payment.stub",
      objectType: "payment_stub",
      objectId: payment.id,
      payload: {
        subscriptionId,
        amountCents: payment.amountCents,
        status: payment.status,
        provider: "stub",
        pspReal: false,
        note: "Paiement simulé — n'accorde aucun droit d'exécution",
      },
    });

    const refreshed = await this.prisma.subscription.findUniqueOrThrow({
      where: { id: subscriptionId },
      include: {
        plan: true,
        tenant: { select: { id: true, slug: true, name: true } },
        payments: { orderBy: { createdAt: "desc" }, take: 3 },
      },
    });

    return {
      payment: {
        id: payment.id,
        amountCents: payment.amountCents,
        currency: payment.currency,
        status: payment.status,
        provider: payment.provider,
        externalRef: payment.externalRef,
        createdAt: payment.createdAt,
      },
      subscription: this.toCommercial(refreshed, new Date()),
      disclaimer: BILLING_DISCLAIMER,
    };
  }

  private toCommercial(
    s: {
      id: string;
      tenantId: string;
      status: string;
      startsAt: Date;
      endsAt: Date | null;
      plan: {
        code: string;
        name: string;
        modulesEntitled: string[];
        maxUsers: number;
        llmTokenCapMonthly: number;
        llmEuroCapCentsMonthly: number;
      };
      tenant: { id: string; slug: string; name: string };
      payments?: {
        id: string;
        amountCents: number;
        status: string;
        provider: string;
        createdAt: Date;
      }[];
    },
    now: Date,
  ) {
    return {
      id: s.id,
      tenantId: s.tenant.id,
      tenantSlug: s.tenant.slug,
      tenantName: s.tenant.name,
      planCode: s.plan.code,
      planName: s.plan.name,
      modulesEntitled: s.plan.modulesEntitled,
      maxUsers: s.plan.maxUsers,
      llmTokenCapMonthly: s.plan.llmTokenCapMonthly,
      llmEuroCapCentsMonthly: s.plan.llmEuroCapCentsMonthly,
      status: s.status,
      startsAt: s.startsAt,
      endsAt: s.endsAt,
      commerciallyActive: isSubscriptionCommerciallyActive(s, now),
      recentPayments: (s.payments ?? []).map((p) => ({
        id: p.id,
        amountCents: p.amountCents,
        status: p.status,
        provider: p.provider,
        createdAt: p.createdAt,
      })),
      subscriptionAloneInsufficient: true,
    };
  }
}
