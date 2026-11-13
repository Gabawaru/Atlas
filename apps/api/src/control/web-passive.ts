/**
 * Module MVP : présence web passive (DNS/HTTP/TLS publics).
 * Preuves réelles par défaut ; jamais hors périmètre ; rate limit + cancel.
 * Pas de fuzzing, pas de crawl agressif, pas de login, pas de découverte brute.
 */
import { createHash } from "node:crypto";
import { connect as tlsConnect } from "node:tls";
import {
  evaluateRoeHost,
  isRoeScopeOverrideEnabled,
} from "@atlas/policy-guard";
import { formatCaaRecord } from "@atlas/risk-table";

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
  /** Apex only — TXT `_dmarc.<apex>` (une requête fixe, pas d'enum) */
  dmarcTxtSample?: string[];
  /** Apex only — enregistrements CAA (issue / iodef) */
  caaSample?: string[];
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
  /** API JSON — CSP/XFO volontairement non scorés (atl-retours depth) */
  browserOnlySkipped?: boolean;
}

/** Observation Set-Cookie — pas de vol de session, pas de bypass. */
export interface WebPassiveCookieFlags {
  name: string;
  secure: boolean;
  httpOnly: boolean;
  sameSite?: string;
  /** Flags manquants utiles pour le rapport (observation) */
  missingFlags: string[];
}

export interface WebPassiveRedirectHop {
  url: string;
  status: number;
  location?: string;
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
  /** Chaîne de redirect (max 5) — hôtes hors scope → arrêt, pas de suivi */
  redirectChain?: WebPassiveRedirectHop[];
  cookies?: WebPassiveCookieFlags[];
  bodySha256?: string;
  bodyBytesSampled?: number;
  observedAt?: string;
  error?: string;
  /** Edge CDN (ex. Cloudflare) — origine non analysée */
  cdn?: { provider: string; originNotAnalyzed: true };
}

