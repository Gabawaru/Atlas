import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { hashScope, evaluateExecution } from "@atlas/policy-guard";
import {
  MODULE_WEB_PASSIVE,
  type MissionStatus,
  UX_NEEDS,
} from "@atlas/shared";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import {
  assertTransition,
  nextAfterAuthValid,
} from "../mission/mission-state";
import {
  runWebPassivePresence,
  WEB_PASSIVE_MODULE_ID,
} from "../control/web-passive";
import type { AuthUser } from "../auth/auth.types";

@Injectable()
export class MissionsService {
  private cancelFlags = new Map<string, boolean>();

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async listForTenant(tenantId: string) {
    return this.prisma.mission.findMany({
      where: { tenantId },
      orderBy: { createdAt: "desc" },
      include: {
        findings: true,
        reports: true,
        scopeVersions: { orderBy: { version: "desc" }, take: 1 },
      },
    });
  }

  async get(id: string, tenantId?: string) {
    const mission = await this.prisma.mission.findFirst({
      where: { id, ...(tenantId ? { tenantId } : {}) },
      include: {
        scopeVersions: { orderBy: { version: "desc" } },
        ownerAuths: true,
        approvalReqs: { include: { decisions: true } },
        tokens: true,
        jobRuns: true,
        findings: true,
        reports: true,
      },
    });
    if (!mission) throw new NotFoundException("Mission introuvable");
    return mission;
  }

  async create(
    user: AuthUser,
    body: {
      title: string;
      uxNeedIds: string[];
      assetIds: string[];
      synthetic?: boolean;
      periodDays?: number;
    },
  ) {
    if (!user.tenantId) throw new BadRequestException("tenant requis");
    const needs = UX_NEEDS.filter((n) => body.uxNeedIds.includes(n.id));
    const moduleIds = [
      ...new Set(needs.flatMap((n) => [...n.moduleIds])),
    ];
    if (moduleIds.length === 0) {
      moduleIds.push(MODULE_WEB_PASSIVE);
    }

    const synthetic = body.synthetic ?? false;
    const periodStart = new Date();
    const periodEnd = new Date(
      Date.now() + (body.periodDays ?? 14) * 24 * 3600 * 1000,
    );

    const mission = await this.prisma.mission.create({
      data: {
        tenantId: user.tenantId,
        title: body.title,
        status: "DRAFT",
        synthetic,
        isRealMission: !synthetic,
        uxNeedIds: body.uxNeedIds,
        moduleIds,
      },
    });

    const scopePayload = {
      missionId: mission.id,
      assetIds: body.assetIds,
      methods: moduleIds,
      periodStart: periodStart.toISOString(),
      periodEnd: periodEnd.toISOString(),
    };
    const scopeHash = await hashScope(scopePayload);

    await this.prisma.scopeVersion.create({
      data: {
        missionId: mission.id,
        version: 1,
        assetIds: body.assetIds,
        methods: moduleIds,
        periodStart,
        periodEnd,
        scopeHash,
      },
    });

    await this.transition(mission.id, "ASSETS_LINKED", user);
    await this.transition(mission.id, "PREP_READY", user);

    await this.audit.append({
      tenantId: user.tenantId,
      actorId: user.userId,
      action: "mission.created",
      objectType: "mission",
      objectId: mission.id,
      payload: { synthetic, scopeHash },
    });

    return this.get(mission.id, user.tenantId);
  }

  async transition(
    missionId: string,
    to: MissionStatus,
    user: AuthUser,
    extra?: { blockedReason?: string | null },
  ) {
    const mission = await this.prisma.mission.findUniqueOrThrow({
      where: { id: missionId },
    });
    const from = mission.status as MissionStatus;
    assertTransition(from, to);
    const updated = await this.prisma.mission.update({
      where: { id: missionId },
      data: {
        status: to,
        blockedReason:
          to === "BLOCKED"
            ? (extra?.blockedReason ?? mission.blockedReason)
            : to === "A_APPROVED" || to === "QUEUED"
              ? null
              : mission.blockedReason,
      },
    });
    await this.audit.append({
      tenantId: mission.tenantId,
      actorId: user.userId,
      action: "mission.transition",
      objectType: "mission",
      objectId: missionId,
      payload: { from, to, blockedReason: updated.blockedReason },
    });
    return updated;
  }

