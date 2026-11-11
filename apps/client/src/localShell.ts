/** Thin client → Atlas Scan shell (:17865) + local API stubs. No secrets. */

export const LOCAL_SHELL_BASE =
  (typeof import.meta !== "undefined" &&
    (import.meta as ImportMeta & { env?: { VITE_ATLAS_SHELL_URL?: string } }).env
      ?.VITE_ATLAS_SHELL_URL) ||
  "http://127.0.0.1:17865";

export const LOCAL_API_BASE =
  (typeof import.meta !== "undefined" &&
    (import.meta as ImportMeta & { env?: { VITE_API_URL?: string } }).env
      ?.VITE_API_URL) ||
  "http://localhost:3001";

export type LocalShellCommandId = "healthz" | "start-api" | "api-health" | "launch-scan";

export type LocalShellCommand = {
  id: LocalShellCommandId;
  label: string;
  hint: string;
};

export const LOCAL_SHELL_COMMANDS: LocalShellCommand[] = [
  {
    id: "healthz",
    label: "Shell /healthz",
    hint: "Ping Atlas shell :17865",
  },
  {
    id: "start-api",
    label: "Démarrer API",
    hint: "POST /start-api → AtlasLocal start",
  },
  {
    id: "api-health",
    label: "API /v1/health",
    hint: "Ping API locale :3001",
  },
  {
    id: "launch-scan",
    label: "Lancer Scan",
    hint: "Retourne au Scanner (même écran, pas un 2ᵉ Scan)",
  },
];

export type LocalShellResult = {
  ok: boolean;
  commandId: LocalShellCommandId;
  status?: number;
  body: string;
  at: string;
};

export function shellUrl(path: string, base = LOCAL_SHELL_BASE): string {
  const root = base.replace(/\/$/, "");
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${root}${p}`;
}

export function apiHealthUrl(base = LOCAL_API_BASE): string {
  return `${base.replace(/\/$/, "")}/v1/health`;
}

function stamp(): string {
  return new Date().toISOString();
}

async function readBody(res: Response): Promise<string> {
  const text = await res.text();
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text || `(empty ${res.status})`;
  }
}

/**
 * Parité platform.html #77 : surface error + hint + lookedIn
 * instead of dumping raw JSON in Session terminal.
 */
export function formatStartApiFailureBody(raw: string, httpStatus: number): string {
  try {
    const data = JSON.parse(raw) as {
      ok?: boolean;
      error?: string;
      message?: string;
      hint?: string;
      lookedIn?: unknown;
    };
    const err =
      (typeof data.error === "string" && data.error) ||
      (typeof data.message === "string" && data.message) ||
      `HTTP ${httpStatus}`;
    const hint = typeof data.hint === "string" ? data.hint.trim() : "";
    let looked = "";
    if (Array.isArray(data.lookedIn)) {
      looked = data.lookedIn
        .slice(0, 6)
        .map((x) => String(x))
        .join(" · ");
    } else if (typeof data.lookedIn === "string") {
      looked = data.lookedIn;
    }
    const lines = [err];
    if (hint) lines.push(hint);
    if (looked) lines.push(`Cherché : ${looked}`);
    return lines.join("\n");
  } catch {
    return raw || `(empty ${httpStatus})`;
  }
}

/** Browser "Failed to fetch" when :17865 / :3001 is down — recovery line for Session terminal. */
export function formatLocalBridgeNetworkFailure(
  message: string,
  id: LocalShellCommandId,
): string {
  const err = message.trim() || "Failed to fetch";
  if (!/failed to fetch|networkerror|load failed|network request failed/i.test(err)) {
    return err;
  }
  if (id === "api-health") {
    return `${err}\nAPI hors ligne — Démarrer l'API (AtlasLocal) puis réessayez.`;
  }
  if (id === "healthz" || id === "start-api") {
    return `${err}\nShell hors ligne — lancez \`pnpm atlas:shell\` (http://127.0.0.1:17865).`;
  }
  return err;
}

/** Execute a local-bridge stub. `launch-scan` is UI-only (caller switches view). */
export async function runLocalShellCommand(
  id: LocalShellCommandId,
  opts?: { fetchImpl?: typeof fetch },
): Promise<LocalShellResult> {
  const fetchImpl = opts?.fetchImpl ?? fetch;
  const at = stamp();

  if (id === "launch-scan") {
    return {
      ok: true,
      commandId: id,
      body: "→ ouvrir Scanner (#scanner) — liability → Scan",
      at,
    };
  }

  try {
    if (id === "healthz") {
      const res = await fetchImpl(shellUrl("/healthz"), {
        method: "GET",
        cache: "no-store",
      });
      return {
        ok: res.ok,
        commandId: id,
        status: res.status,
        body: await readBody(res),
        at,
      };
    }
    if (id === "start-api") {
      const res = await fetchImpl(shellUrl("/start-api"), {
        method: "POST",
        cache: "no-store",
      });
      const ok = res.ok || res.status === 202;
      const raw = await res.text();
      let body: string;
      if (ok) {
        try {
          body = JSON.stringify(JSON.parse(raw), null, 2);
        } catch {
          body = raw || `(empty ${res.status})`;
        }
      } else {
        body = formatStartApiFailureBody(raw, res.status);
      }
      return {
        ok,
        commandId: id,
        status: res.status,
        body,
        at,
      };
    }
    if (id === "api-health") {
      const res = await fetchImpl(apiHealthUrl(), {
        method: "GET",
        cache: "no-store",
      });
      let body = await readBody(res);
      // Parity network-fail path: HTTP !ok still needs AtlasLocal recovery line.
      if (!res.ok) {
        const hint =
          "API hors ligne — Démarrer l'API (AtlasLocal) puis réessayez.";
        if (!body.includes("Démarrer l'API")) {
          body = body ? `${body}\n${hint}` : hint;
        }
      }
      return {
        ok: res.ok,
        commandId: id,
        status: res.status,
        body,
        at,
      };
    }
  } catch (e) {
    const raw = e instanceof Error ? e.message : String(e);
    return {
      ok: false,
      commandId: id,
      body: formatLocalBridgeNetworkFailure(raw, id),
      at,
    };
  }

  return { ok: false, commandId: id, body: "commande inconnue", at };
}
