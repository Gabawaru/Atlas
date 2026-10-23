/**
 * Framework connecteurs Atlas MVP.
 * Permissions révocables, scopes explicites — l'IA ne connecte rien seule.
 */

export type ConnectorKind = "control" | "scm" | "inventory";

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
      "DNS/HTTP publics sur le périmètre approuvé — module de contrôle MVP réel.",
    kind: "control",
    productionReady: true,
    isStub: false,
    permissions: ["control:web.passive.execute"],
    scopes: ["assets:domain", "assets:url"],
    uxNeedIds: ["web_presence"],
    moduleIds: ["web.passive.presence.v1"],
    statusLabel: "Branché — utilisable après connexion + Policy Guard",
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
    moduleIds: [],
    statusLabel: "Stub non production — mock OAuth + révocation seulement",
  },
];

export function getCatalogEntry(id: string): ConnectorCatalogEntry | undefined {
  return CONNECTOR_CATALOG.find((c) => c.id === id);
}
