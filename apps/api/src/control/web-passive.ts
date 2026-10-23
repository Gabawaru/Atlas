/**
 * Module MVP : présence web passive (DNS/HTTP publics).
 * Preuves réelles par défaut ; jamais hors périmètre ; rate limit + cancel.
 * Pas de fuzzing, pas de crawl agressif, pas de login.
 */
import { createHash } from "node:crypto";
import { connect as tlsConnect } from "node:tls";

export const WEB_PASSIVE_MODULE_ID = "web.passive.presence.v1";

export interface WebPassiveTarget {
  host: string;
  url?: string;
}

export interface WebPassiveDnsEvidence {
  resolved: boolean;
  addresses: string[];
  aaaa?: string[];
  lookupMs?: number;
  error?: string;
}

export interface WebPassiveHttpEvidence {
  ok: boolean;
  method: "HEAD" | "GET";
  url: string;
  status?: number;
  server?: string;
  contentType?: string;
  hsts?: string;
  bodySha256?: string;
  bodyBytesSampled?: number;
  observedAt?: string;
  error?: string;
}

export interface WebPassiveTlsEvidence {
  protocol?: string;
  authorized?: boolean;
  subjectCN?: string;
  issuerCN?: string;
  validFrom?: string;
  validTo?: string;
  fingerprint256?: string;
  error?: string;
}

export interface WebPassiveResult {
  host: string;
  inScope: true;
  observedAt: string;
  dns: WebPassiveDnsEvidence;
  http?: WebPassiveHttpEvidence;
  tls?: WebPassiveTlsEvidence;
  evidenceHash: string;
  /** true si mocks réseau injectés (tests / offline forcé) */
  networkMocked?: boolean;
}

export interface WebPassiveProgress {
  current: number;
  total: number;
  host: string;
  message: string;
}

export interface WebPassiveOptions {
  allowedHosts: Set<string>;
  rateLimitPerMinute: number;
  isCancelled: () => boolean;
  onProgress?: (p: WebPassiveProgress) => void | Promise<void>;
  /** Injection tests uniquement */
  lookupFn?: (host: string) => Promise<{ a: string[]; aaaa: string[] }>;
  fetchFn?: (url: string) => Promise<{
    status: number;
    headers: Record<string, string>;
    bodySha256?: string;
    bodyBytesSampled?: number;
  }>;
  tlsFn?: (host: string) => Promise<WebPassiveTlsEvidence>;
  sleepFn?: (ms: number) => Promise<void>;
}

export function normalizeHost(value: string): string {
  try {
    if (value.includes("://")) {
      return new URL(value).hostname.toLowerCase();
    }
  } catch {
    /* fallthrough */
  }
  return value.toLowerCase().replace(/\.$/, "").split("/")[0]!;
}

/**
 * Allowlist stricte : hôte exact ou sous-domaine d'un domaine du scope.
 * Refuse les IP littérales hors liste et les hosts non listés.
 */
export function assertInScope(host: string, allowedHosts: Set<string>): void {
  const h = normalizeHost(host);
  if (!h || h.includes(" ") || h.includes("..")) {
    throw new Error(`TARGET_OUT_OF_SCOPE: hôte invalide « ${h} »`);
  }
  const normalizedAllow = new Set(
    [...allowedHosts].map((a) => normalizeHost(a)),
  );
  const ok = [...normalizedAllow].some(
    (a) => h === a || h.endsWith(`.${a}`),
  );
  if (!ok) {
    throw new Error(
      `TARGET_OUT_OF_SCOPE: ${h} hors périmètre approuvé — refus déterministe.`,
    );
  }
}

function hashEvidence(payload: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(payload))
    .digest("hex");
}

async function realDnsLookup(
  host: string,
): Promise<{ a: string[]; aaaa: string[] }> {
  const dns = await import("node:dns/promises");
  const [a, aaaa] = await Promise.all([
    dns.resolve4(host).catch(() => [] as string[]),
    dns.resolve6(host).catch(() => [] as string[]),
  ]);
  if (a.length === 0 && aaaa.length === 0) {
    // fallback lookup unique
    const all = await dns.lookup(host, { all: true });
    return {
      a: all.filter((x) => x.family === 4).map((x) => x.address),
      aaaa: all.filter((x) => x.family === 6).map((x) => x.address),
    };
  }
  return { a, aaaa };
}

