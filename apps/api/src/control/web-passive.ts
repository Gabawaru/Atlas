/**
 * Module MVP : présence web passive (DNS/HTTP/TLS publics).
 * Preuves réelles par défaut ; jamais hors périmètre ; rate limit + cancel.
 * Pas de fuzzing, pas de crawl agressif, pas de login, pas de découverte brute.
 */
import { createHash } from "node:crypto";
import { connect as tlsConnect } from "node:tls";

export const WEB_PASSIVE_MODULE_ID = "web.passive.presence.v1";

/** Sous-domaines courants sondés uniquement si le domaine parent est au scope */
export const COMMON_IN_SCOPE_SUBDOMAINS = ["www", "mail", "api"] as const;

export interface WebPassiveTarget {
  host: string;
  url?: string;
}

export interface WebPassiveDnsEvidence {
  resolved: boolean;
  addresses: string[];
  aaaa?: string[];
  ns?: string[];
  mx?: string[];
  txtSample?: string[];
  lookupMs?: number;
  error?: string;
}

export interface WebPassiveSecurityHeaders {
  hsts?: string;
  csp?: string;
  xFrameOptions?: string;
  xContentTypeOptions?: string;
  referrerPolicy?: string;
  permissionsPolicy?: string;
  /** Headers de base absents (observation, pas d'attaque) */
  missing: string[];
}

export interface WebPassiveHttpEvidence {
  ok: boolean;
  method: "HEAD" | "GET";
  url: string;
  status?: number;
  server?: string;
  contentType?: string;
  hsts?: string;
  securityHeaders?: WebPassiveSecurityHeaders;
  bodySha256?: string;
  bodyBytesSampled?: number;
  observedAt?: string;
  error?: string;
}

export interface WebPassiveTlsEvidence {
  protocol?: string;
  authorized?: boolean;
  subjectCN?: string;
  subjectSANs?: string[];
  issuerCN?: string;
  validFrom?: string;
  validTo?: string;
  daysRemaining?: number;
  fingerprint256?: string;
  error?: string;
}

/**
 * OSINT passif public (RDAP) — in-scope uniquement.
 * Limites : une requête RDAP GET publique ; pas de scrape WHOIS legacy,
 * pas d'énumération, pas de sources payantes, pas hors périmètre.
 */
export interface WebPassiveOsintEvidence {
  source: "rdap";
  query: string;
  ok: boolean;
  handle?: string;
  registrar?: string;
  status?: string[];
  nameservers?: string[];
  events?: { action?: string; date?: string }[];
  rdapUrl?: string;
  disclaimer: string;
  error?: string;
}

