/**
 * Catalogue FICTIF / offline pour CI et démo.
 * CVE réelles publiques documentées — utilisées uniquement comme références
 * de matching version, sans preuve d'exploitation sur une cible.
 */
import type { VulnCandidate } from "../types";

export interface FixtureEntry {
  /** Clé normalisée name@version (minuscules) */
  packageKey: string;
  ecosystem: string;
  candidates: Omit<VulnCandidate, "confidence">[];
}

/** openssl 1.0.2k — versions anciennes largement documentées */
const OPENSSL_102K: FixtureEntry = {
  packageKey: "openssl@1.0.2k",
  ecosystem: "openssl",
  candidates: [
    {
      cveId: "CVE-2017-3731",
      severity: "medium",
      title: "OpenSSL truncated packet handling (réf. publique)",
      summary:
        "Entrée fixture OSV/NVD pour openssl 1.0.2k — matching passif uniquement.",
      kevListed: false,
      feedSources: ["osv", "nvd"],
      references: ["https://nvd.nist.gov/vuln/detail/CVE-2017-3731"],
    },
  ],
};

/** nginx 1.14.0 — version EOL typique en inventaire démo */
const NGINX_114: FixtureEntry = {
  packageKey: "nginx@1.14.0",
  ecosystem: "nginx",
  candidates: [
    {
      cveId: "CVE-2019-9511",
      severity: "high",
      title: "HTTP/2 excess resource (réf. publique nginx)",
      summary:
        "Entrée fixture — une version listée n'implique pas que le module HTTP/2 est actif.",
      kevListed: false,
      feedSources: ["osv", "nvd"],
      references: ["https://nvd.nist.gov/vuln/detail/CVE-2019-9511"],
    },
  ],
};

/** Entrée KEV bien connue — pour démontrer le flag kevListed (pas d'attaque) */
const LOG4J_FIXTURE: FixtureEntry = {
  packageKey: "log4j-core@2.14.1",
  ecosystem: "maven",
  candidates: [
    {
      cveId: "CVE-2021-44228",
      severity: "critical",
      title: "Log4Shell (réf. CISA KEV + NVD)",
      summary:
        "Fixture KEV : présente dans le catalogue CISA. Matching inventaire seed uniquement.",
      kevListed: true,
      feedSources: ["kev", "nvd", "osv"],
      references: [
        "https://nvd.nist.gov/vuln/detail/CVE-2021-44228",
        "https://www.cisa.gov/known-exploited-vulnerabilities-catalog",
      ],
    },
  ],
};

export const FIXTURE_ENTRIES: FixtureEntry[] = [
  OPENSSL_102K,
  NGINX_114,
  LOG4J_FIXTURE,
];

/** Sous-ensemble KEV pour mode fixture (CVE ids) */
export const FIXTURE_KEV_CVE_IDS = new Set(
  FIXTURE_ENTRIES.flatMap((e) =>
    e.candidates.filter((c) => c.kevListed).map((c) => c.cveId),
  ),
);

export function fixtureLookup(
  name: string,
  version: string,
): FixtureEntry | undefined {
  const key = `${name.toLowerCase()}@${version}`;
  return FIXTURE_ENTRIES.find((e) => e.packageKey === key);
}
