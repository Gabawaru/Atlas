/**
 * Deep-link entry from atlas-secu.com → local Atlas client.
 * RoE Gab: recon / scan / vuln / osint only on *.pragma-serve.com,
 * *.pragma-cloud.com, *.pragma.mc (+ apex pragma-serve.com).
 * Launch intent only prefills Scanner UX (RoE host allowlist still enforced).
 */

export const AUTHORIZED_ACTIONS = [
  "recon",
  "scan",
  "vuln",
  "osint",
] as const;

export type AuthorizedAction = (typeof AUTHORIZED_ACTIONS)[number];

export const AUTHORIZED_ACTION_LABELS: Record<AuthorizedAction, string> = {
  recon: "Reconnaissance",
  scan: "Scan",
  vuln: "Évaluation de vulnérabilités",
  osint: "OSINT",
};

/** Default in-scope apex for homepage / deep-link CTAs. */
export const DEFAULT_AUTHORIZED_HOST = "pragma-serve.com";

export const ROE_SCOPE_PATTERNS = [
  "*.pragma-serve.com",
  "*.pragma-cloud.com",
  "*.pragma.mc",
] as const;

/** Apexes listed in RoE §3 that `*.apex` wildcards do not cover.
 *  Only pragma-serve.com — policy-guard rejects bare pragma-cloud.com / pragma.mc.
 */
const ROE_EXPLICIT_APEXES = ["pragma-serve.com"] as const;

export type AuthorizedLaunchIntent = {
  action: AuthorizedAction;
  host: string;
  label: string;
};

export type AuthorizedLaunchResult =
  | { ok: true; intent: AuthorizedLaunchIntent }
  | { ok: false; reason: string };

export function normalizeLaunchHost(value: string): string {
  const raw = value.trim();
  try {
    if (raw.includes("://")) {
      return new URL(raw).hostname.toLowerCase().replace(/\.$/, "");
    }
  } catch {
    /* fallthrough */
  }
  let host = raw.toLowerCase().replace(/\.$/, "").split("/")[0] ?? "";
  if (host.includes(":") && !host.includes("::")) {
    host = host.split(":")[0] ?? host;
  }
  return host;
}

/** Fail-closed: only Gab RoE platform patterns (+ listed apexes). */
export function isAuthorizedRoeHost(host: string): boolean {
  const h = normalizeLaunchHost(host);
  if (!h || h.includes(" ") || h.includes("..") || h.includes(":")) {
    return false;
  }
  if ((ROE_EXPLICIT_APEXES as readonly string[]).includes(h)) return true;
  return ROE_SCOPE_PATTERNS.some((pattern) => {
    const suffix = pattern.slice(1); // ".apex"
    return h.endsWith(suffix) && h.length > suffix.length;
  });
}

export function isAuthorizedAction(
  value: string | null | undefined,
): value is AuthorizedAction {
  return (
    typeof value === "string" &&
    (AUTHORIZED_ACTIONS as readonly string[]).includes(value)
  );
}

/**
 * Parse `?action=&host=` (and optional hash `#scanner`) from a location-like object.
 * Missing action → not a launch deep-link (ok:false, empty reason).
 */
export function parseAuthorizedLaunch(
  search: string,
  defaultHost: string = DEFAULT_AUTHORIZED_HOST,
): AuthorizedLaunchResult {
  const params = new URLSearchParams(
    search.startsWith("?") ? search.slice(1) : search,
  );
  const actionRaw = params.get("action");
  if (!actionRaw) {
    return { ok: false, reason: "" };
  }
  if (!isAuthorizedAction(actionRaw)) {
    return {
      ok: false,
      reason: `Action « ${actionRaw} » non autorisée — utiliser recon|scan|vuln|osint.`,
    };
  }
  const hostRaw = params.get("host")?.trim() || defaultHost;
  const host = normalizeLaunchHost(hostRaw);
  if (!isAuthorizedRoeHost(host)) {
    return {
      ok: false,
      reason: `Cible « ${hostRaw} » hors RoE (*.pragma-serve.com, *.pragma-cloud.com, *.pragma.mc).`,
    };
  }
  return {
    ok: true,
    intent: {
      action: actionRaw,
      host,
      label: AUTHORIZED_ACTION_LABELS[actionRaw],
    },
  };
}

/**
 * Build local client deep-link used by atlas-secu.com capability CTAs.
 * Default origin is `http://localhost:3002`. Vite `server.host: true` also
 * serves `127.0.0.1:3002` (Atlas.exe / IPv4 bookmarks).
 */
export function authorizedLaunchHref(
  action: AuthorizedAction,
  host: string = DEFAULT_AUTHORIZED_HOST,
  origin: string = "http://localhost:3002",
): string {
  const q = new URLSearchParams({ action, host });
  return `${origin}/?${q.toString()}#scanner`;
}
