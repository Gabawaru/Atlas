/**
 * Durable Gabriel journal bridge — thin HTTP to API file store.
 * localStorage (sessionTraceLive) stays the offline/same-tab cache;
 * this survives reload + devices that share the same Atlas API.
 */
import type { TraceMessage } from "./sessionTrace";

export type TraceBridge = {
  apiBase: string;
  token: string;
};

export type DurablePullResult = {
  messages: TraceMessage[];
  bridge: "file" | "none" | "error";
  detail?: string;
};

/**
 * Session journal status line for durable hydrate.
 * Error path must keep pullDurableTrace `detail` (HTTP / Failed to fetch) —
 * otherwise Gab only sees a generic « cache local » with no diagnosis.
 */
export function formatDurableBridgeHint(
  bridge: DurablePullResult["bridge"],
  detail?: string,
): string | null {
  if (bridge === "file") return "Pont durable Atlas · API fichier";
  if (bridge === "error") {
    const d = detail?.trim();
    return d
      ? `Pont durable indisponible — cache local (${d})`
      : "Pont durable indisponible — cache local";
  }
  return null;
}

function baseUrl(apiBase: string): string {
  return `${apiBase.replace(/\/$/, "")}/v1/session/trace`;
}

export async function pullDurableTrace(
  bridge: TraceBridge,
): Promise<DurablePullResult> {
  try {
    const res = await fetch(baseUrl(bridge.apiBase), {
      headers: { Authorization: `Bearer ${bridge.token}` },
    });
    if (!res.ok) {
      return {
        messages: [],
        bridge: "error",
        detail: `HTTP ${res.status}`,
      };
    }
    const body = (await res.json()) as {
      messages?: TraceMessage[];
      bridge?: string;
    };
    const messages = Array.isArray(body.messages) ? body.messages : [];
    return { messages, bridge: "file" };
  } catch (e) {
    return {
      messages: [],
      bridge: "error",
      detail: e instanceof Error ? e.message : String(e),
    };
  }
}

export async function pushDurableTrace(
  msg: TraceMessage,
  bridge: TraceBridge | null | undefined,
): Promise<"ok" | "skipped" | "error"> {
  if (!bridge?.token) return "skipped";
  try {
    const res = await fetch(baseUrl(bridge.apiBase), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${bridge.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        id: msg.id,
        role: msg.role,
        text: msg.text,
        at: msg.at,
        details: msg.details ?? {},
      }),
    });
    return res.ok ? "ok" : "error";
  } catch {
    return "error";
  }
}
