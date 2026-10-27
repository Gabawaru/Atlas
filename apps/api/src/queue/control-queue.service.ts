import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { Queue, Worker, Job, QueueEvents } from "bullmq";
import IORedis from "ioredis";
import {
  CONTROL_DLQ_NAME,
  CONTROL_JOB_ATTEMPTS,
  CONTROL_JOB_BACKOFF_MS,
  CONTROL_QUEUE_NAME,
  REDIS_URL,
  type WebPassiveJobPayload,
} from "./queue.constants";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import {
  runWebPassivePresence,
  WEB_PASSIVE_MODULE_ID,
} from "../control/web-passive";
import { evaluateMissionExecution } from "../control/execution-gate";
import { generateReportExports } from "../reports/report-export";
import { assertTransition } from "../mission/mission-state";
import {
  isSubscriptionCommerciallyActive,
  type MissionStatus,
} from "@atlas/shared";
import { VulnService } from "../vuln/vuln.service";
import { OpsService } from "../ops/ops.service";
import { ConnectorsService } from "../connectors/connectors.service";

@Injectable()
export class ControlQueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ControlQueueService.name);
  private connection!: IORedis;
  private queue!: Queue<WebPassiveJobPayload>;
  private dlq!: Queue<WebPassiveJobPayload & { failedReason?: string }>;
  private worker!: Worker<WebPassiveJobPayload>;
  private events!: QueueEvents;
  private ready = false;

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(VulnService) private readonly vuln: VulnService,
    @Inject(OpsService) private readonly ops: OpsService,
    @Inject(ConnectorsService) private readonly connectors: ConnectorsService,
  ) {}

  async onModuleInit() {
    this.connection = new IORedis(REDIS_URL, {
      maxRetriesPerRequest: null,
      enableReadyCheck: true,
    });
    this.queue = new Queue(CONTROL_QUEUE_NAME, {
      connection: this.connection.duplicate(),
      defaultJobOptions: {
        attempts: CONTROL_JOB_ATTEMPTS,
        backoff: { type: "exponential", delay: CONTROL_JOB_BACKOFF_MS },
        removeOnComplete: 100,
        removeOnFail: 200,
      },
    });
    this.dlq = new Queue(CONTROL_DLQ_NAME, {
      connection: this.connection.duplicate(),
    });
    this.events = new QueueEvents(CONTROL_QUEUE_NAME, {
      connection: this.connection.duplicate(),
    });
    this.worker = new Worker(
      CONTROL_QUEUE_NAME,
      async (job) => this.processJob(job),
      {
        connection: this.connection.duplicate(),
        concurrency: 1,
      },
    );
    this.worker.on("failed", (job, err) => {
      void this.onJobFailed(job, err);
    });
    await this.events.waitUntilReady();
    this.ready = true;
    this.logger.log(
      `BullMQ worker prêt (${CONTROL_QUEUE_NAME}, attempts=${CONTROL_JOB_ATTEMPTS}, dlq=${CONTROL_DLQ_NAME})`,
    );
  }

  async onModuleDestroy() {
    await this.worker?.close();
    await this.events?.close();
    await this.queue?.close();
    await this.dlq?.close();
    await this.connection?.quit();
  }

  isReady() {
    return this.ready;
  }

  async enqueue(payload: WebPassiveJobPayload): Promise<{ bullJobId: string }> {
    const job = await this.queue.add("web.passive.presence.v1", payload, {
      jobId: payload.jobRunId,
      attempts: CONTROL_JOB_ATTEMPTS,
      backoff: { type: "exponential", delay: CONTROL_JOB_BACKOFF_MS },
      removeOnComplete: 100,
      removeOnFail: 200,
    });
    await this.prisma.jobRun.update({
      where: { id: payload.jobRunId },
      data: {
        bullJobId: String(job.id),
        status: "queued",
        attemptCount: 0,
        progressPercent: 0,
        progressMessage: `En file BullMQ (max ${CONTROL_JOB_ATTEMPTS} tentatives)`,
      },
    });
    return { bullJobId: String(job.id) };
  }

  /** Exposé pour tests / ops — taille DLQ */
  async dlqCount(): Promise<number> {
    return this.dlq.count();
  }

  private async onJobFailed(
    job: Job<WebPassiveJobPayload> | undefined,
    err: Error,
  ) {
    this.logger.error(`Job ${job?.id} failed: ${err.message}`);
    if (!job) return;
    const attempts = job.opts.attempts ?? CONTROL_JOB_ATTEMPTS;
    const made = job.attemptsMade;
    await this.prisma.jobRun
      .update({
        where: { id: job.data.jobRunId },
        data: {
          attemptCount: made,
          progressMessage: `Échec tentative ${made}/${attempts}: ${err.message}`,
        },
      })
      .catch(() => undefined);

    if (made >= attempts || err.message === "KILLED") {
      await this.deadLetter(job, err.message);
    }
  }

  private async deadLetter(
    job: Job<WebPassiveJobPayload>,
    reason: string,
  ) {
    await this.dlq.add(
      "dead",
      { ...job.data, failedReason: reason },
      { removeOnComplete: 500 },
    );
    await this.prisma.jobRun
      .update({
        where: { id: job.data.jobRunId },
        data: {
          status:
            reason === "KILLED"
              ? "killed"
              : "dead_lettered",
          deadLetteredAt: new Date(),
          finishedAt: new Date(),
          progressMessage: `DLQ: ${reason}`,
          attemptCount: job.attemptsMade,
        },
      })
      .catch(() => undefined);
    await this.audit
      .append({
        tenantId: job.data.tenantId,
        action:
          reason === "KILLED" ? "job.killed_dlq" : "job.dead_lettered",
        objectType: "job_run",
        objectId: job.data.jobRunId,
        payload: { reason, attemptsMade: job.attemptsMade },
      })
      .catch(() => undefined);
  }

  async waitForJob(jobRunId: string, timeoutMs = 90_000) {
    const job = await this.queue.getJob(jobRunId);
    if (!job) {
      // déjà terminé / retiré
      return this.prisma.jobRun.findUnique({ where: { id: jobRunId } });
    }
    await job.waitUntilFinished(this.events, timeoutMs);
    return this.prisma.jobRun.findUnique({ where: { id: jobRunId } });
  }

  async requestCancel(missionId: string) {
    const running = await this.prisma.jobRun.findFirst({
      where: {
        missionId,
        status: { in: ["queued", "running"] },
      },
      orderBy: { createdAt: "desc" },
    });
    if (!running) {
      return { cancelRequested: false, reason: "aucun job actif" };
    }
    await this.prisma.jobRun.update({
      where: { id: running.id },
      data: {
        cancelRequested: true,
        progressMessage: "Annulation demandée",
      },
    });
    if (running.bullJobId) {
      const job = await this.queue.getJob(running.bullJobId);
      if (job) {
        const state = await job.getState();
        if (state === "waiting" || state === "delayed") {
          await job.remove();
          await this.prisma.jobRun.update({
            where: { id: running.id },
            data: {
              status: "cancelled",
              finishedAt: new Date(),
              progressPercent: 100,
              progressMessage: "Annulé avant démarrage",
            },
          });
        }
      }
    }
    await this.audit.append({
      tenantId: running.tenantId,
      action: "job.cancel_requested",
      objectType: "job_run",
      objectId: running.id,
      payload: { missionId },
    });
    return { cancelRequested: true, jobRunId: running.id };
  }

  /**
   * Kill forcé : annulation + moveToFailed(KILLED) + statut `killed`.
   * Distinct de cancel (soft) — testé dans control-queue.test.ts.
   */
  async kill(missionId: string) {
    const cancel = await this.requestCancel(missionId);
    const running = await this.prisma.jobRun.findFirst({
      where: {
        missionId,
        status: { in: ["queued", "running"] },
      },
      orderBy: { createdAt: "desc" },
    });
    if (!running) {
      return { ...cancel, killed: false, reason: "aucun job actif" };
    }
    if (running.bullJobId) {
      const job = await this.queue.getJob(running.bullJobId);
      if (job) {
        try {
          await job.moveToFailed(new Error("KILLED"), job.token ?? "0", true);
        } catch {
          await job.remove().catch(() => undefined);
        }
        await this.deadLetter(
          job as Job<WebPassiveJobPayload>,
          "KILLED",
        ).catch(() => undefined);
      }
    }
    await this.prisma.jobRun.update({
      where: { id: running.id },
      data: {
        status: "killed",
        killedAt: new Date(),
        finishedAt: new Date(),
        cancelRequested: true,
        progressMessage: "Kill forcé — job stoppé, entrée DLQ",
      },
    });
    await this.audit.append({
      tenantId: running.tenantId,
      action: "job.killed",
      objectType: "job_run",
      objectId: running.id,
      payload: { missionId, hard: true },
    });
    await this.safeMissionTransition(missionId, "CANCELLED");
    return { ...cancel, killed: true, jobRunId: running.id };
  }

  private async processJob(job: Job<WebPassiveJobPayload>) {
    const p = job.data;
    await this.prisma.jobRun
      .update({
        where: { id: p.jobRunId },
        data: {
          attemptCount: job.attemptsMade + 1,
          progressMessage: `Tentative ${job.attemptsMade + 1}/${job.opts.attempts ?? CONTROL_JOB_ATTEMPTS}`,
        },
      })
      .catch(() => undefined);
    try {
      return await this.runControl(job);
    } catch (e) {
      if (e instanceof CancelledError) {
        await this.finishCancelled(p, []);
        return { cancelled: true };
      }
      await this.prisma.jobRun.update({
        where: { id: p.jobRunId },
        data: {
          status: "failed",
          finishedAt: new Date(),
          progressMessage: e instanceof Error ? e.message : String(e),
          gateReason: e instanceof Error ? e.message : String(e),
        },
      });
      await this.safeMissionTransition(p.missionId, "FAILED");
      throw e;
    }
  }

  private async runControl(job: Job<WebPassiveJobPayload>) {
    const p = job.data;
    const isCancelled = async () => {
      const row = await this.prisma.jobRun.findUnique({
        where: { id: p.jobRunId },
      });
      return row?.cancelRequested === true;
    };

    // Re-gate Policy Guard at worker start — do not trust enqueue-time ALLOW.
    const reGate = await this.reEvaluatePolicy(p);
    if (reGate.decision === "REJECT") {
      await this.finishPolicyBlocked(p, reGate);
      return { blocked: true, code: reGate.code, reason: reGate.reason };
    }

    await this.prisma.jobRun.update({
      where: { id: p.jobRunId },
      data: {
        status: "running",
        startedAt: new Date(),
        progressPercent: 1,
        progressMessage: "Démarrage contrôle passif",
        gateDecision: "ALLOW",
        gateReason: reGate.reason,
      },
    });

    await this.safeMissionTransition(p.missionId, "RUNNING");

    const forceMock =
      p.forceMockNetwork || process.env.ATLAS_FORCE_MOCK_NETWORK === "true";

    let cancelFlag = false;
    let evidence: Awaited<ReturnType<typeof runWebPassivePresence>> = [];

    try {
      evidence = await runWebPassivePresence(p.targets, {
        allowedHosts: new Set(p.allowedHosts),
        exclusions: new Set(p.exclusions ?? []),
        rateLimitPerMinute: p.rateLimitPerMinute,
        isCancelled: () => cancelFlag,
        onProgress: async (prog) => {
          if (await isCancelled()) {
            cancelFlag = true;
            throw new CancelledError();
          }
          const pct = Math.round((prog.current / prog.total) * 90);
          await this.prisma.jobRun.update({
            where: { id: p.jobRunId },
            data: {
              progressPercent: pct,
              progressMessage: prog.message,
            },
          });
          await job.updateProgress(pct);
        },
        sleepFn: forceMock ? async () => undefined : undefined,
        ...(forceMock
          ? {
              lookupFn: async () => ({
                a: ["203.0.113.10"],
                aaaa: [] as string[],
                ns: ["ns1.synthetic.invalid"],
                mx: ["mail.synthetic.invalid"],
                txt: ["v=spf1 -all"],
              }),
              fetchFn: async () => ({
                status: 200,
                headers: {
                  server: "atlas-synthetic/1.0",
                  "content-type": "text/html",
                  "strict-transport-security": "max-age=31536000",
                  "x-content-type-options": "nosniff",
                },
                bodySha256:
                  "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
                bodyBytesSampled: 0,
              }),
              tlsFn: async () => ({
                protocol: "TLSv1.3",
                authorized: false,
                subjectCN: "synthetic.invalid",
                subjectSANs: ["synthetic.invalid", "www.synthetic.invalid"],
                issuerCN: "Atlas Mock CA",
                daysRemaining: 90,
              }),
              rdapFn: async (host: string) => ({
                source: "rdap" as const,
                query: host,
                ok: true,
                handle: "SYNTHETIC-DOMAIN",
                registrar: "Atlas Mock Registrar",
                status: ["client transfer prohibited"],
                disclaimer:
                  "OSINT passif RDAP public uniquement — in-scope ; mock CI",
              }),
            }
          : {}),
      });
    } catch (e) {
      if (e instanceof CancelledError || cancelFlag || (await isCancelled())) {
        await this.finishCancelled(p, evidence);
        return { cancelled: true };
      }
      throw e;
    }

    if (await isCancelled()) {
      await this.finishCancelled(p, evidence);
      return { cancelled: true };
    }

    await this.prisma.jobRun.update({
      where: { id: p.jobRunId },
      data: {
        status: "completed",
        finishedAt: new Date(),
        progressPercent: 95,
        progressMessage: "Génération exports",
        evidenceJson: evidence as object,
      },
    });

    const mission = await this.prisma.mission.findUniqueOrThrow({
      where: { id: p.missionId },
    });

    const finding = await this.prisma.finding.create({
      data: {
        missionId: p.missionId,
        jobRunId: p.jobRunId,
        severity: "info",
        title: p.syntheticMission
          ? "[FICTIF] Présence web passive observée"
          : "Présence web passive observée",
        summary: p.syntheticMission
          ? "[FICTIF] Contrôle passif DNS/TLS/headers sur périmètre de démonstration."
          : "Contrôle passif DNS/TLS/headers sur le périmètre approuvé (RoE).",
        technical: JSON.stringify(evidence, null, 2),
        synthetic: p.syntheticMission,
      },
    });

    // Inventaire passif depuis bannières HTTP → matching feeds (confiance ≠ gravité)
    try {
      await this.vuln.ingestEvidenceBanners(
        p.tenantId,
        p.missionId,
        evidence,
        "system:worker",
        p.syntheticMission,
      );
    } catch (e) {
      this.logger.warn(
        `vuln ingest ignoré: ${e instanceof Error ? e.message : String(e)}`,
      );
    }

    const executiveSummary = p.syntheticMission
      ? "[FICTIF] Bilan décideur : exposition web de démonstration — DNS, certificats TLS et headers de sécurité observés dans le scope uniquement."
      : "Bilan décideur : observation passive (DNS, TLS, headers sécu) sur le périmètre autorisé.";
    const technicalDetail = [
      `Module ${WEB_PASSIVE_MODULE_ID}`,
      `Cibles contrôlées : ${evidence.length}`,
      `Preuves : DNS + headers sécu + TLS + OSINT RDAP (apex in-scope, public)`,
      `Exclusions RoE : ${(p.exclusions ?? []).join(", ") || "(aucune)"}`,
      `Rate limit : ${p.rateLimitPerMinute}/min · file BullMQ · pas de scan agressif`,
      forceMock ? "Réseau : mock forcé (ATLAS_FORCE_MOCK_NETWORK)" : "Réseau : sondes réelles",
    ].join("\n");

    const report = await this.prisma.report.create({
      data: {
        missionId: p.missionId,
        synthetic: p.syntheticMission,
        executiveSummary,
        technicalDetail,
        exportsMarkedSynthetic: p.syntheticMission,
        exportJson: {
          module: WEB_PASSIVE_MODULE_ID,
          evidence,
          findingId: finding.id,
          disclaimer: p.syntheticMission
            ? "Données de démonstration — aucune cible réelle"
            : undefined,
        } as object,
      },
    });

    const exports = await generateReportExports({
      reportId: report.id,
      missionId: p.missionId,
      missionTitle: mission.title,
      synthetic: p.syntheticMission,
      executiveSummary,
      technicalDetail,
      findings: [
        {
          severity: finding.severity,
          title: finding.title,
          summary: finding.summary,
          technical: finding.technical,
        },
      ],
      evidence,
      scopeHash: p.scopeHash,
      moduleId: WEB_PASSIVE_MODULE_ID,
    });

    await this.prisma.report.update({
      where: { id: report.id },
      data: {
        exportCsv: exports.csv,
        exportPdfPath: exports.pdfPath,
        exportJson: {
          ...(exports.json as object),
          contentHashes: exports.contentHashes,
        } as object,
        exportsMarkedSynthetic: exports.exportsMarkedSynthetic,
      },
    });

    await this.prisma.jobRun.update({
      where: { id: p.jobRunId },
      data: {
        progressPercent: 100,
        progressMessage: "Terminé",
      },
    });

    await this.safeMissionTransition(p.missionId, "COMPLETED");
    await this.safeMissionTransition(p.missionId, "REPORT_AVAILABLE");

    await this.audit.append({
      tenantId: p.tenantId,
      actorId: p.actorUserId,
      action: "job.completed",
      objectType: "job_run",
      objectId: p.jobRunId,
      payload: {
        evidenceCount: evidence.length,
        reportId: report.id,
        hashes: exports.contentHashes,
      },
    });

    return { reportId: report.id, evidenceCount: evidence.length };
  }

  private async finishCancelled(
    p: WebPassiveJobPayload,
    evidence: unknown,
  ) {
    await this.prisma.jobRun.update({
      where: { id: p.jobRunId },
      data: {
        status: "cancelled",
        finishedAt: new Date(),
        cancelRequested: true,
        progressPercent: 100,
        progressMessage: "Annulé",
        evidenceJson: evidence as object,
      },
    });
    await this.safeMissionTransition(p.missionId, "CANCELLING");
    await this.safeMissionTransition(p.missionId, "CANCELLED");
  }

  /**
   * Recharge mission/token/scope/ops et réévalue Policy Guard avant sondes.
   * Refuse les jobs stale (token/scope révoqués, kill-switch, etc.).
   */
  private async reEvaluatePolicy(p: WebPassiveJobPayload) {
    const mission = await this.prisma.mission.findUnique({
      where: { id: p.missionId },
      include: {
        scopeVersions: { orderBy: { version: "desc" } },
        ownerAuths: true,
        approvalReqs: { include: { decisions: true } },
        tokens: true,
      },
    });
    if (!mission || mission.tenantId !== p.tenantId) {
      return {
        decision: "REJECT" as const,
        code: "POLICY_DENY" as const,
        reason: "Mission introuvable pour re-gate worker",
      };
    }

    const now = new Date();
    const scope = mission.scopeVersions[0];
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

    const policies = await this.prisma.approvalRoutingPolicy.findMany({
      where: {
        enabled: true,
        OR: [{ tenantId: mission.tenantId }, { orgWide: true }],
      },
      include: { staffGroup: true },
    });
    const routeOk = policies.some(
      (pol) => pol.staffGroup && pol.staffGroup.memberIds.length > 0,
    );

    const assetsCount = await this.prisma.asset.count({
      where: { id: { in: scope?.assetIds ?? [] } },
    });
    const connectorGuard = await this.connectors.guardStateForModule(
      mission.tenantId,
      WEB_PASSIVE_MODULE_ID,
    );

    const gate = evaluateMissionExecution({
      mission,
      now,
      subscription: sub,
      approvalRouteConfigured: routeOk,
      assetsCount,
      connectorGuard,
      killSwitch: await this.ops.isMaintenanceOn(),
    });

    await this.audit
      .append({
        tenantId: p.tenantId,
        actorId: p.actorUserId,
        action: "policy_guard.evaluate",
        objectType: "job_run",
        objectId: p.jobRunId,
        payload: { ...gate, via: "bullmq" },
      })
      .catch(() => undefined);

    return gate;
  }

  private async finishPolicyBlocked(
    p: WebPassiveJobPayload,
    gate: { code?: string; reason: string },
  ) {
    const reason = `${gate.code ?? "POLICY_DENY"}: ${gate.reason}`;
    await this.prisma.jobRun.update({
      where: { id: p.jobRunId },
      data: {
        status: "failed",
        finishedAt: new Date(),
        progressPercent: 100,
        progressMessage: `Re-gate Policy Guard: ${reason}`,
        gateDecision: "REJECT",
        gateReason: reason,
      },
    });
    const mission = await this.prisma.mission.findUnique({
      where: { id: p.missionId },
    });
    if (mission) {
      const from = mission.status as MissionStatus;
      if (from !== "BLOCKED") {
        try {
          assertTransition(from, "BLOCKED");
          await this.prisma.mission.update({
            where: { id: p.missionId },
            data: { status: "BLOCKED", blockedReason: reason },
          });
          await this.audit
            .append({
              tenantId: mission.tenantId,
              action: "mission.transition",
              objectType: "mission",
              objectId: p.missionId,
              payload: { from, to: "BLOCKED", via: "bullmq", blockedReason: reason },
            })
            .catch(() => undefined);
        } catch {
          this.logger.warn(`Transition ignorée ${from} → BLOCKED`);
        }
      }
    }
    await this.audit
      .append({
        tenantId: p.tenantId,
        actorId: p.actorUserId,
        action: "job.policy_blocked",
        objectType: "job_run",
        objectId: p.jobRunId,
        payload: { reason, via: "bullmq" },
      })
      .catch(() => undefined);
  }

  private async safeMissionTransition(
    missionId: string,
    to: MissionStatus,
  ) {
    const mission = await this.prisma.mission.findUniqueOrThrow({
      where: { id: missionId },
    });
    const from = mission.status as MissionStatus;
    if (from === to) return;
    try {
      assertTransition(from, to);
    } catch {
      this.logger.warn(`Transition ignorée ${from} → ${to}`);
      return;
    }
    await this.prisma.mission.update({
      where: { id: missionId },
      data: { status: to },
    });
    await this.audit.append({
      tenantId: mission.tenantId,
      action: "mission.transition",
      objectType: "mission",
      objectId: missionId,
      payload: { from, to, via: "bullmq" },
    });
  }
}

class CancelledError extends Error {
  constructor() {
    super("CANCELLED");
    this.name = "CancelledError";
  }
}
