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
  PASSIVE_ROE_METHODS,
  isSubscriptionCommerciallyActive,
  type MachineReadableRoe,
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
import { DeployService } from "../deploy/deploy.service";
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
    @Inject(DeployService)
    private readonly deploy: DeployService,
  ) {}

  async listForTenant(tenantId: string) {
    return this.prisma.mission.findMany({
      where: { tenantId },
      orderBy: { createdAt: "desc" },
      include: {
        findings: true,
        reports: true,
        scopeVersions: { orderBy: { version: "desc" }, take: 1 },
        ownerAuths: { orderBy: { createdAt: "desc" }, take: 2 },
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
      exclusions?: string[];
      methods?: string[];
      notes?: string;
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

    const methods =
      body.methods && body.methods.length > 0
        ? body.methods
        : [...PASSIVE_ROE_METHODS, ...moduleIds];
    const exclusions = (body.exclusions ?? []).map((e) =>
      e.toLowerCase().trim(),
    );

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
      methods,
      exclusions,
      periodStart: periodStart.toISOString(),
      periodEnd: periodEnd.toISOString(),
    };
    const scopeHash = await hashScope(scopePayload);

    await this.prisma.scopeVersion.create({
      data: {
        missionId: mission.id,
        version: 1,
        assetIds: body.assetIds,
        methods,
        exclusions,
        notes: body.notes ?? null,
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
      payload: { synthetic, scopeHash, exclusions },
    });

    return this.get(mission.id, user.tenantId);
  }

  /** RoE machine-readable de la dernière ScopeVersion */
  async getRoe(missionId: string, tenantId?: string): Promise<MachineReadableRoe> {
    const mission = await this.get(missionId, tenantId);
    const scope = mission.scopeVersions[0];
    if (!scope) throw new BadRequestException("Scope / RoE manquant");
    return {
      version: scope.version,
      scopeHash: scope.scopeHash,
      assetIds: scope.assetIds,
      exclusions: scope.exclusions ?? [],
      methods: scope.methods,
      periodStart: scope.periodStart.toISOString(),
      periodEnd: scope.periodEnd.toISOString(),
      notes: scope.notes,
      revoked: Boolean(scope.revokedAt),
    };
  }

  /**
   * Nouvelle version de périmètre (RoE). Invalide autorisations + jetons liés.
   * Toute modification → re-signature des deux parties.
   */
  async updateRoe(
    missionId: string,
    user: AuthUser,
    body: {
      assetIds: string[];
      methods?: string[];
      exclusions?: string[];
      notes?: string;
      periodStart?: string;
      periodEnd?: string;
    },
  ) {
    const mission = await this.get(missionId, user.tenantId);
    const prev = mission.scopeVersions[0];
    if (!prev) throw new BadRequestException("Scope manquant");

    const methods =
      body.methods && body.methods.length > 0
        ? body.methods
        : prev.methods;
    const exclusions = (body.exclusions ?? prev.exclusions ?? []).map((e) =>
      e.toLowerCase().trim(),
    );
    const periodStart = body.periodStart
      ? new Date(body.periodStart)
      : prev.periodStart;
    const periodEnd = body.periodEnd
      ? new Date(body.periodEnd)
      : prev.periodEnd;

    const nextVersion = prev.version + 1;
    const scopePayload = {
      missionId,
      assetIds: body.assetIds,
      methods,
      exclusions,
      periodStart: periodStart.toISOString(),
      periodEnd: periodEnd.toISOString(),
    };
    const scopeHash = await hashScope(scopePayload);

    await this.prisma.scopeVersion.update({
      where: { id: prev.id },
      data: { revokedAt: new Date() },
    });

    await this.prisma.scopeVersion.create({
      data: {
        missionId,
        version: nextVersion,
        assetIds: body.assetIds,
        methods,
        exclusions,
        notes: body.notes ?? prev.notes,
        periodStart,
        periodEnd,
        scopeHash,
      },
    });

    await this.prisma.ownerAuthorization.updateMany({
      where: { missionId, status: { in: ["valid", "pending"] } },
      data: { status: "revoked", revokedAt: new Date() },
    });
    await this.prisma.authorizationToken.updateMany({
      where: { missionId, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    const status = mission.status as MissionStatus;
    if (
      status === "AUTH_VALID" ||
      status === "AUTH_PENDING" ||
      status === "A_APPROVAL_PENDING" ||
      status === "A_APPROVED" ||
      status === "A_SKIPPED_DEMO" ||
      status === "BLOCKED"
    ) {
      await this.prisma.mission.update({
        where: { id: missionId },
        data: { status: "PREP_READY", blockedReason: null },
      });
      await this.audit.append({
        tenantId: mission.tenantId,
        actorId: user.userId,
        action: "mission.transition",
        objectType: "mission",
        objectId: missionId,
        payload: { from: status, to: "PREP_READY", reason: "roe.updated" },
      });
    }

    await this.audit.append({
      tenantId: mission.tenantId,
      actorId: user.userId,
      action: "roe.updated",
      objectType: "scope_version",
      objectId: missionId,
      payload: {
        fromVersion: prev.version,
        toVersion: nextVersion,
        scopeHash,
        invalidatedAuths: true,
      },
    });

    return this.get(missionId, user.tenantId);
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

  private readonly ATLAS_COUNTERPARTY = {
    email: "ops@a.atlas.local",
    name: "Atlas Ops (contrepartie mock)",
  };

  /**
   * Signature propriétaire (1re partie). Contrepartie A requise ensuite.
   * En mission synthétique : auto-complète la 2e partie pour la démo,
   * tout en journalisant les deux signatures mock.
   */
  async submitOwnerAuth(
    missionId: string,
    user: AuthUser,
    signerLabel: string,
  ) {
    const mission = await this.get(missionId, user.tenantId);
    const scope = mission.scopeVersions[0];
    if (!scope) throw new BadRequestException("Scope manquant");
    if (scope.revokedAt) {
      throw new BadRequestException(
        "Périmètre révoqué — mettez à jour le RoE puis re-signez.",
      );
    }

    if (mission.status === "PREP_READY") {
      await this.transition(missionId, "AUTH_PENDING", user);
    }

    const documentHash = createHash("sha256")
      .update(
        JSON.stringify({
          missionId,
          scopeHash: scope.scopeHash,
          version: scope.version,
          exclusions: scope.exclusions,
          methods: scope.methods,
          signerLabel,
        }),
      )
      .digest("hex");

    const envelope = await this.signatures.createEnvelope(documentHash, [
      { email: user.email, name: signerLabel, role: "owner" },
      {
        email: this.ATLAS_COUNTERPARTY.email,
        name: this.ATLAS_COUNTERPARTY.name,
        role: "counterparty",
      },
    ]);

    await this.signatures.completeSigner(envelope.envelopeId, user.email);
    const statusAfterOwner = await this.signatures.getStatus(
      envelope.envelopeId,
    );
    const artifact = await this.signatures.fetchArtifact(envelope.envelopeId);

    const authRow = await this.prisma.ownerAuthorization.create({
      data: {
        missionId,
        scopeVersionId: scope.id,
        scopeHash: scope.scopeHash,
        status: "pending",
        signerLabel,
        counterpartyLabel: this.ATLAS_COUNTERPARTY.name,
        counterpartyEmail: this.ATLAS_COUNTERPARTY.email,
        ownerSignedAt: new Date(),
        signatureArtifactRef: artifact.artifactRef,
        isStubSignature: artifact.isMock,
        signatureProvider: envelope.provider,
        signatureEnvelopeId: envelope.envelopeId,
        signatureStatus: statusAfterOwner,
      },
    });

    await this.audit.append({
      tenantId: mission.tenantId,
      actorId: user.userId,
      action: "signature.owner",
      objectType: "owner_authorization",
      objectId: authRow.id,
      payload: {
        provider: envelope.provider,
        envelopeId: envelope.envelopeId,
        isMock: artifact.isMock,
        parties: 2,
        scopeHash: scope.scopeHash,
        scopeVersion: scope.version,
      },
    });

    // Démo synthétique : contrepartie mock auto pour boucler le parcours
    if (mission.synthetic) {
      return this.completeCounterSignature(missionId, user, {
        autoDemo: true,
      });
    }

    return this.get(missionId, user.tenantId);
  }

  /** 2e partie du circuit mock (contrepartie A) */
  async completeCounterSignature(
    missionId: string,
    user: AuthUser,
    opts?: { autoDemo?: boolean },
  ) {
    const mission = await this.get(missionId, user.tenantId);
    const scope = mission.scopeVersions[0];
    const pending = mission.ownerAuths.find(
      (o) => o.status === "pending" && !o.revokedAt,
    );
    if (!scope || !pending?.signatureEnvelopeId) {
      throw new BadRequestException(
        "Aucune autorisation en attente de contrepartie.",
      );
    }

    const status = await this.signatures.completeSigner(
      pending.signatureEnvelopeId,
      this.ATLAS_COUNTERPARTY.email,
    );
    const artifact = await this.signatures.fetchArtifact(
      pending.signatureEnvelopeId,
    );

    await this.prisma.ownerAuthorization.update({
      where: { id: pending.id },
      data: {
        status: status === "signed" ? "valid" : "pending",
        counterpartySignedAt: new Date(),
        signatureStatus: status,
        signatureArtifactRef: artifact.artifactRef,
      },
    });

    await this.audit.append({
      tenantId: mission.tenantId,
      actorId: user.userId,
      action: "signature.counterparty",
      objectType: "owner_authorization",
      objectId: pending.id,
      payload: {
        autoDemo: Boolean(opts?.autoDemo),
        isMock: artifact.isMock,
        signedBy: artifact.signedBy,
        scopeHash: scope.scopeHash,
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
    // Garde-fou mode déploiement / offline (avant Policy Guard)
    this.deploy.assertExecutionAllowed(Boolean(token && !token.revokedAt));
    const owner = mission.ownerAuths.find((o) => o.status === "valid");
    const approval = mission.approvalReqs
      .flatMap((r) => r.decisions)
      .find((d) => d.decision === "approved");
    const now = new Date();
    const candidates = await this.prisma.subscription.findMany({
      where: {
        tenantId: mission.tenantId,
        status: { in: ["active", "trialing"] },
      },
      include: { plan: true },
      orderBy: { startsAt: "desc" },
    });
    const sub =
      candidates.find((c) => isSubscriptionCommerciallyActive(c, now)) ?? null;
    const routeOk = await this.hasApprovalRoute(mission.tenantId);
    const assets = await this.prisma.asset.findMany({
      where: { id: { in: scope?.assetIds ?? [] } },
    });

    const connectorGuard = await this.connectors.guardStateForModule(
      mission.tenantId,
      WEB_PASSIVE_MODULE_ID,
    );

    const gate = evaluateExecution({
      now,
      moduleId: WEB_PASSIVE_MODULE_ID,
      claimedScopeHash: scope?.scopeHash ?? "",
      subscriptionActive: sub
        ? isSubscriptionCommerciallyActive(sub, now)
        : false,
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
      exclusions: (scope!.exclusions ?? []).map((e) => e.toLowerCase()),
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

}

