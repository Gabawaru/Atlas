/**
 * Module MVP : présence web passive (DNS/HTTP publics).
 * Jamais hors périmètre ; rate limit + cancel ; pas de fuzzing ni crawl agressif.
 */

export const WEB_PASSIVE_MODULE_ID = "web.passive.presence.v1";

export interface WebPassiveTarget {
  host: string;
  url?: string;
}

export interface WebPassiveResult {
  host: string;
  dns: {
    resolved: boolean;
    addresses: string[];
    error?: string;
  };
  http?: {
    ok: boolean;
    status?: number;
    server?: string;
    contentType?: string;
    error?: string;
  };
  syntheticNote?: string;
}

export interface WebPassiveOptions {
  /** Hôtes autorisés (périmètre approuvé) — deny sinon */
  allowedHosts: Set<string>;
  rateLimitPerMinute: number;
  /** Annulation coopérative */
  isCancelled: () => boolean;
  /** Injection pour tests */
  lookupFn?: (host: string) => Promise<string[]>;
  fetchFn?: (url: string) => Promise<{
    status: number;
    headers: Record<string, string>;
  }>;
  sleepFn?: (ms: number) => Promise<void>;
}

function normalizeHost(value: string): string {
  try {
    if (value.includes("://")) {
      return new URL(value).hostname.toLowerCase();
    }
  } catch {
    /* fallthrough */
  }
  return value.toLowerCase().replace(/\.$/, "");
}

export function assertInScope(host: string, allowedHosts: Set<string>): void {
  const h = normalizeHost(host);
  const ok = [...allowedHosts].some(
    (a) => a === h || h.endsWith(`.${a}`) || a.endsWith(`.${h}`),
  );
  if (!ok && !allowedHosts.has(h)) {
    throw new Error(
      `TARGET_OUT_OF_SCOPE: ${h} hors périmètre approuvé — refus déterministe.`,
    );
  }
}

/**
 * Contrôle passif borné : résolution DNS + HEAD/GET unique, rate-limité.
 */
export async function runWebPassivePresence(
  targets: WebPassiveTarget[],
  opts: WebPassiveOptions,
): Promise<WebPassiveResult[]> {
  const results: WebPassiveResult[] = [];
  const intervalMs = Math.ceil(60_000 / Math.max(1, opts.rateLimitPerMinute));
  const sleep = opts.sleepFn ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  const lookup =
    opts.lookupFn ??
    (async (host: string) => {
      const dns = await import("node:dns/promises");
      return dns.lookup(host, { all: true }).then((a) => a.map((x) => x.address));
    });
  const fetchImpl =
    opts.fetchFn ??
    (async (url: string) => {
      const res = await fetch(url, {
        method: "HEAD",
        redirect: "manual",
        signal: AbortSignal.timeout(8_000),
      });
      const headers: Record<string, string> = {};
      res.headers.forEach((v, k) => {
        headers[k.toLowerCase()] = v;
      });
      return { status: res.status, headers };
    });

  for (const target of targets) {
    if (opts.isCancelled()) {
      break;
    }
    const host = normalizeHost(target.host || target.url || "");
    assertInScope(host, opts.allowedHosts);

    const entry: WebPassiveResult = {
      host,
      dns: { resolved: false, addresses: [] },
    };

    try {
      const addresses = await lookup(host);
      entry.dns = { resolved: addresses.length > 0, addresses };
    } catch (e) {
      entry.dns = {
        resolved: false,
        addresses: [],
        error: e instanceof Error ? e.message : String(e),
      };
    }

    const url = target.url ?? `https://${host}/`;
    try {
      const urlHost = normalizeHost(url);
      assertInScope(urlHost, opts.allowedHosts);
      const http = await fetchImpl(url);
      entry.http = {
        ok: http.status > 0 && http.status < 500,
        status: http.status,
        server: http.headers["server"],
        contentType: http.headers["content-type"],
      };
    } catch (e) {
      entry.http = {
        ok: false,
        error: e instanceof Error ? e.message : String(e),
      };
    }

    results.push(entry);
    await sleep(intervalMs);
  }

  return results;
}
