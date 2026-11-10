/**
 * Redirect Gabriel’s running agent without restart.
 *
 * Bridge (client-side, as far as Atlas can wire today):
 * 1. Local queue — `localStorage` key + `CustomEvent` for same-tab / tooling listeners
 * 2. Optional API — POST `/v1/conversation` (assistant chat; no execute) when token present
 *
 * Full Cloud Agent mid-run redirect is out of band; this is the product hook.
 */

export const AGENT_REDIRECT_STORAGE_KEY = "atlas.gabriel.agentRedirectQueue";
export const AGENT_REDIRECT_EVENT = "atlas:gabriel-agent-redirect";

export type AgentRedirectPayload = {
  id: string;
  /** Message from Gabriel to redirect the agent. */
  message: string;
  at: string;
  /** Session owner — always Gabriel for this surface. */
  sessionOwner: "gabriel";
};

export type AgentRedirectResult = {
  queued: AgentRedirectPayload;
  api: "ok" | "skipped" | "error";
  apiDetail?: string;
};

function readQueue(): AgentRedirectPayload[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(AGENT_REDIRECT_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as AgentRedirectPayload[]) : [];
  } catch {
    return [];
  }
}

function writeQueue(items: AgentRedirectPayload[]): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(AGENT_REDIRECT_STORAGE_KEY, JSON.stringify(items));
}

export function listAgentRedirects(): AgentRedirectPayload[] {
  return readQueue();
}

/**
 * Enqueue a redirect for Gabriel’s agent and optionally POST to Atlas assistant.
 */
export async function sendAgentRedirect(args: {
  message: string;
  apiBase: string;
  token: string | null;
}): Promise<AgentRedirectResult> {
  const trimmed = args.message.trim();
  if (!trimmed) {
    throw new Error("Message vide.");
  }
  const payload: AgentRedirectPayload = {
    id: `redir-${Date.now().toString(36)}`,
    message: trimmed,
    at: new Date().toISOString(),
    sessionOwner: "gabriel",
  };
  const next = [...readQueue(), payload].slice(-40);
  writeQueue(next);
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent(AGENT_REDIRECT_EVENT, { detail: payload }),
    );
  }

  if (!args.token) {
    return { queued: payload, api: "skipped", apiDetail: "Pas de jeton session." };
  }

  try {
    const res = await fetch(`${args.apiBase.replace(/\/$/, "")}/v1/conversation`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${args.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: `[Gabriel redirect] ${trimmed}`,
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      return {
        queued: payload,
        api: "error",
        apiDetail: body || `HTTP ${res.status}`,
      };
    }
    return { queued: payload, api: "ok" };
  } catch (e) {
    return {
      queued: payload,
      api: "error",
      apiDetail: e instanceof Error ? e.message : String(e),
    };
  }
}