async function realHttpProbe(url: string): Promise<{
  status: number;
  headers: Record<string, string>;
  bodySha256?: string;
  bodyBytesSampled?: number;
}> {
  // HEAD d'abord (passif) ; si refusé, un GET tronqué unique
  let res = await fetch(url, {
    method: "HEAD",
    redirect: "manual",
    signal: AbortSignal.timeout(8_000),
  });
  const headers: Record<string, string> = {};
  res.headers.forEach((v, k) => {
    headers[k.toLowerCase()] = v;
  });

  let bodySha256: string | undefined;
  let bodyBytesSampled: number | undefined;

  if (res.status === 405 || res.status === 501 || res.status === 403) {
    res = await fetch(url, {
      method: "GET",
      redirect: "manual",
      signal: AbortSignal.timeout(8_000),
      headers: { Range: "bytes=0-2047" },
    });
    res.headers.forEach((v, k) => {
      headers[k.toLowerCase()] = v;
    });
    const buf = Buffer.from(await res.arrayBuffer());
    const sample = buf.subarray(0, Math.min(buf.length, 2048));
    bodyBytesSampled = sample.length;
    bodySha256 = createHash("sha256").update(sample).digest("hex");
  }

  return { status: res.status, headers, bodySha256, bodyBytesSampled };
}

async function realTlsProbe(host: string): Promise<WebPassiveTlsEvidence> {
  return new Promise((resolve) => {
    const socket = tlsConnect(
      { host, port: 443, servername: host, rejectUnauthorized: false },
      () => {
        const cert = socket.getPeerCertificate();
        const proto = socket.getProtocol() ?? undefined;
        const authorized = socket.authorized;
        socket.end();
        if (!cert || Object.keys(cert).length === 0) {
          resolve({ error: "Pas de certificat pair" });
          return;
        }
        const cn = (v: string | string[] | undefined) =>
          Array.isArray(v) ? v[0] : v;
        resolve({
          protocol: proto ?? undefined,
          authorized,
          subjectCN: cn(cert.subject?.CN),
          issuerCN: cn(cert.issuer?.CN),
          validFrom: cert.valid_from,
          validTo: cert.valid_to,
          fingerprint256: cert.fingerprint256,
        });
      },
    );
    socket.setTimeout(8_000, () => {
      socket.destroy();
      resolve({ error: "TLS timeout" });
    });
    socket.on("error", (e) => {
      resolve({ error: e.message });
    });
  });
}

/**
 * Contrôle passif borné : DNS + HTTP (+ TLS si https), rate-limité, annulable.
 */
export async function runWebPassivePresence(
  targets: WebPassiveTarget[],
  opts: WebPassiveOptions,
): Promise<WebPassiveResult[]> {
  const results: WebPassiveResult[] = [];
  const intervalMs = Math.ceil(60_000 / Math.max(1, opts.rateLimitPerMinute));
  const sleep =
    opts.sleepFn ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  const networkMocked = Boolean(opts.lookupFn || opts.fetchFn);
  const lookup = opts.lookupFn ?? realDnsLookup;
  const fetchImpl = opts.fetchFn ?? realHttpProbe;
  const tlsImpl = opts.tlsFn ?? realTlsProbe;

  const total = targets.length;
  for (let i = 0; i < targets.length; i++) {
    if (opts.isCancelled()) {
      break;
    }
    const target = targets[i]!;
    const host = normalizeHost(target.host || target.url || "");
    assertInScope(host, opts.allowedHosts);

    await opts.onProgress?.({
      current: i + 1,
      total,
      host,
      message: `Contrôle passif ${i + 1}/${total} — ${host}`,
    });

    const observedAt = new Date().toISOString();
    const entryCore: Omit<WebPassiveResult, "evidenceHash"> = {
      host,
      inScope: true,
      observedAt,
      dns: { resolved: false, addresses: [] },
      networkMocked: networkMocked || undefined,
    };

    const t0 = Date.now();
    try {
      const rec = await lookup(host);
      entryCore.dns = {
        resolved: rec.a.length + rec.aaaa.length > 0,
        addresses: rec.a,
        aaaa: rec.aaaa,
        lookupMs: Date.now() - t0,
      };
    } catch (e) {
      entryCore.dns = {
        resolved: false,
        addresses: [],
        lookupMs: Date.now() - t0,
        error: e instanceof Error ? e.message : String(e),
      };
    }

    const url = target.url ?? `https://${host}/`;
    const urlHost = normalizeHost(url);
    assertInScope(urlHost, opts.allowedHosts);

    try {
      const http = await fetchImpl(url);
      entryCore.http = {
        ok: http.status > 0 && http.status < 500,
        method: http.bodySha256 ? "GET" : "HEAD",
        url,
        status: http.status,
        server: http.headers["server"],
        contentType: http.headers["content-type"],
        hsts: http.headers["strict-transport-security"],
        bodySha256: http.bodySha256,
        bodyBytesSampled: http.bodyBytesSampled,
        observedAt: new Date().toISOString(),
      };
    } catch (e) {
      entryCore.http = {
        ok: false,
        method: "HEAD",
        url,
        error: e instanceof Error ? e.message : String(e),
        observedAt: new Date().toISOString(),
      };
    }

    if (url.startsWith("https://") && !opts.isCancelled()) {
      entryCore.tls = await tlsImpl(host);
    }

    const evidenceHash = hashEvidence(entryCore);
    results.push({ ...entryCore, evidenceHash });
    await sleep(intervalMs);
  }

  return results;
}
