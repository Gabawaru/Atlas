/**
 * Live Gabriel journal bridge — append real scan/redirect events to
 * localStorage so `#session/trace` is not seed-only.
 */
import type { TraceMessage } from "./sessionTrace";

export const LIVE_TRACE_STORAGE_KEY = "atlas.gabriel.sessionTraceLive.v1";
export const LIVE_TRACE_EVENT = "atlas:gabriel-session-trace";
const MAX_LIVE = 80;

function canStore(): boolean {
  return typeof localStorage !== "undefined";
}

export function loadLiveTrace(
  storage: Storage | null = canStore() ? localStorage : null,
): TraceMessage[] {
  if (!storage) return [];
  try {
    const raw = storage.getItem(LIVE_TRACE_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isTraceMessage);
  } catch {
    return [];
  }
}

function isTraceMessage(x: unknown): x is TraceMessage {
  if (!x || typeof x !== "object") return false;
  const m = x as Partial<TraceMessage>;
  return (
    typeof m.id === "string" &&
    (m.role === "prompt" || m.role === "agent") &&
    typeof m.text === "string" &&
    typeof m.at === "string" &&
    typeof m.details === "object" &&
    m.details !== null
  );
}

function writeLive(
  items: TraceMessage[],
  storage: Storage | null = canStore() ? localStorage : null,
): void {
  if (!storage) return;
  storage.setItem(LIVE_TRACE_STORAGE_KEY, JSON.stringify(items.slice(-MAX_LIVE)));
}

function notify(msg: TraceMessage): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(LIVE_TRACE_EVENT, { detail: msg }));
}

/** Append one live bubble (dedupe by id). Returns the stored message. */
export function appendLiveTrace(
  input: {
    role: TraceMessage["role"];
    text: string;
    details?: TraceMessage["details"];
    id?: string;
    at?: string;
  },
  storage: Storage | null = canStore() ? localStorage : null,
): TraceMessage {
  const msg: TraceMessage = {
    id: input.id ?? `live-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    role: input.role,
    text: input.text,
    at: input.at ?? new Date().toISOString(),
    details: input.details ?? {},
  };
  const prev = loadLiveTrace(storage);
  if (prev.some((m) => m.id === msg.id)) return msg;
  writeLive([...prev, msg], storage);
  notify(msg);
  return msg;
}

export function mergeSeedAndLive(
  seed: TraceMessage[],
  live: TraceMessage[] = loadLiveTrace(),
): TraceMessage[] {
  const byId = new Map<string, TraceMessage>();
  for (const m of seed) byId.set(m.id, m);
  for (const m of live) byId.set(m.id, m);
  return [...byId.values()].sort((a, b) => a.at.localeCompare(b.at));
}

/** Scan CTA pressed — Gabriel intent. */
export function appendScanStarted(
  host: string,
  storage?: Storage | null,
): TraceMessage {
  const h = host.trim() || "(cible)";
  return appendLiveTrace(
    {
      role: "prompt",
      text: `Scan demandé — ${h}`,
      details: {
        commands: ["POST /v1/missions", "owner-authorization", "execute"],
        reasons: ["CTA Scanner · liability cochée"],
        communication: "Session Gabriel → agent Scan",
      },
    },
    storage,
  );
}

export function appendScanOutcome(
  args: {
    host: string;
    missionId: string;
    ok: boolean;
    detail: string;
    gateCode?: string;
  },
  storage?: Storage | null,
): TraceMessage {
  const h = args.host.trim() || "(cible)";
  if (args.ok) {
    return appendLiveTrace(
      {
        id: `scan-ok-${args.missionId}`,
        role: "agent",
        text: `Scan OK — ${h}`,
        details: {
          done: [`Mission ${args.missionId}`, args.detail],
          commands: [`POST /v1/missions/${args.missionId}/execute`],
          communication: "Agent → Gabriel : résultats Scanner",
        },
      },
      storage,
    );
  }
  return appendLiveTrace(
    {
      id: `scan-fail-${args.missionId}-${Date.now().toString(36)}`,
      role: "agent",
      text: `Scan bloqué — ${h}`,
      details: {
        done: [`Mission ${args.missionId}`],
        reasons: [args.detail],
        commands: args.gateCode ? [`gate ${args.gateCode}`] : undefined,
        communication: "Agent → Gabriel : échec / REJECT",
      },
    },
    storage,
  );
}

/** Report ready after refresh — one bubble per report id. */
export function appendReportAvailable(
  args: {
    missionId: string;
    reportId: string;
    host?: string;
  },
  storage?: Storage | null,
): TraceMessage {
  return appendLiveTrace(
    {
      id: `report-${args.reportId}`,
      role: "agent",
      text: args.host
        ? `Rapport prêt — ${args.host}`
        : `Rapport prêt — mission ${args.missionId.slice(0, 8)}…`,
      details: {
        done: [`report ${args.reportId}`, `mission ${args.missionId}`],
        communication: "Ingest Scanner → journal Gabriel",
      },
    },
    storage,
  );
}

/** Persist redirect bubble (same id as queue item when provided). */
export function appendRedirectTrace(
  args: {
    id: string;
    message: string;
    api: string;
  },
  storage?: Storage | null,
): TraceMessage {
  return appendLiveTrace(
    {
      id: args.id,
      role: "prompt",
      text: args.message.trim(),
      details: {
        reasons: ["Redirection agent sans redémarrage (session Gabriel)."],
        communication: `File locale + bridge API = ${args.api}`,
      },
    },
    storage,
  );
}
