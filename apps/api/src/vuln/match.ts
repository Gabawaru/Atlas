import { VERSION_MATCH_DISCLAIMER } from "./disclaimer";
import { fixtureLookup, FIXTURE_KEV_CVE_IDS } from "./fixtures/catalog";
import { normalizePackageKey } from "./parse-identity";
import type {
  MatchConfidence,
  SoftwareIdentity,
  VulnCandidate,
  VulnFeedSource,
} from "./types";

export { VERSION_MATCH_DISCLAIMER };

/**
 * Confiance selon la qualité de l'identité — indépendante de la gravité CVE.
 * Banner vague → low ; package+version exacte fixture/OSV → medium ;
 * + KEV ou multi-sources → high sur le matching (pas sur l'exploitabilité).
 */
export function confidenceForIdentity(
  identity: SoftwareIdentity,
  matchedSources: VulnFeedSource[],
  kevListed: boolean,
): MatchConfidence {
  const hasExactVersion = Boolean(identity.version && identity.name);
  if (!hasExactVersion) return "low";
  if (identity.name === "atlas-synthetic") return "low";
  if (kevListed && matchedSources.length >= 2) return "high";
  if (matchedSources.length >= 2) return "medium";
  if (identity.ecosystem && identity.ecosystem !== "generic") return "medium";
  if (identity.rawEvidence && /\/\d/.test(identity.rawEvidence)) return "medium";
  return "low";
}

export function matchFromFixtures(
  identity: SoftwareIdentity,
): VulnCandidate[] {
  const entry = fixtureLookup(identity.name, identity.version);
  if (!entry) return [];
  return entry.candidates.map((c) => {
    const kevListed = c.kevListed || FIXTURE_KEV_CVE_IDS.has(c.cveId);
    const feedSources = [...c.feedSources] as VulnFeedSource[];
    return {
      ...c,
      kevListed,
      feedSources,
      confidence: confidenceForIdentity(identity, feedSources, kevListed),
    };
  });
}

/**
 * Fusionne candidats (OSV/NVD/KEV) en dédoublonnant par CVE.
 * La confiance max gagne ; la severity reste celle du feed (jamais = confidence).
 */
export function mergeCandidates(list: VulnCandidate[]): VulnCandidate[] {
  const byCve = new Map<string, VulnCandidate>();
  const rank: Record<MatchConfidence, number> = { low: 1, medium: 2, high: 3 };
  for (const c of list) {
    const prev = byCve.get(c.cveId);
    if (!prev) {
      byCve.set(c.cveId, c);
      continue;
    }
    const sources = Array.from(
      new Set([...prev.feedSources, ...c.feedSources]),
    ) as VulnFeedSource[];
    const kevListed = prev.kevListed || c.kevListed;
    const confidence =
      rank[c.confidence] > rank[prev.confidence] ? c.confidence : prev.confidence;
    byCve.set(c.cveId, {
      ...prev,
      feedSources: sources,
      kevListed,
      confidence,
      // severity : on garde la plus haute déclarée par les feeds, pas la confidence
      severity: higherSeverity(prev.severity, c.severity),
    });
  }
  return [...byCve.values()];
}

const SEV_RANK: Record<string, number> = {
  critical: 5,
  high: 4,
  medium: 3,
  low: 2,
  info: 1,
  unknown: 0,
};

function higherSeverity(
  a: VulnCandidate["severity"],
  b: VulnCandidate["severity"],
): VulnCandidate["severity"] {
  return (SEV_RANK[a] ?? 0) >= (SEV_RANK[b] ?? 0) ? a : b;
}

export function packageKeyOf(identity: SoftwareIdentity): string {
  return normalizePackageKey(identity.name, identity.version);
}
