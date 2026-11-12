/** Gab → Ben notification — mirrors docs/roe-bot-reports.md (Verdict / Faits / Bloquants). */

export type GabNotification = {
  id: string;
  source: "gab";
  at: string;
  /** Short list title — usually the Verdict line. */
  title: string;
  verdict: string;
  faits: string;
  bloquants: string;
  next?: string;
  read: boolean;
  /** True when Ben must act (ping / non-empty bloquant). */
  needsBen: boolean;
};

export const NOTIFICATIONS_MAX = 50;

export function isGabNotification(x: unknown): x is GabNotification {
  if (!x || typeof x !== "object") return false;
  const n = x as Partial<GabNotification>;
  return (
    typeof n.id === "string" &&
    n.source === "gab" &&
    typeof n.at === "string" &&
    typeof n.title === "string" &&
    typeof n.verdict === "string" &&
    typeof n.faits === "string" &&
    typeof n.bloquants === "string" &&
    typeof n.read === "boolean" &&
    typeof n.needsBen === "boolean" &&
    (n.next === undefined || typeof n.next === "string")
  );
}

/** Seed parsed from Project store docs/roe-bot-reports.md (2026-11-12). */
export const GAB_NOTIFICATION_SEED: GabNotification[] = [
  {
    id: "gab-2026-11-12T15-06-42",
    source: "gab",
    at: "2026-11-12T14:06:42.000Z",
    title: "§3 stable vs carto — 1 delta only (`sign.pragma.mc` title)",
    verdict: "§3 stable vs carto — 1 delta only (`sign.pragma.mc` title)",
    faits:
      "Recheck GET+HEAD `/` on 13 §3 hosts. Status/redirects/HSTS/CF match carto for 12/13. Delta: `sign.pragma.mc` now serves `<title>Pragma Sign</title>`.",
    bloquants: "aucun",
    next: "queue #2 — enrich §4 `*-dev` sample / confirm CF 404 stubs",
    read: true,
    needsBen: false,
  },
  {
    id: "gab-2026-11-12T15-14-23",
    source: "gab",
    at: "2026-11-12T14:14:23.000Z",
    title: "§4 axe4 sample still all CF 404 stubs (7/7)",
    verdict: "§4 axe4 sample still all CF 404 stubs (7/7)",
    faits:
      "Known `*-dev` from axe4: atlas-dev, pragma-dev, serve-dev, demo-dev, staging-dev, preview-dev, gtm-dev. GET+HEAD `/` → 404 · Cloudflare · no HSTS.",
    bloquants: "aucun",
    next: "queue #3 — wiki services ↔ RoE §3 gaps only",
    read: true,
    needsBen: false,
  },
  {
    id: "gab-2026-11-12T15-15-19-wiki",
    source: "gab",
    at: "2026-11-12T14:15:19.000Z",
    title: "§3↔wiki coverage complete (13/13); cross-link + freshness gaps only",
    verdict:
      "§3↔wiki coverage complete (13/13); cross-link + freshness gaps only",
    faits:
      "Every §3 host has a wiki service page + README row. Gaps: carto Related links; stale wiki vs live/carto on ai/gtm/web.",
    bloquants: "aucun",
    next: "queue #4 idle — wait Ben OK for more",
    read: false,
    needsBen: false,
  },
  {
    id: "gab-2026-11-12T15-15-19-idle",
    source: "gab",
    at: "2026-11-12T14:15:20.000Z",
    title: "File idle — rien d’autre sans OK Ben",
    verdict: "File idle — rien d’autre sans OK Ben",
    faits:
      "Queue 1–3 done (§3 recheck · §4 axe4 stubs · wiki gaps). Hors lecture seule / §5 / mass-scan = stop.",
    bloquants: "aucun (idle volontaire)",
    next: "attendre Ben — priorités suivantes / OK wiki refresh / hors RoE",
    read: false,
    needsBen: true,
  },
];
