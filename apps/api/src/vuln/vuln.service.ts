import { Inject, Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { FEED_LICENSES, VERSION_MATCH_DISCLAIMER } from "./disclaimer";
import { VulnFeedsClient } from "./feeds.client";
import { mergeCandidates } from "./match";
import { parseServerBanner } from "./parse-identity";
import type { SoftwareIdentity, VulnCandidate } from "./types";

@Injectable()
export class VulnService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  feedsStatus() {
    const mode = new VulnFeedsClient().getMode();
    return {
      mode,
      disclaimer: VERSION_MATCH_DISCLAIMER,
      principle:
        "Confiance (matching) ≠ gravité (CVSS/KEV). Une correspondance de version ne confirme pas une vulnérabilité.",
      licenses: FEED_LICENSES,
      sources: ["osv", "nvd", "kev"] as const,
      aggressiveScan: false,
    };
  }

  listComponents(tenantId: string) {
    return this.prisma.softwareComponent.findMany({
      where: { tenantId },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
  }

  async upsertComponents(
    tenantId: string,
    identities: SoftwareIdentity[],
    opts: {
      missionId?: string;
      observedFrom: string;
      synthetic?: boolean;
    },
  ) {
    const created = [];
    for (const id of identities) {
      const row = await this.prisma.softwareComponent.create({
        data: {
          tenantId,
          missionId: opts.missionId,
          name: id.name.toLowerCase(),
          version: id.version,
          ecosystem: id.ecosystem ?? "generic",
          observedFrom: opts.observedFrom,
          synthetic: opts.synthetic ?? true,
          rawEvidence: id.rawEvidence,
        },
      });
      created.push(row);
    }
    return created;
  }

  /**
   * Matching passif inventaire → findings (confiance séparée de severity).
   */
  async matchTenantInventory(
    tenantId: string,
    actorId: string,
    opts?: { missionId?: string },
  ) {
    const components = await this.prisma.softwareComponent.findMany({
      where: {
        tenantId,
        ...(opts?.missionId ? { missionId: opts.missionId } : {}),
      },
      take: 50,
    });
    const client = new VulnFeedsClient();
    const all: VulnCandidate[] = [];
    for (const c of components) {
      const found = await client.matchIdentity({
        name: c.name,
        version: c.version,
        ecosystem: c.ecosystem,
        rawEvidence: c.rawEvidence ?? undefined,
      });
      all.push(...found);
    }
    const merged = mergeCandidates(all);

    let missionId = opts?.missionId;
    if (!missionId) {
      const m = await this.prisma.mission.findFirst({
        where: { tenantId },
        orderBy: { createdAt: "desc" },
      });
      missionId = m?.id;
    }
    if (!missionId) {
      return {
        matches: merged,
        findingsCreated: 0,
        disclaimer: VERSION_MATCH_DISCLAIMER,
        feedMetas: client.getMetas(),
        notice: "Aucun mission pour rattacher les findings",
      };
    }

    let created = 0;
    for (const cand of merged) {
      const existing = await this.prisma.finding.findFirst({
        where: { missionId, cveId: cand.cveId },
      });
      if (existing) continue;
      await this.prisma.finding.create({
        data: {
          missionId,
          severity: cand.severity === "unknown" ? "info" : cand.severity,
          confidence: cand.confidence,
          cveId: cand.cveId,
          kevListed: cand.kevListed,
          feedSources: cand.feedSources,
          matchDisclaimer: VERSION_MATCH_DISCLAIMER,
          title: `[FICTIF] ${cand.cveId} — ${cand.title}`,
          summary: `${cand.summary} Confiance matching: ${cand.confidence} (≠ gravité ${cand.severity}).`,
          technical: JSON.stringify(
            {
              cveId: cand.cveId,
              confidence: cand.confidence,
              severity: cand.severity,
              kevListed: cand.kevListed,
              feedSources: cand.feedSources,
              disclaimer: VERSION_MATCH_DISCLAIMER,
              references: cand.references ?? [],
            },
            null,
            2,
          ),
          synthetic: true,
        },
      });
      created += 1;
    }

    await this.audit.append({
      tenantId,
      actorId,
      action: "vuln.match",
      objectType: "mission",
      objectId: missionId,
      payload: {
        components: components.length,
        candidates: merged.length,
        findingsCreated: created,
        mode: client.getMode(),
        disclaimer: VERSION_MATCH_DISCLAIMER,
      },
    });

    return {
      matches: merged,
      findingsCreated: created,
      disclaimer: VERSION_MATCH_DISCLAIMER,
      feedMetas: client.getMetas(),
      principle: "confidence ≠ severity",
    };
  }

  /** Après contrôle web.passive : bannières → inventaire (+ match optionnel). */
  async ingestEvidenceBanners(
    tenantId: string,
    missionId: string,
    evidence: Array<{ http?: { server?: string } }>,
    actorId: string,
    synthetic: boolean,
  ) {
    const identities: SoftwareIdentity[] = [];
    for (const e of evidence) {
      identities.push(...parseServerBanner(e.http?.server));
    }
    if (identities.length === 0) {
      return { components: 0, match: null };
    }
    await this.upsertComponents(tenantId, identities, {
      missionId,
      observedFrom: "http_server",
      synthetic,
    });
    const match = await this.matchTenantInventory(tenantId, actorId, {
      missionId,
    });
    return { components: identities.length, match };
  }
}