/** Limites documentées du module (pas un scan agressif). */
export const WEB_PASSIVE_LIMITS = {
  maxRedirectHops: 5,
  maxBodySampleBytes: 2048,
  commonSubdomainsOnly: COMMON_IN_SCOPE_SUBDOMAINS,
  noAggressiveScan: true,
  methods: [
    "dns",
    "dns.dmarc",
    "dns.caa",
    "tls",
    "http.headers",
    "http.cookies",
    "http.redirects",
    "rdap.apex",
  ],
} as const;

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
  /** ACME / CDN — renouvellement automatique probable (LE 90j, etc.) */
  autoRenewLikely?: boolean;
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
  /**
   * Enforce platform RoE allowlist (sections 3–5). Default true (fail-closed).
   * Set false only in isolated unit fixtures that stub mission scope alone.
   */
  enforceRoePlatform?: boolean;
  /**
   * Operator override for gated / out-of-scope hosts
   * (also ATLAS_ROE_SCOPE_OVERRIDE=1). Synthetic demos set this true.
   */
  roeScopeOverride?: boolean;
  rateLimitPerMinute: number;
  isCancelled: () => boolean;
  onProgress?: (p: WebPassiveProgress) => void | Promise<void>;
  lookupFn?: (host: string) => Promise<{
    a: string[];
    aaaa: string[];
    ns?: string[];
    mx?: string[];
    txt?: string[];
    /** CAA RRs formatted (apex) */
    caa?: string[];
  }>;
  fetchFn?: (url: string) => Promise<{
    status: number;
    headers: Record<string, string>;
    bodySha256?: string;
    bodyBytesSampled?: number;
    redirectChain?: WebPassiveRedirectHop[];
    cookies?: WebPassiveCookieFlags[];
    /** URL finale après suivi 301/302 (headers évalués ici) */
    finalUrl?: string;
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

/** API JSON (api.*) : CSP / XFO non applicables ; garder HSTS + X-CTO. */
export function isJsonApiHost(
  host: string,
  contentType?: string | null,
): boolean {
  const h = normalizeHost(host);
  if (h.startsWith("api.") || h.includes(".api.")) return true;
  if (contentType && /application\/([\w.+-]*\+)?json/i.test(contentType)) {
    return true;
  }
  return false;
}

/** Détection edge Cloudflare (empreinte passive, pas d'origine). */
export function detectCloudflareCdn(
  headers: Record<string, string>,
): { provider: "Cloudflare"; originNotAnalyzed: true } | undefined {
  const server = (headers["server"] ?? "").toLowerCase();
  const cdnLoop = (headers["cdn-loop"] ?? "").toLowerCase();
  const via = (headers["via"] ?? "").toLowerCase();
  if (
    headers["cf-ray"] ||
    headers["cf-cache-status"] ||
    server.includes("cloudflare") ||
    cdnLoop.includes("cloudflare") ||
    via.includes("cloudflare")
  ) {
    return { provider: "Cloudflare", originNotAnalyzed: true };
  }
  return undefined;
}

/** Let's Encrypt / ISRG / CDN GTS — renouvellement ACME probable. */
export function isAutoRenewIssuer(issuerCN?: string | null): boolean {
  if (!issuerCN) return false;
  const s = issuerCN.trim().toLowerCase();
  if (!s) return false;
  if (s.includes("let's encrypt") || s.includes("lets encrypt")) return true;
  if (s.includes("isrg")) return true;
  if (s.includes("cloudflare")) return true;
  if (s.includes("google trust") || s.startsWith("gts")) return true;
  if (/^(r\d+|e\d+|ye\d+|we\d+)$/i.test(issuerCN.trim())) return true;
  return false;
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
 * Adresses non routables / métadonnées — pas de connect HTTP/TLS après DNS
 * (SSRF / rebinding). Dual-stack : A et AAAA.
 */
export function isDeniedConnectAddress(ip: string): boolean {
  const raw = ip.trim().toLowerCase();
  if (!raw) return true;

  // IPv4-mapped IPv6 → IPv4
  const v4mapped = raw.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (v4mapped) return isDeniedConnectAddress(v4mapped[1]!);

  if (raw.includes(":")) {
    if (raw === "::1" || raw === "::") return true;
    // ULA fc00::/7, link-local fe80::/10
    if (raw.startsWith("fc") || raw.startsWith("fd")) return true;
    if (raw.startsWith("fe8") || raw.startsWith("fe9") || raw.startsWith("fea") || raw.startsWith("feb")) {
      return true;
    }
    return false;
  }

  const parts = raw.split(".").map((p) => Number(p));
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
    return true;
  }
  const [a, b] = parts as [number, number, number, number];
  if (a === 0 || a === 127 || a === 10) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  if (a >= 224) return true; // multicast / reserved
  return false;
}

/** true si au moins une adresse résolue est non connectable (deny). */
export function hasDeniedConnectAddress(addresses: string[]): boolean {
  return addresses.some((a) => isDeniedConnectAddress(a));
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

export type AssertInScopeOptions = {
  enforceRoePlatform?: boolean;
  roeScopeOverride?: boolean;
};

/**
 * Platform RoE allowlist (Policy Guard config) — gated / unknown REJECT.
 */
export function assertRoePlatformAllowed(
  host: string,
  opts?: { override?: boolean },
): void {
  const override = isRoeScopeOverrideEnabled(process.env, opts?.override);
  const roe = evaluateRoeHost(host, { override });
  if (roe.decision === "REJECT") {
    throw new Error(`${roe.code}: ${roe.reason}`);
  }
}

/**
 * Allowlist stricte : hôte exact ou sous-domaine d'un domaine du scope.
 * Refuse exclusions RoE, allowlist plateforme, IP hors liste et hosts non listés.
 */
export function assertInScope(
  host: string,
  allowedHosts: Set<string>,
  exclusions?: Set<string>,
  opts?: AssertInScopeOptions,
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
  if (opts?.enforceRoePlatform !== false) {
    assertRoePlatformAllowed(h, {
      override: opts?.roeScopeOverride === true,
    });
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
  scopeOpts?: AssertInScopeOptions,
): WebPassiveTarget[] {
  const seen = new Set<string>();
  const out: WebPassiveTarget[] = [];
  const push = (t: WebPassiveTarget) => {
    const h = normalizeHost(t.host || t.url || "");
    if (!h || seen.has(h)) return;
    try {
      assertInScope(h, allowedHosts, exclusions, scopeOpts);
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
  opts?: { host?: string; skipBrowserOnly?: boolean },
): WebPassiveSecurityHeaders {
  const hsts = headers["strict-transport-security"];
  const csp = headers["content-security-policy"];
  const xFrameOptions = headers["x-frame-options"];
  const xContentTypeOptions = headers["x-content-type-options"];
  const referrerPolicy = headers["referrer-policy"];
  const permissionsPolicy =
    headers["permissions-policy"] ?? headers["feature-policy"];
  const skipBrowserOnly =
    opts?.skipBrowserOnly === true ||
    (opts?.host
      ? isJsonApiHost(opts.host, headers["content-type"])
      : false);
  const missing: string[] = [];
  if (!hsts) missing.push("strict-transport-security");
  // API JSON : CSP + X-Frame-Options non pertinents (pas de document navigateur)
  if (!skipBrowserOnly) {
    if (!csp) missing.push("content-security-policy");
    if (!xFrameOptions) missing.push("x-frame-options");
  }
  if (!xContentTypeOptions) missing.push("x-content-type-options");
  if (!referrerPolicy) missing.push("referrer-policy");
  // HEADER_META already maps this; without push, live riskTable never flags PP absent.
  if (!permissionsPolicy) missing.push("permissions-policy");
  return {
    hsts,
    csp,
    xFrameOptions,
    xContentTypeOptions,
    referrerPolicy,
    permissionsPolicy,
    ...(skipBrowserOnly ? { browserOnlySkipped: true as const } : {}),
    missing,
  };
}

/** Parse Set-Cookie (observation flags uniquement). */
export function parseCookieFlags(
  setCookieHeader: string | string[] | undefined,
): WebPassiveCookieFlags[] {
  if (!setCookieHeader) return [];
  const parts = Array.isArray(setCookieHeader)
    ? setCookieHeader
    : setCookieHeader.split(/,(?=\s*[^;]+=)/);
  const out: WebPassiveCookieFlags[] = [];
  for (const raw of parts) {
    const line = raw.trim();
    if (!line) continue;
    const [pair, ...attrs] = line.split(";").map((s) => s.trim());
    const name = pair?.split("=")[0]?.trim();
    if (!name) continue;
    const lower = attrs.map((a) => a.toLowerCase());
    const secure = lower.some((a) => a === "secure");
    const httpOnly = lower.some((a) => a === "httponly");
    const sameSiteAttr = attrs.find((a) =>
      a.toLowerCase().startsWith("samesite"),
    );
    const sameSite = sameSiteAttr?.split("=")[1]?.trim();
    const missingFlags: string[] = [];
    if (!secure) missingFlags.push("Secure");
    if (!httpOnly) missingFlags.push("HttpOnly");
    if (!sameSite) missingFlags.push("SameSite");
    out.push({ name, secure, httpOnly, sameSite, missingFlags });
  }
  return out.slice(0, 20);
}

function collectSetCookie(
  headers: Headers | Record<string, string>,
): string | string[] | undefined {
  if (headers instanceof Headers) {
    const multi =
      typeof headers.getSetCookie === "function"
        ? headers.getSetCookie()
        : [];
    if (multi.length) return multi;
    const single = headers.get("set-cookie");
    return single ?? undefined;
  }
  return headers["set-cookie"];
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
  caa?: string[];
}> {
  const dns = await import("node:dns/promises");
  const [a, aaaa, ns, mx, txt, caa] = await Promise.all([
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
    dns
      .resolveCaa(host)
      .then((rows) =>
        rows
          .map((r) => formatCaaRecord(r))
          .filter((s): s is string => Boolean(s))
          .slice(0, 8),
      )
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
      caa,
    };
  }
  return { a, aaaa, ns, mx, txt, caa };
}

async function realHttpProbe(
  url: string,
  allowedHosts?: Set<string>,
  exclusions?: Set<string>,
  scopeOpts?: AssertInScopeOptions,
): Promise<{
  status: number;
  headers: Record<string, string>;
  bodySha256?: string;
  bodyBytesSampled?: number;
  redirectChain?: WebPassiveRedirectHop[];
  cookies?: WebPassiveCookieFlags[];
  finalUrl?: string;
}> {
  const redirectChain: WebPassiveRedirectHop[] = [];
  let current = url;
  let res: Response | null = null;
  const headers: Record<string, string> = {};

  for (let hop = 0; hop <= WEB_PASSIVE_LIMITS.maxRedirectHops; hop++) {
    res = await fetch(current, {
      method: "HEAD",
      redirect: "manual",
      signal: AbortSignal.timeout(8_000),
    });
    // Remplace toujours les headers — évaluation sur la réponse courante uniquement
    for (const key of Object.keys(headers)) delete headers[key];
    res.headers.forEach((v, k) => {
      headers[k.toLowerCase()] = v;
    });
    const setCookie = collectSetCookie(res.headers);
    if (setCookie) {
      headers["set-cookie"] = Array.isArray(setCookie)
        ? setCookie.join("\n")
        : setCookie;
    }

    const location = res.headers.get("location") ?? undefined;
    redirectChain.push({
      url: current,
      status: res.status,
      location,
    });

    if (
      location &&
      res.status >= 300 &&
      res.status < 400 &&
      hop < WEB_PASSIVE_LIMITS.maxRedirectHops
    ) {
      let next: string;
      try {
        next = new URL(location, current).toString();
      } catch {
        break;
      }
      if (allowedHosts) {
        try {
          assertInScope(
            normalizeHost(next),
            allowedHosts,
            exclusions,
            scopeOpts,
          );
        } catch {
          // Hors scope : on n'ensuit pas (pas de scan ouvert)
          break;
        }
      }
      current = next;
      continue;
    }
    break;
  }

  if (!res) {
    return { status: 0, headers: {}, redirectChain, finalUrl: current };
  }

  let bodySha256: string | undefined;
  let bodyBytesSampled: number | undefined;

  if (res.status === 405 || res.status === 501 || res.status === 403) {
    res = await fetch(current, {
      method: "GET",
      redirect: "manual",
      signal: AbortSignal.timeout(8_000),
      headers: { Range: "bytes=0-2047" },
    });
    for (const key of Object.keys(headers)) delete headers[key];
    res.headers.forEach((v, k) => {
      headers[k.toLowerCase()] = v;
    });
    const setCookie = collectSetCookie(res.headers);
    if (setCookie) {
      headers["set-cookie"] = Array.isArray(setCookie)
        ? setCookie.join("\n")
        : setCookie;
    }
    const buf = Buffer.from(await res.arrayBuffer());
    const sample = buf.subarray(
      0,
      Math.min(buf.length, WEB_PASSIVE_LIMITS.maxBodySampleBytes),
    );
    bodyBytesSampled = sample.length;
    bodySha256 = createHash("sha256").update(sample).digest("hex");
  }

  const cookieSource =
    headers["set-cookie"]?.includes("\n")
      ? headers["set-cookie"].split("\n")
      : headers["set-cookie"];
  const cookies = parseCookieFlags(cookieSource);

  return {
    status: res.status,
    headers,
    bodySha256,
    bodyBytesSampled,
    redirectChain: redirectChain.length ? redirectChain : undefined,
    cookies: cookies.length ? cookies : undefined,
    /** Headers sécu = réponse finale (après 301 www→apex) */
    finalUrl: current,
  };
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

const IANA_RDAP_DNS_JSON = "https://data.iana.org/rdap/dns.json";

/** Cache process-lifetime du bootstrap IANA dns.json */
let ianaRdapDirectoryCache:
  | { fetchedAt: number; services: Array<[string[], string[]]> }
  | null = null;

/**
 * Résout le serveur RDAP via le répertoire IANA (ex. .com → Verisign).
 * Évite les faux « indisponible » quand rdap.org / mauvais bootstrap échoue.
 */
export async function resolveRdapServerForDomain(
  domain: string,
  fetchImpl: typeof fetch = fetch,
): Promise<string | null> {
  const labels = normalizeHost(domain).split(".").filter(Boolean);
  if (labels.length < 2) return null;
  const tld = labels[labels.length - 1]!;

  const now = Date.now();
  if (
    !ianaRdapDirectoryCache ||
    now - ianaRdapDirectoryCache.fetchedAt > 24 * 3600 * 1000
  ) {
    const res = await fetchImpl(IANA_RDAP_DNS_JSON, {
      method: "GET",
      signal: AbortSignal.timeout(10_000),
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      services?: Array<[string[], string[]]>;
    };
    if (!Array.isArray(data.services)) return null;
    ianaRdapDirectoryCache = {
      fetchedAt: now,
      services: data.services,
    };
  }

  for (const [tlds, urls] of ianaRdapDirectoryCache.services) {
    if (!tlds.some((t) => t.toLowerCase() === tld)) continue;
    const base = urls.find((u) => /^https?:\/\//i.test(u));
    if (base) return base.replace(/\/$/, "");
  }
  return null;
}

/** @internal tests — reset cache IANA */
export function clearRdapDirectoryCache(): void {
  ianaRdapDirectoryCache = null;
}

async function realRdapProbe(host: string): Promise<WebPassiveOsintEvidence> {
  const query = normalizeHost(host);
  let rdapUrl = "";
  try {
    const base = await resolveRdapServerForDomain(query);
    if (!base) {
      return {
        source: "rdap",
        query,
        ok: false,
        disclaimer: OSINT_DISCLAIMER,
        error: "Aucun serveur RDAP IANA pour ce TLD",
      };
    }
    rdapUrl = `${base}/domain/${encodeURIComponent(query)}`;
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
      rdapUrl: rdapUrl || undefined,
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
        const issuerCN = cn(cert.issuer?.CN);
        resolve({
          protocol: proto ?? undefined,
          authorized,
          subjectCN: cn(cert.subject?.CN),
          subjectSANs,
          issuerCN,
          validFrom: cert.valid_from,
          validTo: cert.valid_to,
          daysRemaining,
          fingerprint256: cert.fingerprint256,
          autoRenewLikely: isAutoRenewIssuer(issuerCN) || undefined,
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
  const scopeOpts: AssertInScopeOptions = {
    enforceRoePlatform: opts.enforceRoePlatform !== false,
    roeScopeOverride: opts.roeScopeOverride === true,
  };
  const lookup = opts.lookupFn ?? realDnsLookup;
  const fetchImpl =
    opts.fetchFn ??
    ((u: string) =>
      realHttpProbe(u, opts.allowedHosts, opts.exclusions, scopeOpts));
  const tlsImpl = opts.tlsFn ?? realTlsProbe;
  const rdapImpl = opts.rdapFn ?? realRdapProbe;
  const includeOsint = opts.includeOsintRdap !== false;

  // Refus immédiat si une cible fournie est hors périmètre (avant élargissement)
  const explicitHosts = new Set<string>();
  for (const t of targets) {
    const host = normalizeHost(t.host || t.url || "");
    assertInScope(host, opts.allowedHosts, opts.exclusions, scopeOpts);
    explicitHosts.add(host);
  }

  const expanded = expandPassiveTargets(
    targets,
    opts.allowedHosts,
    opts.exclusions,
    opts.expandCommonSubdomains !== false,
    scopeOpts,
  );
  const total = expanded.length;
  for (let i = 0; i < expanded.length; i++) {
    if (opts.isCancelled()) {
      break;
    }
    const target = expanded[i]!;
    const host = normalizeHost(target.host || target.url || "");
    assertInScope(host, opts.allowedHosts, opts.exclusions, scopeOpts);

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
      const apex = isApexInAllowlist(host, opts.allowedHosts);
      entryCore.dns = {
        resolved: rec.a.length + rec.aaaa.length > 0,
        addresses: rec.a,
        aaaa: rec.aaaa,
        ns: rec.ns,
        mx: rec.mx,
        txtSample: rec.txt,
        ...(apex ? { caaSample: rec.caa ?? [] } : {}),
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

    // Hôtes devinés (www/mail/api) non résolus — ne pas polluer le rapport
    if (!entryCore.dns.resolved && !explicitHosts.has(host)) {
      if (i < expanded.length - 1) await sleep(intervalMs);
      continue;
    }

    // Apex only — one fixed `_dmarc.` TXT (no mailbox/subdomain enum).
    if (isApexInAllowlist(host, opts.allowedHosts) && !opts.isCancelled()) {
      try {
        const dmarcRec = await lookup(`_dmarc.${host}`);
        entryCore.dns.dmarcTxtSample = dmarcRec.txt ?? [];
      } catch {
        entryCore.dns.dmarcTxtSample = [];
      }
    }

    const resolvedIps = [
      ...entryCore.dns.addresses,
      ...(entryCore.dns.aaaa ?? []),
    ];
    const privateIpDenied =
      entryCore.dns.resolved && hasDeniedConnectAddress(resolvedIps);
    if (privateIpDenied) {
      entryCore.dns.error = "PRIVATE_IP_DENIED";
    }

    const url = target.url ?? `https://${host}/`;
    const urlHost = normalizeHost(url);
    assertInScope(urlHost, opts.allowedHosts, opts.exclusions, scopeOpts);

    // Pas de connect HTTP/TLS vers loopback / RFC1918 / link-local / ULA / metadata.
    // RDAP reste OK (endpoint public fixe, pas de connect vers l'IP résolue).
    if (privateIpDenied) {
      entryCore.http = {
        ok: false,
        method: "HEAD",
        url,
        error: "PRIVATE_IP_DENIED: refus de connexion après résolution DNS",
        observedAt: new Date().toISOString(),
      };
      entryCore.tls = {
        error: "PRIVATE_IP_DENIED: TLS non tenté",
      };
      if (
        includeOsint &&
        isApexInAllowlist(host, opts.allowedHosts) &&
        !opts.isCancelled()
      ) {
        entryCore.osint = await rdapImpl(host);
      }
      results.push({ ...entryCore, evidenceHash: hashEvidence(entryCore) });
      if (i < expanded.length - 1) await sleep(intervalMs);
      continue;
    }

    try {
      const http = await fetchImpl(url);
      const finalUrl = http.finalUrl?.trim() || url;
      const finalHost = normalizeHost(finalUrl);
      const stillRedirect =
        typeof http.status === "number" &&
        http.status >= 300 &&
        http.status < 400;
      // Headers sécu uniquement sur la réponse finale (pas le 301 intermédiaire)
      const securityHeaders = stillRedirect
        ? {
            missing: [] as string[],
          }
        : extractSecurityHeaders(http.headers, { host: finalHost || host });
      const cookies =
        http.cookies ??
        parseCookieFlags(
          http.headers["set-cookie"]?.includes("\n")
            ? http.headers["set-cookie"].split("\n")
            : http.headers["set-cookie"],
        );
      const cdn = detectCloudflareCdn(http.headers);
      entryCore.http = {
        ok: http.status > 0 && http.status < 500,
        method: http.bodySha256 ? "GET" : "HEAD",
        url: finalUrl,
        status: http.status,
        server: http.headers["server"],
        contentType: http.headers["content-type"],
        hsts: securityHeaders.hsts,
        securityHeaders,
        redirectChain: http.redirectChain,
        cookies: cookies.length ? cookies : undefined,
        bodySha256: http.bodySha256,
        bodyBytesSampled: http.bodyBytesSampled,
        observedAt: new Date().toISOString(),
        cdn,
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

    if (
      (entryCore.http?.url ?? url).startsWith("https://") &&
      !opts.isCancelled()
    ) {
      const tlsHost = normalizeHost(entryCore.http?.url ?? host);
      entryCore.tls = await tlsImpl(tlsHost || host);
      if (
        entryCore.tls &&
        !entryCore.tls.error &&
        entryCore.tls.autoRenewLikely === undefined
      ) {
        entryCore.tls.autoRenewLikely =
          isAutoRenewIssuer(entryCore.tls.issuerCN) || undefined;
      }
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
