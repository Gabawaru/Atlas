import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { createHash } from "node:crypto";
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
import { WEB_PASSIVE_MODULE_ID } from "../control/web-passive";
import type { AuthUser } from "../auth/auth.types";
import { ControlQueueService } from "../queue/control-queue.service";
import {
  SIGNATURE_PROVIDER,
  type SignatureProvider,
} from "../signatures/signature-provider";
import { ConnectorsService } from "../connectors/connectors.service";
import { CONNECTOR_CATALOG } from "../connectors/connector.types";
import { readFile } from "node:fs/promises";

@Injectable()
export class MissionsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(ControlQueueService)
    private readonly controlQueue: ControlQueueService,
    @Inject(SIGNATURE_PROVIDER)
    private readonly signatures: SignatureProvider,
    @Inject(ConnectorsService)
    private readonly connectors: ConnectorsService,
  ) {}

  async listForTenant(tenantId: string) {
    return this.prisma.mission.findMany({
      where: { tenantId },
      orderBy: { createdAt: "desc" },
      include: {
        findings: true,
        reports: true,
        scopeVersions: { orderBy: { version: "desc" }, take: 1 },
        jobRuns: { orderBy: { createdAt: "desc" }, take: 3 },
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
        jobRuns: { orderBy: { createdAt: "desc" } },
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

  async submitOwnerAuth(
    missionId: string,
    user: AuthUser,
    signerLabel: string,
  ) {
    const mission = await this.get(missionId, user.tenantId);
    const scope = mission.scopeVersions[0];
    if (!scope) throw new BadRequestException("Scope manquant");

    if (mission.status === "PREP_READY") {
      await this.transition(missionId, "AUTH_PENDING", user);
    }

    const documentHash = createHash("sha256")
      .update(
        JSON.stringify({
          missionId,
          scopeHash: scope.scopeHash,
          signerLabel,
        }),
      )
      .digest("hex");

    const envelope = await this.signatures.createEnvelope(documentHash, [
      {
        email: user.email,
        name: signerLabel,
      },
    ]);
    const status = await this.signatures.getStatus(envelope.envelopeId);
    const artifact = await this.signatures.fetchArtifact(envelope.envelopeId);

    await this.prisma.ownerAuthorization.create({
      data: {
        missionId,
        scopeVersionId: scope.id,
        scopeHash: scope.scopeHash,
        status: status === "signed" ? "valid" : "pending",
        signerLabel,
        signatureArtifactRef: artifact.artifactRef,
        isStubSignature: artifact.isMock,
        signatureProvider: envelope.provider,
        signatureEnvelopeId: envelope.envelopeId,
        signatureStatus: status,
      },
    });

    await this.audit.append({
      tenantId: mission.tenantId,
      actorId: user.userId,
      action: "signature.envelope",
      objectType: "owner_authorization",
      objectId: missionId,
      payload: {
        provider: envelope.provider,
        envelopeId: envelope.envelopeId,
        isMock: artifact.isMock,
        contentHash: artifact.contentHash,
      },
    });

    if (status !== "signed") {
      return this.get(missionId, user.tenantId);
    }

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

    const connectorGuard = await this.connectors.guardStateForModule(
      mission.tenantId,
      WEB_PASSIVE_MODULE_ID,
    );

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
        ? (scope?.scopeHash ?? null)
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
      connectorRequired: connectorGuard.connectorRequired,
      connectorPresent: connectorGuard.connectorPresent,
      connectorActive: connectorGuard.connectorActive,
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

    const job = await this.prisma.jobRun.create({
      data: {
        missionId,
        tenantId: mission.tenantId,
        moduleId: WEB_PASSIVE_MODULE_ID,
        authorizationTokenId: token!.id,
        scopeHash: scope!.scopeHash,
        status: "queued",
        gateDecision: "ALLOW",
        gateReason: gate.reason,
        rateLimitPerMinute: 30,
        progressPercent: 0,
        progressMessage: "Mise en file BullMQ",
      },
    });

    const { bullJobId } = await this.controlQueue.enqueue({
      jobRunId: job.id,
      missionId,
      tenantId: mission.tenantId,
      actorUserId: user.userId,
      scopeHash: scope!.scopeHash,
      rateLimitPerMinute: 30,
      syntheticMission: mission.synthetic,
      // Preuves DNS/HTTP réelles par défaut ; mock seulement si forcé (offline CI)
      forceMockNetwork: process.env.ATLAS_FORCE_MOCK_NETWORK === "true",
      targets: assets.map((a) =>
        a.type === "url"
          ? { host: a.normalized, url: a.value }
          : { host: a.normalized },
      ),
      allowedHosts: assets.map((a) => a.normalized.toLowerCase()),
    });

    await this.controlQueue.waitForJob(job.id, 120_000);

    return {
      gate,
      bullJobId,
      mission: await this.get(missionId),
    };
  }

  requestCancel(missionId: string) {
    return this.controlQueue.requestCancel(missionId);
  }

  kill(missionId: string) {
    return this.controlQueue.kill(missionId);
  }

  async getJob(missionId: string, jobRunId: string, tenantId?: string) {
    const job = await this.prisma.jobRun.findFirst({
      where: {
        id: jobRunId,
        missionId,
        ...(tenantId
          ? { mission: { tenantId } }
          : {}),
      },
    });
    if (!job) throw new NotFoundException("Job introuvable");
    return job;
  }

  async getReportExport(
    missionId: string,
    reportId: string,
    format: "json" | "csv" | "pdf",
    tenantId?: string,
  ) {
    const report = await this.prisma.report.findFirst({
      where: {
        id: reportId,
        missionId,
        ...(tenantId ? { mission: { tenantId } } : {}),
      },
      include: { mission: true },
    });
    if (!report) throw new NotFoundException("Rapport introuvable");

    if (format === "json") {
      return {
        contentType: "application/json",
        body: JSON.stringify(report.exportJson ?? {}, null, 2),
        filename: `${reportId}.json`,
        synthetic: report.synthetic || report.exportsMarkedSynthetic,
      };
    }
    if (format === "csv") {
      return {
        contentType: "text/csv; charset=utf-8",
        body: report.exportCsv ?? "",
        filename: `${reportId}.csv`,
        synthetic: report.synthetic || report.exportsMarkedSynthetic,
      };
    }
    if (!report.exportPdfPath) {
      throw new NotFoundException("PDF non généré");
    }
    const buf = await readFile(report.exportPdfPath);
    return {
      contentType: "application/pdf",
      body: buf,
      filename: `${reportId}.pdf`,
      synthetic: report.synthetic || report.exportsMarkedSynthetic,
    };
  }

  guidedConversation(message: string) {
    const lower = message.toLowerCase();
    const suggestions = UX_NEEDS.map((n) => ({
      id: n.id,
      label: n.label,
      mvpReady: n.mvpReady,
      status: n.status,
      statusLabel: n.statusLabel,
      connectorIds: [...n.connectorIds],
      note: n.statusLabel,
    }));

    const connectors = CONNECTOR_CATALOG.map((c) => ({
      id: c.id,
      label: c.label,
      productionReady: c.productionReady,
      isStub: c.isStub,
      statusLabel: c.statusLabel,
    }));

    let intent: string = "general";
    let reply =
      "Je guide vers les modules et connecteurs disponibles. Je n'exécute rien : Policy Guard + autorisations humaines décident.";
    let recommendedConnectors: string[] = [];
    let recommendedNeed: string | null = null;
    let canExecuteHint = false;

    if (
      lower.includes("web") ||
      lower.includes("internet") ||
      lower.includes("dns") ||
      lower.includes("présence") ||
      lower.includes("presence")
    ) {
      intent = "web_presence";
      recommendedNeed = "web_presence";
      recommendedConnectors = ["web.passive.presence"];
      canExecuteHint = true;
      reply =
        "Besoin « présence web » : connectez le connecteur « Présence web passive », liez des actifs du scope, obtenez les autorisations, puis lancez une mission. L'abonnement seul ne suffit pas ; je ne contourne pas le Policy Guard.";
    } else if (
      lower.includes("github") ||
      lower.includes("git") ||
      lower.includes("logiciel") ||
      lower.includes("code")
    ) {
      intent = "systems_software";
      recommendedNeed = "systems_software";
      recommendedConnectors = ["github.read_only"];
      reply =
        "Pour le code / logiciels : un stub GitHub lecture seule (mock OAuth) existe — clairement non production. Il n'autorise aucune exécution de contrôle. Pas de faux « terminé ».";
    } else if (
      lower.includes("réseau") ||
      lower.includes("reseau") ||
      lower.includes("network") ||
      lower.includes("interne")
    ) {
      intent = "internal_network";
      recommendedNeed = "internal_network";
      reply =
        "Réseau interne : non branché dans ce MVP (aucun module). Je ne peux pas lancer de scan. Statut honnête : « non branché ».";
    } else if (
      lower.includes("config") ||
      lower.includes("iam") ||
      lower.includes("accès") ||
      lower.includes("acces")
    ) {
      intent = "configs_access";
      recommendedNeed = "configs_access";
      reply =
        "Configs / accès : non branché. Aucun connecteur IAM. Je refuse d'inventer une capacité.";
    } else if (
      lower.includes("vuln") ||
      lower.includes("cve") ||
      lower.includes("corriger")
    ) {
      intent = "vuln_tracking";
      recommendedNeed = "vuln_tracking";
      reply =
        "Suivi des vulnérabilités : bientôt (hors ITSM). Pas d'exécution automatique depuis cette conversation.";
    } else if (
      lower.includes("exécuter") ||
      lower.includes("executer") ||
      lower.includes("lance") ||
      lower.includes("scan")
    ) {
      intent = "execute_request";
      reply =
        "Je ne lance pas d'exécution. Passez par une mission autorisée ; le Policy Guard refuse sans owner auth, approbation A (si réelle), jeton, scope et connecteur actif.";
    }

    return {
      reply,
      intent,
      recommendedNeed,
      recommendedConnectors,
      canExecuteHint,
      llm: "mock",
      disclaimer:
        "L'IA ne s'auto-accorde pas de droits et ne contourne pas le Policy Guard. Aucune exécution depuis cette conversation.",
      suggestions,
      connectors,
    };
  }
}
