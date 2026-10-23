/** Avertissement métier — toujours joint aux findings issus d'un matching version. */
export const VERSION_MATCH_DISCLAIMER =
  "Une correspondance de version ne confirme pas une vulnérabilité. " +
  "Confiance (qualité du matching) ≠ gravité (CVSS / KEV). " +
  "Pas d'exploitation, pas de scan agressif — feeds publics passifs uniquement.";

export const FEED_LICENSES = {
  osv: {
    name: "OSV (Open Source Vulnerabilities)",
    url: "https://osv.dev/",
    license: "Données agrégées multi-sources — voir licence de chaque entrée OSV",
    freshness: "TTL cache local 12h (fixture en CI)",
  },
  nvd: {
    name: "NVD (NIST)",
    url: "https://nvd.nist.gov/",
    license: "Données gouvernementales US — usage soumis aux conditions NIST/NVD",
    freshness: "TTL cache local 24h ; rate limit strict (fixture en CI)",
  },
  kev: {
    name: "CISA Known Exploited Vulnerabilities",
    url: "https://www.cisa.gov/known-exploited-vulnerabilities-catalog",
    license: "Domaine public US (CISA)",
    freshness: "TTL cache local 6h (fixture en CI)",
  },
} as const;
