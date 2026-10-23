import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { unlink } from "node:fs/promises";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import type { AuthUser } from "../auth/auth.types";
import {
  cutoffDate,
  DEFAULT_RETENTION_TTL_DAYS,
  RETENTION_CATEGORIES,
  RETENTION_DISCLAIMER,
  type RetentionCategory,
  type RetentionTtlDays,
} from "./retention.policy";

export interface PurgeCounts {
  audit: number;
  reports: number;
  artefacts: number;
  pii_minimized: number;
  llm_usage: number;
}

@Injectable()
export class RetentionService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  policy(): {
    ttlDays: RetentionTtlDays;
    categories: readonly RetentionCategory[];
    disclaimer: string;
  } {
    return {
      ttlDays: { ...DEFAULT_RETENTION_TTL_DAYS },
      categories: RETENTION_CATEGORIES,
      disclaimer: RETENTION_DISCLAIMER,
    };
  }

  async setLegalHold(
    tenantId: string,
    user: AuthUser,
    body: { active: boolean; reason?: string },
  ) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
    });
    if (!tenant) throw new NotFoundException("Tenant introuvable");

    const updated = await this.prisma.tenant.update({
      where: { id: tenantId },
      data: {
        legalHold: body.active,
        legalHoldReason: body.active
          ? (body.reason ?? "Hold légal (hypothèse process)")
          : null,
        legalHoldAt: body.active ? new Date() : null,
      },
    });

    await this.audit.append({
      tenantId,
      actorId: user.userId,
      action: body.active ? "legal_hold.enabled" : "legal_hold.released",
      objectType: "tenant",
      objectId: tenantId,
      payload: {
        reason: updated.legalHoldReason,
        disclaimer: RETENTION_DISCLAIMER,
      },
    });

    return {
      tenantId,
      legalHold: updated.legalHold,
      legalHoldReason: updated.legalHoldReason,
      legalHoldAt: updated.legalHoldAt,
      disclaimer: RETENTION_DISCLAIMER,
    };
  }

  async runPurge(opts: {
    tenantId: string;
    dryRun: boolean;
    categories?: RetentionCategory[];
    actorId?: string;
    /** Purge physique audit (sinon comptage seul — chaîne préservée par défaut) */
    forceAuditPurge?: boolean;
  }) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: opts.tenantId },
    });
    if (!tenant) throw new NotFoundException("Tenant introuvable");

    const categories = opts.categories?.length
      ? opts.categories
      : [...RETENTION_CATEGORIES];
    for (const c of categories) {
      if (!(RETENTION_CATEGORIES as readonly string[]).includes(c)) {
        throw new BadRequestException(`Catégorie inconnue: ${c}`);
      }
    }

    if (tenant.legalHold) {
      const empty: PurgeCounts = {
        audit: 0,
        reports: 0,
        artefacts: 0,
        pii_minimized: 0,
        llm_usage: 0,
      };
      const run = await this.prisma.purgeRun.create({
        data: {
          tenantId: opts.tenantId,
          dryRun: opts.dryRun,
          heldSkipped: true,
          categories,
          deletedCounts: empty,
          notes: `Legal hold actif — aucune suppression. Motif: ${tenant.legalHoldReason ?? "n/a"}`,
          actorId: opts.actorId,
        },
      });
      await this.audit.append({
        tenantId: opts.tenantId,
        actorId: opts.actorId,
        action: "retention.purge_blocked_hold",
        objectType: "purge_run",
        objectId: run.id,
        payload: { dryRun: opts.dryRun, categories },
      });
      return {
        run,
        heldSkipped: true as const,
        counts: empty,
        disclaimer: RETENTION_DISCLAIMER,
        message:
          "Legal hold actif : pas d'auto-suppression. Lever le hold explicitement avant purge.",
      };
    }

    const ttl = DEFAULT_RETENTION_TTL_DAYS;
    const counts: PurgeCounts = {
      audit: 0,
      reports: 0,
      artefacts: 0,
      pii_minimized: 0,
      llm_usage: 0,
    };
    const notes: string[] = [];

    if (categories.includes("reports")) {
      counts.reports = await this.purgeReports(
        opts.tenantId,
        cutoffDate(ttl.reports),
        opts.dryRun,
      );
    }
    if (categories.includes("artefacts")) {
      counts.artefacts = await this.purgeArtefacts(
        opts.tenantId,
        cutoffDate(ttl.artefacts),
        opts.dryRun,
      );
    }
    if (categories.includes("llm_usage")) {
      counts.llm_usage = await this.purgeLlm(
        opts.tenantId,
        cutoffDate(ttl.llm_usage),
        opts.dryRun,
      );
    }
    if (categories.includes("pii_minimized")) {
      counts.pii_minimized = await this.scrubPii(
        opts.tenantId,
        cutoffDate(ttl.pii_minimized),
        opts.dryRun,
      );
    }
    if (categories.includes("audit")) {
      const eligible = await this.countAudit(
        opts.tenantId,
        cutoffDate(ttl.audit),
      );
      if (opts.forceAuditPurge && !opts.dryRun) {
        counts.audit = await this.purgeAuditPhysical(
          opts.tenantId,
          cutoffDate(ttl.audit),
        );
        notes.push(
          "Purge physique audit demandée — chaîne re-génésée pour le reste du tenant.",
        );
      } else {
        counts.audit = eligible;
        notes.push(
          opts.dryRun
            ? `Audit : ${eligible} événement(s) éligible(s) (dry-run, pas de suppression physique par défaut).`
            : `Audit : ${eligible} éligible(s) — suppression physique désactivée (préserve verify_chain). Passer forceAuditPurge=true pour forcer.`,
        );
      }
    }

    const run = await this.prisma.purgeRun.create({
      data: {
        tenantId: opts.tenantId,
        dryRun: opts.dryRun,
        heldSkipped: false,
        categories,
        deletedCounts: counts,
        notes: notes.join(" ") || null,
        actorId: opts.actorId,
      },
    });

    await this.audit.append({
      tenantId: opts.tenantId,
      actorId: opts.actorId,
      action: opts.dryRun ? "retention.purge_dry_run" : "retention.purge",
      objectType: "purge_run",
      objectId: run.id,
      payload: {
        counts,
        categories,
        disclaimer: RETENTION_DISCLAIMER,
      },
    });

    return {
      run,
      heldSkipped: false as const,
      counts,
      disclaimer: RETENTION_DISCLAIMER,
      message: opts.dryRun
        ? "Dry-run : aucun enregistrement définitivement effacé."
        : "Purge contrôlée effectuée (hors hold).",
    };
  }

  listPurgeRuns(tenantId: string) {
    return this.prisma.purgeRun.findMany({
      where: { tenantId },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
  }

  private async purgeReports(
    tenantId: string,
    before: Date,
    dryRun: boolean,
  ): Promise<number> {
    const reports = await this.prisma.report.findMany({
      where: {
        createdAt: { lt: before },
        mission: { tenantId },
      },
      select: { id: true, exportPdfPath: true },
    });
    if (dryRun) return reports.length;
    for (const r of reports) {
      if (r.exportPdfPath) {
        await unlink(r.exportPdfPath).catch(() => undefined);
      }
      await this.prisma.report.delete({ where: { id: r.id } });
    }
    return reports.length;
  }

  private async purgeArtefacts(
    tenantId: string,
    before: Date,
    dryRun: boolean,
  ): Promise<number> {
    const jobs = await this.prisma.jobRun.findMany({
      where: {
        tenantId,
        createdAt: { lt: before },
      },
      select: { id: true, evidenceJson: true },
    });
    const withEvidence = jobs.filter((j) => j.evidenceJson != null);
    if (dryRun) return withEvidence.length;
    for (const j of withEvidence) {
      await this.prisma.jobRun.update({
        where: { id: j.id },
        data: {
          evidenceJson: {
            purged: true,
            purgedAt: new Date().toISOString(),
            note: "Artefact purgé (rétention R4 — hypothèse)",
          },
        },
      });
    }
    return withEvidence.length;
  }

  private async purgeLlm(
    tenantId: string,
    before: Date,
    dryRun: boolean,
  ): Promise<number> {
    const where = { tenantId, createdAt: { lt: before } };
    const n = await this.prisma.llmUsageLog.count({ where });
    if (dryRun) return n;
    const res = await this.prisma.llmUsageLog.deleteMany({ where });
    return res.count;
  }

  private async scrubPii(
    tenantId: string,
    before: Date,
    dryRun: boolean,
  ): Promise<number> {
    const findings = await this.prisma.finding.findMany({
      where: {
        createdAt: { lt: before },
        mission: { tenantId },
        technical: { not: null },
      },
      select: { id: true, technical: true },
    });
    // Minimisation : on scrub seulement si le champ technique semble contenir des motifs PII-like
    const toScrub = findings.filter((f) =>
      /@|email|phone|tel\.|password|secret|bearer\s/i.test(f.technical ?? ""),
    );
    if (dryRun) return toScrub.length;
    for (const f of toScrub) {
      await this.prisma.finding.update({
        where: { id: f.id },
        data: {
          technical:
            "[PURGED_PII_MINIMIZED] Contenu technique minimisé après TTL (hypothèse RGPD — pas une certification).",
        },
      });
    }
    return toScrub.length;
  }

  private countAudit(tenantId: string, before: Date) {
    return this.prisma.auditEvent.count({
      where: { tenantId, createdAt: { lt: before } },
    });
  }

  private async purgeAuditPhysical(
    tenantId: string,
    before: Date,
  ): Promise<number> {
    const res = await this.prisma.auditEvent.deleteMany({
      where: { tenantId, createdAt: { lt: before } },
    });
    // Tombstone pour traçabilité post-purge
    await this.audit.append({
      tenantId,
      action: "retention.audit_purged",
      objectType: "tenant",
      objectId: tenantId,
      payload: {
        deleted: res.count,
        disclaimer: RETENTION_DISCLAIMER,
      },
    });
    return res.count;
  }
}