  async submitOwnerAuth(missionId: string, user: AuthUser, signerLabel: string) {
    const mission = await this.get(missionId, user.tenantId);
    const scope = mission.scopeVersions[0];
    if (!scope) throw new BadRequestException("Scope manquant");

    if (mission.status === "PREP_READY") {
      await this.transition(missionId, "AUTH_PENDING", user);
    }

    await this.prisma.ownerAuthorization.create({
      data: {
        missionId,
        scopeVersionId: scope.id,
        scopeHash: scope.scopeHash,
        status: "valid",
        signerLabel,
        signatureArtifactRef: `stub://signature/${missionId}`,
        isStubSignature: true,
      },
    });

    await this.transition(missionId, "AUTH_VALID", user);

    const route = await this.hasApprovalRoute(mission.tenantId);
    const next = nextAfterAuthValid({
      isRealMission: mission.isRealMission,
      isSyntheticDemo: mission.synthetic,
      approvalRouteConfigured: route,
    });

    if (next.status === "BLOCKED") {
      await this.transition(missionId, "BLOCKED", user, {
        blockedReason: next.blockedReason,
      });
    } else if (next.status === "A_APPROVAL_PENDING") {
      await this.transition(missionId, "A_APPROVAL_PENDING", user);
      await this.createApprovalRequest(missionId, user, route);
    } else if (next.status === "A_SKIPPED_DEMO") {
      await this.transition(missionId, "A_SKIPPED_DEMO", user);
      await this.issueToken(missionId, user);
    }

    return this.get(missionId, user.tenantId);
  }

  private async hasApprovalRoute(tenantId: string): Promise<boolean> {
    const policies = await this.prisma.approvalRoutingPolicy.findMany({
      where: {
        enabled: true,
        OR: [{ tenantId }, { orgWide: true }],
      },
      include: { staffGroup: true },
    });
    // Route OK si un groupe avec au moins un membre est configuré.
    // Un groupe isStub compte comme « configuré » (import stub explicite),
    // mais n'est PAS présenté comme hiérarchie réelle entreprise A.
    return policies.some(
      (p) => p.staffGroup && p.staffGroup.memberIds.length > 0,
    );
  }

  private async createApprovalRequest(
    missionId: string,
    user: AuthUser,
    routeOk: boolean,
  ) {
    const mission = await this.get(missionId);
    const scope = mission.scopeVersions[0];
    const owner = mission.ownerAuths.find((o) => o.status === "valid");
    if (!scope || !owner) return;

    await this.prisma.approvalRequest.create({
      data: {
        missionId,
        scopeVersionId: scope.id,
        scopeHash: scope.scopeHash,
        ownerAuthorizationId: owner.id,
        status: routeOk ? "pending" : "blocked_no_route",
      },
    });
  }

  async issueToken(missionId: string, user: AuthUser) {
    const mission = await this.get(missionId);
    const scope = mission.scopeVersions[0];
    if (!scope) throw new BadRequestException("Scope manquant");
    const token = await this.prisma.authorizationToken.create({
      data: {
        missionId,
        scopeHash: scope.scopeHash,
        moduleIds: mission.moduleIds,
        expiresAt: scope.periodEnd,
      },
    });
    await this.audit.append({
      tenantId: mission.tenantId,
      actorId: user.userId,
      action: "authorization_token.issued",
      objectType: "authorization_token",
      objectId: token.id,
      payload: { scopeHash: scope.scopeHash, stub: true },
    });
    return token;
  }

