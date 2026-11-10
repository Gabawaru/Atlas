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
      return {
        ok: res.ok || res.status === 202,
        commandId: id,
        status: res.status,
        body: await readBody(res),
        at,
      };
    }
    if (id === "api-health") {
      const res = await fetchImpl(apiHealthUrl(), {
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
  } catch (e) {
    return {
      ok: false,
      commandId: id,
      body: e instanceof Error ? e.message : String(e),
      at,
    };
  }

  return { ok: false, commandId: id, body: "commande inconnue", at };
}
