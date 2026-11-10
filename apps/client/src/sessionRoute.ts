/** Hash routes for authenticated Atlas client views (Gabriel session + Scanner). */

export type SessionRoute =
  | "session"
  | "session-trace"
  | "scanner"
  | "tracking"
  | "terminal";

/**
 * Parse `location.hash` into a client route.
 * Accepts `#session`, `#session/trace`, `#trace`, `#scanner`,
 * `#suivi` / `#tracking`, `#terminal` / `#session-term` / `#local`.
 */
export function parseSessionHash(hash: string): SessionRoute {
  const raw = hash.replace(/^#/, "").trim().toLowerCase();
  if (raw === "session/trace" || raw === "trace") return "session-trace";
  if (raw === "scanner") return "scanner";
  if (raw === "suivi" || raw === "tracking" || raw === "archive") {
    return "tracking";
  }
  if (raw === "terminal" || raw === "session-term" || raw === "local") {
    return "terminal";
  }
  return "session";
}

export function hashForRoute(route: SessionRoute): string {
  if (route === "session-trace") return "#session/trace";
  if (route === "scanner") return "#scanner";
  if (route === "tracking") return "#suivi";
  if (route === "terminal") return "#terminal";
  return "#session";
}