  async queueAndRun(missionId: string, user: AuthUser) {
    const mission = await this.get(missionId, user.tenantId);
    const status = mission.status as MissionStatus;
    if (status !== "A_APPROVED" && status !== "A_SKIPPED_DEMO") {
      throw new BadRequestException(
        `Impossible de lancer depuis ${status} — Policy Guard / circuit A requis`,
      );
    }

    const scope = mission.scopeVersions[0];
    const token = mission.tokens.find((t) => !t.revokedAt);
    const owner = mission.ownerAuths.find((o) => o.status === "valid");
    const approval = mission.approvalReqs
      .flatMap((r) => r.decisions)
      .find((d) => d.decision === "approved");
    const sub = await this.prisma.subscription.findFirst({
      where: { tenantId: mission.tenantId, status: "active" },
      include: { plan: true },
    });
    const routeOk = await this.hasApprovalRoute(mission.tenantId);
    const assets = await this.prisma.asset.findMany({
      where: { id: { in: scope?.assetIds ?? [] } },
    });

    const gate = evaluateExecution({
      now: new Date(),
      moduleId: WEB_PASSIVE_MODULE_ID,
      claimedScopeHash: scope?.scopeHash ?? "",
      subscriptionActive: sub?.status === "active",
      entitlementAllowsModule:
        sub?.plan.modulesEntitled.includes(WEB_PASSIVE_MODULE_ID) ?? false,
      ownerAuthorizationValid: owner?.status === "valid",
      ownerAuthorizationScopeHash: owner?.scopeHash ?? null,
      approvalApproved: mission.synthetic
        ? true
        : approval?.decision === "approved",
      approvalScopeHash: mission.synthetic
        ? scope?.scopeHash ?? null
        : (approval?.scopeHash ?? null),
      approvalRouteConfigured: mission.synthetic ? true : routeOk,
      isRealMission: mission.isRealMission,
      isSyntheticDemo: mission.synthetic,
      periodStart: scope?.periodStart ?? new Date(0),
      periodEnd: scope?.periodEnd ?? new Date(0),
      tokenPresent: !!token,
      tokenRevoked: !!token?.revokedAt,
      tokenExpiresAt: token?.expiresAt ?? null,
      tokenScopeHash: token?.scopeHash ?? null,
      tokenModuleIds: token?.moduleIds ?? [],
      scopeRevoked: !!scope?.revokedAt,
      targetInApprovedScope: assets.length > 0,
      killSwitch: false,
    });

    await this.audit.append({
      tenantId: mission.tenantId,
      actorId: user.userId,
      action: "policy_guard.evaluate",
      objectType: "mission",
      objectId: missionId,
      payload: gate,
    });

    if (gate.decision === "REJECT") {
      await this.transition(missionId, "BLOCKED", user, {
        blockedReason: `${gate.code}: ${gate.reason}`,
      });
      return { gate, mission: await this.get(missionId) };
    }

    await this.transition(missionId, "QUEUED", user);
    await this.transition(missionId, "RUNNING", user);

    this.cancelFlags.set(missionId, false);
    const job = await this.prisma.jobRun.create({
      data: {
        missionId,
        tenantId: mission.tenantId,
        moduleId: WEB_PASSIVE_MODULE_ID,
        authorizationTokenId: token!.id,
        scopeHash: scope!.scopeHash,
        status: "running",
        gateDecision: "ALLOW",
        gateReason: gate.reason,
        rateLimitPerMinute: 30,
        startedAt: new Date(),
      },
    });

    try {
      const allowedHosts = new Set(
        assets.map((a) => a.normalized.toLowerCase()),
      );
      const evidence = await runWebPassivePresence(
        assets.map((a) =>
          a.type === "url"
            ? { host: a.normalized, url: a.value }
            : { host: a.normalized },
        ),
        {
          allowedHosts,
          rateLimitPerMinute: 30,
          isCancelled: () => this.cancelFlags.get(missionId) === true,
          // En démo / CI sans réseau : lookup mock si synthetic
          ...(mission.synthetic
            ? {
                lookupFn: async () => ["203.0.113.10"],
                fetchFn: async () => ({
                  status: 200,
                  headers: {
                    server: "atlas-synthetic/1.0",
                    "content-type": "text/html",
                  },
                }),
                sleepFn: async () => undefined,
              }
            : {}),
        },
      );

      if (this.cancelFlags.get(missionId)) {
        await this.prisma.jobRun.update({
          where: { id: job.id },
          data: {
            status: "cancelled",
            finishedAt: new Date(),
            evidenceJson: evidence as object,
            cancelRequested: true,
          },
        });
        await this.transition(missionId, "CANCELLING", user);
        await this.transition(missionId, "CANCELLED", user);
        return { gate, cancelled: true };
      }

      await this.prisma.jobRun.update({
        where: { id: job.id },
        data: {
          status: "completed",
          finishedAt: new Date(),
          evidenceJson: evidence as object,
        },
      });

      await this.prisma.finding.create({
        data: {
          missionId,
          jobRunId: job.id,
          severity: "info",
          title: "Présence web passive observée",
          summary:
            "Contrôle passif DNS/HTTP sur le périmètre approuvé (données " +
            (mission.synthetic ? "FICTIVES" : "collectées") +
            ").",
          technical: JSON.stringify(evidence, null, 2),
          synthetic: mission.synthetic,
        },
      });

      await this.prisma.report.create({
        data: {
          missionId,
          synthetic: mission.synthetic,
          executiveSummary: mission.synthetic
            ? "[FICTIF] Bilan décideur : exposition web de démonstration uniquement — aucune cible réelle."
            : "Bilan décideur : observation passive de la présence web sur le périmètre autorisé.",
          technicalDetail:
            "Module web.passive.presence.v1 — DNS lookup + HEAD HTTP bornés, rate-limités, annulables.",
          exportJson: {
            module: WEB_PASSIVE_MODULE_ID,
            evidence,
            disclaimer: mission.synthetic
              ? "Données de démonstration — aucune cible réelle"
              : undefined,
          } as object,
        },
      });

      await this.transition(missionId, "COMPLETED", user);
      await this.transition(missionId, "REPORT_AVAILABLE", user);
    } catch (e) {
      await this.prisma.jobRun.update({
        where: { id: job.id },
        data: {
          status: "failed",
          finishedAt: new Date(),
          gateReason: e instanceof Error ? e.message : String(e),
        },
      });
      await this.transition(missionId, "FAILED", user);
    }

    return { gate, mission: await this.get(missionId) };
  }

  requestCancel(missionId: string) {
    this.cancelFlags.set(missionId, true);
    return { cancelRequested: true };
  }

  /** Conversation guidée — LLM mock (pas d'autorité d'exécution) */
  guidedConversation(message: string) {
    const lower = message.toLowerCase();
    const suggestions = UX_NEEDS.map((n) => ({
      id: n.id,
      label: n.label,
      mvpReady: n.mvpReady,
      note: n.mvpReady
        ? "Disponible en MVP (présence web passive)."
        : "Hors profondeur MVP — stub UX uniquement, non exécutable.",
    }));
    let reply =
      "Je peux vous guider sur les 5 besoins. Je propose un plan ; je n'exécute rien sans autorisations humaines et Policy Guard.";
    if (lower.includes("web") || lower.includes("internet") || lower.includes("dns")) {
      reply =
        "Pour « Que voit-on de nous sur Internet ? », le module MVP est la présence web passive (DNS/HTTP publics). Abonnement ≠ autorisation de tester.";
    }
    return {
      reply,
      llm: "mock",
      disclaimer:
        "L'IA ne s'auto-accorde pas de droits. Aucune exécution depuis cette conversation.",
      suggestions,
    };
  }
}