export interface WebPassiveResult {
  host: string;
  inScope: true;
  observedAt: string;
  dns: WebPassiveDnsEvidence;
  http?: WebPassiveHttpEvidence;
  tls?: WebPassiveTlsEvidence;
  /** Présent sur apex in-scope uniquement */
  osint?: WebPassiveOsintEvidence;
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
  /** Hôtes exclus du RoE — refus même si autrement in-scope */
  exclusions?: Set<string>;
  rateLimitPerMinute: number;
  isCancelled: () => boolean;
  onProgress?: (p: WebPassiveProgress) => void | Promise<void>;
  lookupFn?: (host: string) => Promise<{
    a: string[];
    aaaa: string[];
    ns?: string[];
    mx?: string[];
    txt?: string[];
  }>;
  fetchFn?: (url: string) => Promise<{
    status: number;
    headers: Record<string, string>;
    bodySha256?: string;
    bodyBytesSampled?: number;
  }>;
  tlsFn?: (host: string) => Promise<WebPassiveTlsEvidence>;
  /** Injection tests — RDAP / OSINT public */
  rdapFn?: (host: string) => Promise<WebPassiveOsintEvidence>;
  sleepFn?: (ms: number) => Promise<void>;
  /** default true — sondes www/mail/api in-scope ; false en fixtures unitaires */
  expandCommonSubdomains?: boolean;
  /** default true — RDAP apex in-scope */
  includeOsintRdap?: boolean;
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

export function isExcluded(
  host: string,
  exclusions: Set<string> | undefined,
): boolean {
  if (!exclusions || exclusions.size === 0) return false;
  const h = normalizeHost(host);
  const excl = [...exclusions].map((e) => normalizeHost(e));
  // Exact ou sous-domaine d'une exclusion — pas l'inverse (exclure mail.x ne bloque pas x)
  return excl.some((e) => h === e || h.endsWith(`.${e}`));
}

/**
 * Allowlist stricte : hôte exact ou sous-domaine d'un domaine du scope.
 * Refuse exclusions RoE, IP hors liste et hosts non listés.
 */
export function assertInScope(
  host: string,
  allowedHosts: Set<string>,
  exclusions?: Set<string>,
): void {
  const h = normalizeHost(host);
  if (!h || h.includes(" ") || h.includes("..")) {
    throw new Error(`TARGET_OUT_OF_SCOPE: hôte invalide « ${h} »`);
  }
  if (isExcluded(h, exclusions)) {
    throw new Error(
      `TARGET_OUT_OF_SCOPE: ${h} exclu par le RoE (exclusions) — refus déterministe.`,
    );
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

/**
 * Élargit les cibles avec sous-domaines courants UNIQUEMENT si le parent
 * est un domaine « apex » au scope (au moins 2 labels après le TLD, ex. example.com)
 * et que le FQDN n'est pas exclu. Pas de découverte brute.
 * Désactivable via expandCommonSubdomains=false (tests unitaires bornés).
 */
export function expandPassiveTargets(
  targets: WebPassiveTarget[],
  allowedHosts: Set<string>,
  exclusions?: Set<string>,
  expandCommonSubdomains = true,
): WebPassiveTarget[] {
  const seen = new Set<string>();
  const out: WebPassiveTarget[] = [];
  const push = (t: WebPassiveTarget) => {
    const h = normalizeHost(t.host || t.url || "");
    if (!h || seen.has(h)) return;
    try {
      assertInScope(h, allowedHosts, exclusions);
    } catch {
      return;
    }
    seen.add(h);
    out.push(t.url ? t : { host: h });
  };

  for (const t of targets) push(t);

  if (expandCommonSubdomains) {
    // Uniquement à partir des cibles apex explicitement fournies (pas brute-force DNS)
    for (const t of targets) {
      const root = normalizeHost(t.host || t.url || "");
      const labels = root.split(".").filter(Boolean);
      if (labels.length < 2 || /^\d+\.\d+\.\d+\.\d+$/.test(root)) continue;
      for (const label of COMMON_IN_SCOPE_SUBDOMAINS) {
        push({ host: `${label}.${root}` });
      }
    }
  }
  return out;
}

function extractSecurityHeaders(
  headers: Record<string, string>,
): WebPassiveSecurityHeaders {
  const hsts = headers["strict-transport-security"];
  const csp = headers["content-security-policy"];
  const xFrameOptions = headers["x-frame-options"];
  const xContentTypeOptions = headers["x-content-type-options"];
  const referrerPolicy = headers["referrer-policy"];
  const permissionsPolicy =
    headers["permissions-policy"] ?? headers["feature-policy"];
  const missing: string[] = [];
  if (!hsts) missing.push("strict-transport-security");
  if (!csp) missing.push("content-security-policy");
  if (!xFrameOptions) missing.push("x-frame-options");
  if (!xContentTypeOptions) missing.push("x-content-type-options");
  if (!referrerPolicy) missing.push("referrer-policy");
  return {
    hsts,
    csp,
    xFrameOptions,
    xContentTypeOptions,
    referrerPolicy,
    permissionsPolicy,
    missing,
  };
}

function hashEvidence(payload: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(payload))
    .digest("hex");
}

async function realDnsLookup(host: string): Promise<{
  a: string[];
  aaaa: string[];
  ns?: string[];
  mx?: string[];
  txt?: string[];
}> {
  const dns = await import("node:dns/promises");
  const [a, aaaa, ns, mx, txt] = await Promise.all([
    dns.resolve4(host).catch(() => [] as string[]),
    dns.resolve6(host).catch(() => [] as string[]),
    dns.resolveNs(host).catch(() => [] as string[]),
    dns
      .resolveMx(host)
      .then((rows) => rows.map((r) => r.exchange))
      .catch(() => [] as string[]),
    dns
      .resolveTxt(host)
      .then((rows) => rows.map((r) => r.join("")).slice(0, 5))
      .catch(() => [] as string[]),
  ]);
  if (a.length === 0 && aaaa.length === 0) {
    const all = await dns.lookup(host, { all: true }).catch(() => []);
    return {
      a: all.filter((x) => x.family === 4).map((x) => x.address),
      aaaa: all.filter((x) => x.family === 6).map((x) => x.address),
      ns,
      mx,
      txt,
    };
  }
  return { a, aaaa, ns, mx, txt };
}

async function realHttpProbe(url: string): Promise<{
  status: number;
  headers: Record<string, string>;
  bodySha256?: string;
  bodyBytesSampled?: number;
}> {
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

/** Apex = exactement un hôte de l'allowlist (pas www.x si x est listé) */
export function isApexInAllowlist(
  host: string,
  allowedHosts: Set<string>,
): boolean {
  const h = normalizeHost(host);
  return [...allowedHosts].map(normalizeHost).includes(h);
}

const OSINT_DISCLAIMER =
  "OSINT passif RDAP public uniquement — in-scope ; pas de WHOIS agressif ni d'énumération.";

async function realRdapProbe(host: string): Promise<WebPassiveOsintEvidence> {
  const query = normalizeHost(host);
  const rdapUrl = `https://rdap.org/domain/${encodeURIComponent(query)}`;
  try {
    const res = await fetch(rdapUrl, {
      method: "GET",
      redirect: "follow",
      signal: AbortSignal.timeout(10_000),
      headers: { Accept: "application/rdap+json, application/json" },
    });
    if (!res.ok) {
      return {
        source: "rdap",
        query,
        ok: false,
        rdapUrl,
        disclaimer: OSINT_DISCLAIMER,
        error: `HTTP ${res.status}`,
      };
    }
    const data = (await res.json()) as {
      handle?: string;
      status?: string[];
      entities?: { roles?: string[]; vcardArray?: unknown[] }[];
      nameservers?: { ldhName?: string }[];
      events?: { eventAction?: string; eventDate?: string }[];
    };
    const registrar = data.entities?.find((e) =>
      e.roles?.includes("registrar"),
    );
    let registrarName: string | undefined;
    const vcard = registrar?.vcardArray;
    if (Array.isArray(vcard) && Array.isArray(vcard[1])) {
      for (const row of vcard[1] as unknown[]) {
        if (Array.isArray(row) && row[0] === "fn" && typeof row[3] === "string") {
          registrarName = row[3];
          break;
        }
      }
    }
    return {
      source: "rdap",
      query,
      ok: true,
      handle: data.handle,
      registrar: registrarName,
      status: data.status,
      nameservers: data.nameservers
        ?.map((n) => n.ldhName)
        .filter((x): x is string => Boolean(x)),
      events: data.events?.slice(0, 5).map((e) => ({
        action: e.eventAction,
        date: e.eventDate,
      })),
      rdapUrl,
      disclaimer: OSINT_DISCLAIMER,
    };
  } catch (e) {
    return {
      source: "rdap",
      query,
      ok: false,
      rdapUrl,
      disclaimer: OSINT_DISCLAIMER,
      error: e instanceof Error ? e.message : String(e),
    };
  }
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
        let daysRemaining: number | undefined;
        if (cert.valid_to) {
          const end = new Date(cert.valid_to).getTime();
          daysRemaining = Math.floor((end - Date.now()) / (24 * 3600 * 1000));
        }
        const sansRaw = cert.subjectaltname ?? "";
        const subjectSANs = sansRaw
          ? sansRaw
              .split(",")
              .map((s) => s.trim().replace(/^DNS:/i, ""))
              .filter(Boolean)
          : undefined;
        resolve({
          protocol: proto ?? undefined,
          authorized,
          subjectCN: cn(cert.subject?.CN),
          subjectSANs,
          issuerCN: cn(cert.issuer?.CN),
          validFrom: cert.valid_from,
          validTo: cert.valid_to,
          daysRemaining,
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
 * Contrôle passif borné : DNS + HTTP headers + TLS + RDAP apex,
 * rate-limité, annulable. Pas de scan agressif.
 */
export async function runWebPassivePresence(
  targets: WebPassiveTarget[],
  opts: WebPassiveOptions,
): Promise<WebPassiveResult[]> {
  const results: WebPassiveResult[] = [];
  const intervalMs = Math.ceil(60_000 / Math.max(1, opts.rateLimitPerMinute));
  const sleep =
    opts.sleepFn ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  const networkMocked = Boolean(opts.lookupFn || opts.fetchFn || opts.rdapFn);
  const lookup = opts.lookupFn ?? realDnsLookup;
  const fetchImpl = opts.fetchFn ?? realHttpProbe;
  const tlsImpl = opts.tlsFn ?? realTlsProbe;
  const rdapImpl = opts.rdapFn ?? realRdapProbe;
  const includeOsint = opts.includeOsintRdap !== false;

  // Refus immédiat si une cible fournie est hors périmètre (avant élargissement)
  for (const t of targets) {
    const host = normalizeHost(t.host || t.url || "");
    assertInScope(host, opts.allowedHosts, opts.exclusions);
  }

  const expanded = expandPassiveTargets(
    targets,
    opts.allowedHosts,
    opts.exclusions,
    opts.expandCommonSubdomains !== false,
  );
  const total = expanded.length;
  for (let i = 0; i < expanded.length; i++) {
    if (opts.isCancelled()) {
      break;
    }
    const target = expanded[i]!;
    const host = normalizeHost(target.host || target.url || "");
    assertInScope(host, opts.allowedHosts, opts.exclusions);

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
        ns: rec.ns,
        mx: rec.mx,
        txtSample: rec.txt,
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
    assertInScope(urlHost, opts.allowedHosts, opts.exclusions);

    try {
      const http = await fetchImpl(url);
      const securityHeaders = extractSecurityHeaders(http.headers);
      entryCore.http = {
        ok: http.status > 0 && http.status < 500,
        method: http.bodySha256 ? "GET" : "HEAD",
        url,
        status: http.status,
        server: http.headers["server"],
        contentType: http.headers["content-type"],
        hsts: securityHeaders.hsts,
        securityHeaders,
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

    if (
      includeOsint &&
      isApexInAllowlist(host, opts.allowedHosts) &&
      !opts.isCancelled()
    ) {
      entryCore.osint = await rdapImpl(host);
    }

    const evidenceHash = hashEvidence(entryCore);
    results.push({ ...entryCore, evidenceHash });
    await sleep(intervalMs);
  }

  return results;
}
