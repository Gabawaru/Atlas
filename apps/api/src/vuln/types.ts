/** Confiance du matching — jamais confondue avec severity/CVSS. */
export type MatchConfidence = "low" | "medium" | "high";

export type VulnFeedSource = "osv" | "nvd" | "kev";

export interface SoftwareIdentity {
  name: string;
  version: string;
  ecosystem?: string;
  /** Banner / raw string that produced this identity */
  rawEvidence?: string;
}

export interface VulnCandidate {
  cveId: string;
  /** Gravité déclarée par le feed (peut être absente) — ≠ confidence */
  severity: "critical" | "high" | "medium" | "low" | "info" | "unknown";
  title: string;
  summary: string;
  confidence: MatchConfidence;
  kevListed: boolean;
  feedSources: VulnFeedSource[];
  references?: string[];
}

export interface FeedFetchMeta {
  source: VulnFeedSource;
  mode: "fixture" | "live" | "cache";
  fetchedAt: string;
  expiresAt: string;
  rateLimited?: boolean;
}
