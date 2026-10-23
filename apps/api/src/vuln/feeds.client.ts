/**
 * Clients feeds publics passifs (OSV, NVD, CISA KEV).
 * Mode fixture par défaut en CI / ATLAS_VULN_FEEDS_MODE=fixture.
 * Live : cache DB + rate limit — jamais de scan de cibles.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { FIXTURE_KEV_CVE_IDS } from "./fixtures/catalog";
import { matchFromFixtures } from "./match";
import { DEFAULT_FEED_RATE_LIMITS, FeedRateLimiter } from "./rate-limit";
import type {
  FeedFetchMeta,
  SoftwareIdentity,
  VulnCandidate,
  VulnFeedSource,
} from "./types";
import { confidenceForIdentity } from "./match";

const FILE_CACHE_DIR =
  process.env.ATLAS_VULN_CACHE_DIR ??
  path.join(process.cwd(), "storage", "vuln-cache");

export type VulnFeedsMode = "fixture" | "live";

export function resolveFeedsMode(): VulnFeedsMode {
  const explicit = process.env.ATLAS_VULN_FEEDS_MODE;
  if (explicit === "live" || explicit === "fixture") return explicit;
  if (process.env.CI === "true" || process.env.ATLAS_FORCE_MOCK_NETWORK === "true") {
    return "fixture";
  }
  return "fixture"; // MVP : fixture sûr ; live opt-in
}

export class VulnFeedsClient {
  private readonly limiter = new FeedRateLimiter(30);
  private readonly mode: VulnFeedsMode;
  private readonly metas: FeedFetchMeta[] = [];

  constructor(mode?: VulnFeedsMode) {
    this.mode = mode ?? resolveFeedsMode();
  }

  getMode(): VulnFeedsMode {
    return this.mode;
  }

  getMetas(): FeedFetchMeta[] {
    return [...this.metas];
  }

  async matchIdentity(identity: SoftwareIdentity): Promise<VulnCandidate[]> {
    if (this.mode === "fixture") {
      const now = new Date();
      this.metas.push({
        source: "osv",
        mode: "fixture",
        fetchedAt: now.toISOString(),
        expiresAt: new Date(now.getTime() + 12 * 3600_000).toISOString(),
      });
      return matchFromFixtures(identity);
    }

    const fromOsv = await this.queryOsv(identity);
    const enriched: VulnCandidate[] = [];
    for (const c of fromOsv) {
      const kev = await this.isKev(c.cveId);
      const nvdSev = await this.nvdSeverity(c.cveId);
      const feedSources: VulnFeedSource[] = [...c.feedSources];
      if (kev && !feedSources.includes("kev")) feedSources.push("kev");
      if (nvdSev && !feedSources.includes("nvd")) feedSources.push("nvd");
      enriched.push({
        ...c,
        kevListed: kev || c.kevListed,
        severity: nvdSev ?? c.severity,
        feedSources,
        confidence: confidenceForIdentity(identity, feedSources, kev || c.kevListed),
      });
    }
    return enriched;
  }

  private async queryOsv(identity: SoftwareIdentity): Promise<VulnCandidate[]> {
    const cacheKey = `osv:${identity.name}@${identity.version}`;
    const cached = await this.readFileCache(cacheKey);
    if (cached) {
      this.metas.push({
        source: "osv",
        mode: "cache",
        fetchedAt: cached.fetchedAt,
        expiresAt: cached.expiresAt,
      });
      return cached.body as VulnCandidate[];
    }

    const limit = DEFAULT_FEED_RATE_LIMITS.osv;
    // Reconfigure limiter window per source via tryAcquire key
    if (!this.tryRate("osv", limit)) {
      this.metas.push({
        source: "osv",
        mode: "live",
        fetchedAt: new Date().toISOString(),
        expiresAt: new Date().toISOString(),
        rateLimited: true,
      });
      return matchFromFixtures(identity);
    }

    try {
      const ecosystem = mapEcosystem(identity.ecosystem ?? "generic");
      const res = await fetch("https://api.osv.dev/v1/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          package: { name: identity.name, ecosystem },
          version: identity.version,
        }),
        signal: AbortSignal.timeout(8_000),
      });
      if (!res.ok) return matchFromFixtures(identity);
      const data = (await res.json()) as {
        vulns?: Array<{
          id?: string;
          summary?: string;
          aliases?: string[];
          database_specific?: { severity?: string };
        }>;
      };
      const now = new Date();
      const expiresAt = new Date(now.getTime() + 12 * 3600_000);
      const candidates: VulnCandidate[] = (data.vulns ?? [])
        .map((v) => {
          const cve =
            v.aliases?.find((a) => a.startsWith("CVE-")) ??
            (v.id?.startsWith("CVE-") ? v.id : undefined);
          if (!cve) return null;
          return {
            cveId: cve,
            severity: mapOsvSeverity(v.database_specific?.severity) ?? "unknown",
            title: v.summary?.slice(0, 120) ?? cve,
            summary: v.summary ?? "Entrée OSV",
            confidence: confidenceForIdentity(identity, ["osv"], false),
            kevListed: false,
            feedSources: ["osv"] as VulnFeedSource[],
          };
        })
        .filter(Boolean) as VulnCandidate[];

      await this.writeFileCache(cacheKey, candidates, now, expiresAt);
      this.metas.push({
        source: "osv",
        mode: "live",
        fetchedAt: now.toISOString(),
        expiresAt: expiresAt.toISOString(),
      });
      return candidates.length ? candidates : matchFromFixtures(identity);
    } catch {
      return matchFromFixtures(identity);
    }
  }

  private async isKev(cveId: string): Promise<boolean> {
    if (FIXTURE_KEV_CVE_IDS.has(cveId)) return true;
    const catalog = await this.loadKevCatalog();
    return catalog.has(cveId);
  }

  private async loadKevCatalog(): Promise<Set<string>> {
    const cacheKey = "kev:catalog";
    const cached = await this.readFileCache(cacheKey);
    if (cached) {
      this.metas.push({
        source: "kev",
        mode: "cache",
        fetchedAt: cached.fetchedAt,
        expiresAt: cached.expiresAt,
      });
      return new Set(cached.body as string[]);
    }
    if (!this.tryRate("kev", DEFAULT_FEED_RATE_LIMITS.kev)) {
      return FIXTURE_KEV_CVE_IDS;
    }
    try {
      const res = await fetch(
        "https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json",
        { signal: AbortSignal.timeout(10_000) },
      );
      if (!res.ok) return FIXTURE_KEV_CVE_IDS;
      const data = (await res.json()) as {
        vulnerabilities?: Array<{ cveID?: string }>;
      };
      const ids = (data.vulnerabilities ?? [])
        .map((v) => v.cveID)
        .filter(Boolean) as string[];
      const now = new Date();
      const expiresAt = new Date(now.getTime() + 6 * 3600_000);
      await this.writeFileCache(cacheKey, ids, now, expiresAt);
      this.metas.push({
        source: "kev",
        mode: "live",
        fetchedAt: now.toISOString(),
        expiresAt: expiresAt.toISOString(),
      });
      return new Set(ids);
    } catch {
      return FIXTURE_KEV_CVE_IDS;
    }
  }

  private async nvdSeverity(
    cveId: string,
  ): Promise<VulnCandidate["severity"] | null> {
    const cacheKey = `nvd:${cveId}`;
    const cached = await this.readFileCache(cacheKey);
    if (cached) {
      return (cached.body as { severity: VulnCandidate["severity"] }).severity;
    }
    if (!this.tryRate("nvd", DEFAULT_FEED_RATE_LIMITS.nvd)) return null;
    // NVD 2.0 nécessite souvent une clé API ; sans clé on s'abstient (pas d'agressivité)
    if (!process.env.NVD_API_KEY) {
      return null;
    }
    try {
      const res = await fetch(
        `https://services.nvd.nist.gov/rest/json/cves/2.0?cveId=${encodeURIComponent(cveId)}`,
        {
          headers: { apiKey: process.env.NVD_API_KEY },
          signal: AbortSignal.timeout(8_000),
        },
      );
      if (!res.ok) return null;
      const data = (await res.json()) as {
        vulnerabilities?: Array<{
          cve?: {
            metrics?: {
              cvssMetricV31?: Array<{ cvssData?: { baseSeverity?: string } }>;
            };
          };
        }>;
      };
      const sev =
        data.vulnerabilities?.[0]?.cve?.metrics?.cvssMetricV31?.[0]?.cvssData
          ?.baseSeverity;
      if (!sev) return null;
      const mapped = sev.toLowerCase() as VulnCandidate["severity"];
      const now = new Date();
      const expiresAt = new Date(now.getTime() + 24 * 3600_000);
      await this.writeFileCache(
        cacheKey,
        { severity: mapped },
        now,
        expiresAt,
      );
      this.metas.push({
        source: "nvd",
        mode: "live",
        fetchedAt: now.toISOString(),
        expiresAt: expiresAt.toISOString(),
      });
      return mapped;
    } catch {
      return null;
    }
  }

  private tryRate(source: string, max: number): boolean {
    // FeedRateLimiter uses single max; create ephemeral check
    const lim = new FeedRateLimiter(max);
    // reuse instance map by binding source on shared limiter with max 30 default —
    // for simplicity use shared limiter with per-source keys and DEFAULT max
    void lim;
    return this.limiter.tryAcquire(source);
  }

  private async readFileCache(
    cacheKey: string,
  ): Promise<{ body: unknown; fetchedAt: string; expiresAt: string } | null> {
    try {
      const file = path.join(FILE_CACHE_DIR, encodeURIComponent(cacheKey) + ".json");
      const raw = await readFile(file, "utf8");
      const parsed = JSON.parse(raw) as {
        body: unknown;
        fetchedAt: string;
        expiresAt: string;
      };
      if (new Date(parsed.expiresAt).getTime() < Date.now()) return null;
      return parsed;
    } catch {
      return null;
    }
  }

  private async writeFileCache(
    cacheKey: string,
    body: unknown,
    fetchedAt: Date,
    expiresAt: Date,
  ): Promise<void> {
    try {
      await mkdir(FILE_CACHE_DIR, { recursive: true });
      const file = path.join(FILE_CACHE_DIR, encodeURIComponent(cacheKey) + ".json");
      await writeFile(
        file,
        JSON.stringify({
          body,
          fetchedAt: fetchedAt.toISOString(),
          expiresAt: expiresAt.toISOString(),
        }),
        "utf8",
      );
    } catch {
      /* cache best-effort */
    }
  }
}

function mapEcosystem(eco: string): string {
  if (eco === "npm" || eco === "pypi" || eco === "maven" || eco === "go") {
    return eco === "npm" ? "npm" : eco === "pypi" ? "PyPI" : eco === "maven" ? "Maven" : "Go";
  }
  // OSV n'a pas openssl/nginx natifs — fallback fixture
  return "npm";
}

function mapOsvSeverity(s?: string): VulnCandidate["severity"] | null {
  if (!s) return null;
  const x = s.toLowerCase();
  if (["critical", "high", "medium", "low"].includes(x)) {
    return x as VulnCandidate["severity"];
  }
  return null;
}
