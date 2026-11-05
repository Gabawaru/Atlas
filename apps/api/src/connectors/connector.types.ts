/**
 * Framework connecteurs Atlas MVP.
 * Permissions révocables, scopes explicites — l'IA ne connecte rien seule.
 */

export type ConnectorKind =
  | "control"
  | "scm"
  | "inventory"
  | "enrichment"
  | "analyzer"
  | "cloud"
  | "ti"
  | "breach";

export interface ConnectorCatalogEntry {
  id: string;
  label: string;
  description: string;
  kind: ConnectorKind;
  /** false = ne pas présenter comme terminé / production */
  productionReady: boolean;
  isStub: boolean;
  permissions: string[];
  scopes: string[];
  uxNeedIds: string[];
  moduleIds: string[];
  statusLabel: string;
}

export const CONNECTOR_CATALOG: ConnectorCatalogEntry[] = [
  {
    id: "web.passive.presence",
    label: "Présence web passive",
    description:
      "DNS/HTTP publics sur le périmètre approuvé — module de contrôle MVP réel + suite hygiène web coopérative.",
    kind: "control",
    productionReady: true,
    isStub: false,
    permissions: ["control:web.passive.execute"],
    scopes: ["assets:domain", "assets:url"],
    uxNeedIds: ["web_presence"],
    moduleIds: [
      "web.passive.presence.v1",
      "web.observatory.passive.v1",
      "web.securityheaders.passive.v1",
      "web.ssllabs.passive.v1",
      "email.mail-auth.dns.passive.v1",
    ],
    statusLabel: "Branché — utilisable après connexion + Policy Guard",
  },
  {
    id: "asm.passive.enrichment",
    label: "Enrichissement ASM passif",
    description:
      "crt.sh / urlscan (et stubs Censys/Shodan/SecurityTrails) — requêtes passives in-scope après Policy Guard.",
    kind: "enrichment",
    productionReady: true,
    isStub: false,
    permissions: ["control:asm.passive.query"],
    scopes: ["assets:domain", "assets:url"],
    uxNeedIds: ["web_presence"],
    moduleIds: [
      "asm.crtsh.passive.v1",
      "asm.urlscan.passive.v1",
      "asm.censys.passive.v1",
      "asm.shodan.passive.v1",
      "asm.securitytrails.passive.v1",
    ],
    statusLabel: "Branché — suite coopérative (crt.sh/urlscan) ; SaaS stubs needs_config",
  },
  {
    id: "breach.hibp",
    label: "Have I Been Pwned",
    description:
      "Recherche breaches domaine via API HIBP (clé optionnelle HIBP_API_KEY).",
    kind: "breach",
    productionReady: true,
    isStub: false,
    permissions: ["control:breach.hibp.query"],
    scopes: ["assets:domain"],
    uxNeedIds: ["web_presence"],
    moduleIds: ["breach.hibp.passive.v1"],
    statusLabel: "Branché — needs_config sans HIBP_API_KEY (hors mock)",
  },
  {
    id: "ti.passive.enrichment",
    label: "Threat intel défensive",
    description:
      "OTX + VirusTotal (réputation) — enrichissement défensif uniquement, pas de recon offensive.",
    kind: "ti",
    productionReady: true,
    isStub: false,
    permissions: ["control:ti.passive.query"],
    scopes: ["assets:domain", "assets:url"],
    uxNeedIds: ["web_presence"],
    moduleIds: ["ti.otx.passive.v1", "ti.virustotal.passive.v1"],
    statusLabel: "Branché — OTX public ; VT needs VT_API_KEY",
  },
  {
    id: "sca.local.analyzers",
    label: "Analyseurs locaux SCA/SAST/secrets",
    description:
      "Trivy, Gitleaks, TruffleHog, Grype, Syft, Checkov, Semgrep, Bandit, Conftest — localPath mission uniquement.",
    kind: "analyzer",
    productionReady: true,
    isStub: false,
    permissions: ["control:sca.local.execute"],
    scopes: ["artefacts:local_path"],
    uxNeedIds: ["systems_software", "vuln_tracking"],
    moduleIds: [
      "sca.trivy.local.v1",
      "secrets.gitleaks.local.v1",
      "secrets.trufflehog.local.v1",
      "sca.osv.local.v1",
      "sca.grype.local.v1",
      "firmware.syft.local.v1",
      "cloud.checkov.local.v1",
      "sast.semgrep.local.v1",
      "sast.bandit.local.v1",
      "compliance.conftest.local.v1",
    ],
    statusLabel: "Branché — binaire local requis ; sinon binary_missing",
  },
  {
    id: "cloud.posture.auth",
    label: "Posture cloud authentifiée — STUB",
    description:
      "Prowler / AWS Backup restore — nécessite credentials cloud tenant (hors Paradise).",
    kind: "cloud",
    productionReady: false,
    isStub: true,
    permissions: ["control:cloud.posture.read"],
    scopes: ["cloud:account"],
    uxNeedIds: ["configs_access"],
    moduleIds: [
      "cloud.prowler.auth.v1",
      "backup.aws-restore.auth.v1",
    ],
    statusLabel: "Stub — credentials cloud non branchés",
  },
  {
    id: "github.read_only",
    label: "GitHub (lecture seule) — STUB",
    description:
      "Mock OAuth lecture seule. Non production. Aucun appel GitHub réel, aucune exécution de contrôle.",
    kind: "scm",
    productionReady: false,
    isStub: true,
    permissions: ["scm:github:read_meta"],
    scopes: ["repo:read_metadata"],
    uxNeedIds: ["systems_software"],
    moduleIds: ["sca.dependabot.auth.v1", "secrets.github-scanning.auth.v1"],
    statusLabel: "Stub non production — mock OAuth + révocation seulement",
  },
];

export function getCatalogEntry(id: string): ConnectorCatalogEntry | undefined {
  return CONNECTOR_CATALOG.find((c) => c.id === id);
}
