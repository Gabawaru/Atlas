/**
 * Interprète les preuves Presence web (DNS/TLS/headers) en tableau
 * Contrôle → niveau de risque → niveau de compromission / exposition.
 * Labels FR : critique / élevé / moyen / faible / info.
 */
export {
  formatRdapSignal,
  hasSpfInTxtSample,
  HSTS_MAX_AGE_FLOOR_SEC,
  isHstsMaxAgeWeak,
  parseHstsMaxAge,
  rdapExpiryDaysRemaining,
  rdapExpiryIso,
} from "@atlas/risk-table";
import {
  formatRdapSignal,
  hasSpfInTxtSample,
  HSTS_MAX_AGE_FLOOR_SEC,
  isHstsMaxAgeWeak,
  parseHstsMaxAge,
  rdapExpiryDaysRemaining,
  rdapExpiryIso,
} from "@atlas/risk-table";

export type RiskCode = "critical" | "high" | "medium" | "low" | "info";

export type RiskLabelFr =
  | "critique"
  | "élevé"
  | "moyen"
  | "faible"
  | "info";

export type RiskTableRow = {
  /** Contrôle ou finding interprété */
  control: string;
  /** Hôte concerné (un seul hôte — jamais agrégé) */
  host: string;
  /** URL explicite de la cible (https://host/… quand connue) */
  url: string;
  /** Code machine (sévérité Atlas) */
  riskCode: RiskCode;
  /** Niveau de risque (FR) */
  risk: RiskLabelFr;
  /** Niveau de compromission / exposition (FR) */
  compromise: string;
  /** Signal observé (court) */
  signal: string;
};

export const RISK_LABEL_FR: Record<RiskCode, RiskLabelFr> = {
  critical: "critique",
  high: "élevé",
  medium: "moyen",
  low: "faible",
  info: "info",
};

const RISK_RANK: Record<RiskCode, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
  info: 0,
};

type EvidenceLike = {
  host?: string;
  dns?: {
    resolved?: boolean;
    addresses?: string[];
    txtSample?: string[];
    error?: string;
  };
  tls?: {
    authorized?: boolean;
    protocol?: string;
    daysRemaining?: number;
    error?: string;
    issuerCN?: string;
    /** ACME / CDN short-lived — renouvellement auto probable */
    autoRenewLikely?: boolean;
  };
  http?: {
    ok?: boolean;
    status?: number;
    url?: string;
    error?: string;
    securityHeaders?: {
      missing?: string[];
      hsts?: string;
      csp?: string;
      xFrameOptions?: string;
      xContentTypeOptions?: string;
      referrerPolicy?: string;
      /** API JSON — CSP/XFO skipped intentionally */
      browserOnlySkipped?: boolean;
    };
    cookies?: Array<{ name?: string; missingFlags?: string[] }>;
    /** CDN edge observé — origine non sondée */
    cdn?: { provider?: string; originNotAnalyzed?: boolean };
    /** Chaîne de redirect (max 5) — scoring http→https + stuck 3xx */
    redirectChain?: Array<{
      url?: string;
      status?: number;
      location?: string;
    }>;
  };
  osint?: {
    ok?: boolean;
    error?: string;
    source?: string;
    registrar?: string;
    events?: Array<{ action?: string; date?: string }>;
  };
};

/** Let's Encrypt / ISRG / CDN edge (GTS YE*, Cloudflare) — 90j ACME typique. */
export function isAutoRenewIssuer(issuerCN?: string | null): boolean {
  if (!issuerCN) return false;
  const s = issuerCN.trim().toLowerCase();
  if (!s) return false;
  if (s.includes("let's encrypt") || s.includes("lets encrypt")) return true;
  if (s.includes("isrg")) return true;
  if (s.includes("cloudflare")) return true;
  if (s.includes("google trust") || s.startsWith("gts")) return true;
  // Intermediate short CNs used by LE / Cloudflare Universal SSL
  if (/^(r\d+|e\d+|ye\d+|we\d+)$/i.test(issuerCN.trim())) return true;
  return false;
}

/** URL explicite pour une preuve : http.url sinon https://host/ */
export function evidenceTargetUrl(
  host: string,
  httpUrl?: string | null,
): string {
  const fromHttp = httpUrl?.trim();
  if (fromHttp) return fromHttp;
  const h = host.trim();
  if (!h || h === "(hôte inconnu)" || h === "—") return "";
  if (/^https?:\/\//i.test(h)) return h.endsWith("/") ? h : `${h}/`;
  return `https://${h}/`;
}

const HEADER_META: Record<
  string,
  { control: string; riskCode: RiskCode; compromise: string }
> = {
  "strict-transport-security": {
    control: "Header HSTS absent",
    riskCode: "medium",
    compromise: "Exposition moyenne — downgrade HTTP / interception TLS possible",
  },
  "content-security-policy": {
    control: "Header CSP absent",
    riskCode: "medium",
    compromise: "Exposition moyenne — injection de contenu / XSS facilitée",
  },
  "x-frame-options": {
    control: "Header X-Frame-Options absent",
    riskCode: "medium",
    compromise: "Exposition moyenne — clickjacking possible",
  },
  "x-content-type-options": {
    control: "Header X-Content-Type-Options absent",
    riskCode: "low",
    compromise: "Exposition faible — sniffing MIME possible",
  },
  "referrer-policy": {
    control: "Header Referrer-Policy absent",
    riskCode: "low",
    compromise: "Exposition faible — fuite d'URL référentes",
  },
  "permissions-policy": {
    control: "Header Permissions-Policy absent",
    riskCode: "low",
    compromise: "Exposition faible — API navigateur non restreintes",
  },
};

function row(
  partial: Omit<RiskTableRow, "risk"> & { riskCode: RiskCode },
): RiskTableRow {
  return {
    ...partial,
    risk: RISK_LABEL_FR[partial.riskCode],
  };
}

/** Mappe une sévérité existante (finding) vers libellés FR. */
export function mapSeverityToRisk(severity: string): {
  riskCode: RiskCode;
  risk: RiskLabelFr;
  compromise: string;
} {
  const key = severity.trim().toLowerCase();
  const aliases: Record<string, RiskCode> = {
    critical: "critical",
    critique: "critical",
    high: "high",
    élevé: "high",
    eleve: "high",
    medium: "medium",
    moyen: "medium",
    low: "low",
    faible: "low",
    info: "info",
    informational: "info",
  };
  const riskCode = aliases[key] ?? "info";
  const compromiseByRisk: Record<RiskCode, string> = {
    critical: "Compromission potentielle — action immédiate",
    high: "Exposition élevée — correction prioritaire",
    medium: "Exposition moyenne — planifier la remédiation",
    low: "Exposition faible — durcissement recommandé",
    info: "Observation — pas de compromission directe",
  };
  return {
    riskCode,
    risk: RISK_LABEL_FR[riskCode],
    compromise: compromiseByRisk[riskCode],
  };
}

function pushTlsRows(
  out: RiskTableRow[],
  host: string,
  url: string,
  tls: EvidenceLike["tls"],
) {
  if (!tls) return;
  if (tls.error) {
    out.push(
      row({
        control: "TLS — sonde en échec",
        host,
        url,
        riskCode: "info",
        compromise: "Observation — certificat non évaluable (hôte injoignable)",
        signal: tls.error,
      }),
    );
    return;
  }
  if (tls.authorized === false) {
    out.push(
      row({
        control: "TLS — certificat non de confiance",
        host,
        url,
        riskCode: "critical",
        compromise:
          "Compromission potentielle — chaîne de confiance rompue / MITM possible",
        signal: `authorized=false · ${tls.protocol ?? "?"} · issuer=${tls.issuerCN ?? "?"}`,
      }),
    );
    return;
  }
  const days = tls.daysRemaining;
  const autoRenew =
    tls.autoRenewLikely === true || isAutoRenewIssuer(tls.issuerCN);
  if (typeof days === "number" && days < 0) {
    out.push(
      row({
        control: "TLS — certificat expiré",
        host,
        url,
        riskCode: "critical",
        compromise:
          "Compromission potentielle — service HTTPS non fiable pour les clients",
        signal: `daysRemaining=${days}`,
      }),
    );
  } else if (typeof days === "number" && days <= 14) {
    // Alerte même si ACME : <14 j = renouvellement auto probablement en panne
    out.push(
      row({
        control: "TLS — expiration imminente",
        host,
        url,
        riskCode: "high",
        compromise:
          "Exposition élevée — interruption HTTPS / alerte navigateurs proche",
        signal: `${days} j restants · ${tls.protocol ?? "?"}${autoRenew ? " · auto-renew ?" : ""}`,
      }),
    );
  } else if (typeof days === "number" && days <= 45 && !autoRenew) {
    // Fenêtre courte seulement si renouvellement non automatique (pas LE 90j ACME)
    out.push(
      row({
        control: "TLS — renouvellement à planifier",
        host,
        url,
        riskCode: "medium",
        compromise: "Exposition moyenne — certificat valide mais fenêtre courte",
        signal: `${days} j restants · ${tls.protocol ?? "?"}`,
      }),
    );
  } else if (tls.authorized) {
    out.push(
      row({
        control: "TLS — certificat valide",
        host,
        url,
        riskCode: "info",
        compromise: autoRenew
          ? "Observation — chaîne OK · renouvellement automatique probable"
          : "Observation — chaîne de confiance OK",
        signal: `${tls.protocol ?? "TLS"} · ${typeof days === "number" ? `${days} j` : "durée n/d"}${autoRenew ? " · auto-renew" : ""}`,
      }),
    );
  }
}

/**
 * Redirect depth — evidence was collected but never scored (atl-retours).
 * - http start without https final → low
 * - final still 3xx (hop cap / stuck) → info (or low if ≥5 hops)
 */
export function pushRedirectRows(
  out: RiskTableRow[],
  host: string,
  url: string,
  http: EvidenceLike["http"],
) {
  if (!http) return;
  const chain = http.redirectChain ?? [];
  const startUrl = (chain[0]?.url || http.url || url || "").trim();
  const endUrl = (http.url || chain[chain.length - 1]?.url || url || "").trim();
  const finalStatus =
    typeof http.status === "number"
      ? http.status
      : chain[chain.length - 1]?.status;
  const hops = chain.length;

  if (
    typeof finalStatus === "number" &&
    finalStatus >= 300 &&
    finalStatus < 400
  ) {
    out.push(
      row({
        control: "HTTP — redirection non résolue",
        host,
        url: endUrl || url,
        riskCode: hops >= 5 ? "low" : "info",
        compromise:
          hops >= 5
            ? "Exposition faible — chaîne de redirect saturée (limite passive)"
            : "Observation — réponse encore 3xx après suivi passif",
        signal: `status=${finalStatus} · hops=${hops || 1}`,
      }),
    );
  }

  try {
    if (!startUrl) return;
    const start = new URL(startUrl);
    const end = new URL(endUrl || startUrl);
    if (start.protocol === "http:" && end.protocol !== "https:") {
      out.push(
        row({
          control: "HTTP — pas de redirection vers HTTPS",
          host,
          url: startUrl,
          riskCode: "low",
          compromise:
            "Exposition faible — trafic clairtext / pas d'upgrade TLS observé",
          signal: `${start.protocol}// → ${end.protocol}// · hops=${hops}`,
        }),
      );
    }
  } catch {
    /* ignore bad URLs */
  }
}

function pushDnsHttpRows(
  out: RiskTableRow[],
  host: string,
  url: string,
  ev: EvidenceLike,
) {
  // Hôtes non résolus (ex. mail.* deviné) — ne pas rapporter
  if (ev.dns?.resolved === false) return;

  if (ev.dns?.resolved) {
    const addrs = (ev.dns.addresses ?? []).slice(0, 2).join(", ");
    out.push(
      row({
        control: "DNS — résolution publique",
        host,
        url,
        riskCode: "info",
        compromise: "Observation — surface DNS visible sur Internet",
        signal: addrs || "résolu",
      }),
    );
  }
  if (ev.http?.cdn?.originNotAnalyzed || ev.http?.cdn?.provider) {
    const provider = ev.http.cdn.provider ?? "CDN";
    out.push(
      row({
        control: `CDN ${provider} — origine non analysée`,
        host,
        url,
        riskCode: "info",
        compromise:
          "Observation — empreinte edge uniquement ; l'origine derrière le CDN n'est pas sondée",
        signal: `${provider} · originNotAnalyzed`,
      }),
    );
  }
  if (ev.http?.ok) {
    out.push(
      row({
        control: "HTTP — présence web",
        host,
        url,
        riskCode: "info",
        compromise: "Observation — service joignable (empreinte passive)",
        signal: `status=${ev.http.status ?? "?"}`,
      }),
    );
  } else if (ev.http?.error) {
    out.push(
      row({
        control: "HTTP — sonde en échec",
        host,
        url,
        riskCode: "info",
        compromise: "Observation — pas de réponse HTTP exploitable",
        signal: ev.http.error,
      }),
    );
  }
}

/** Surface intentional API JSON browser-header skip (was silent). */
export function pushApiPolicyObservation(
  out: RiskTableRow[],
  host: string,
  url: string,
  http: EvidenceLike["http"],
) {
  if (!http?.securityHeaders?.browserOnlySkipped) return;
  out.push(
    row({
      control: "API JSON — CSP/XFO non applicables",
      host,
      url,
      riskCode: "info",
      compromise:
        "Observation — headers navigateur (CSP, X-Frame-Options) non scorés pour API JSON",
      signal: "browserOnlySkipped · api/json",
    }),
  );
}

function pushHstsMaxAgeRow(
  out: RiskTableRow[],
  host: string,
  url: string,
  hsts: string | undefined,
) {
  if (!isHstsMaxAgeWeak(hsts)) return;
  const age = parseHstsMaxAge(hsts);
  out.push(
    row({
      control: "Header HSTS max-age insuffisant",
      host,
      url,
      riskCode: "low",
      compromise:
        "Exposition faible — HSTS trop court / sans max-age (downgrade encore possible)",
      signal:
        age === null
          ? `${hsts?.trim() || "?"} · max-age manquant · floor=${HSTS_MAX_AGE_FLOOR_SEC}`
          : `max-age=${age} · floor=${HSTS_MAX_AGE_FLOOR_SEC}`,
    }),
  );
}

function pushHeaderRows(
  out: RiskTableRow[],
  host: string,
  url: string,
  securityHeaders:
    | { missing?: string[]; hsts?: string }
    | undefined,
) {
  const missing = securityHeaders?.missing;
  const hsts = securityHeaders?.hsts;
  const hstsListedMissing = (missing ?? []).some(
    (n) => n.toLowerCase() === "strict-transport-security",
  );
  if (!hstsListedMissing) {
    pushHstsMaxAgeRow(out, host, url, hsts);
  }
  const weak = !hstsListedMissing && isHstsMaxAgeWeak(hsts);
  if (!missing?.length) {
    if (missing && !weak) {
      out.push(
        row({
          control: "Headers de sécurité",
          host,
          url,
          riskCode: "info",
          compromise: "Observation — jeu de headers de base présent",
          signal: "aucun header critique manquant",
        }),
      );
    }
    return;
  }
  for (const name of missing) {
    const meta = HEADER_META[name.toLowerCase()];
    if (!meta) {
      out.push(
        row({
          control: `Header ${name} absent`,
          host,
          url,
          riskCode: "low",
          compromise: "Exposition faible — durcissement HTTP incomplet",
          signal: name,
        }),
      );
      continue;
    }
    out.push(
      row({
        control: meta.control,
        host,
        url,
        riskCode: meta.riskCode,
        compromise: meta.compromise,
        signal: name,
      }),
    );
  }
}

function pushCookieRows(
  out: RiskTableRow[],
  host: string,
  url: string,
  cookies: NonNullable<EvidenceLike["http"]>["cookies"],
) {
  if (!cookies?.length) return;
  for (const c of cookies) {
    const missing = c.missingFlags ?? [];
    if (!missing.length) continue;
    const high = missing.includes("Secure") || missing.includes("HttpOnly");
    out.push(
      row({
        control: `Cookie — flags manquants (${c.name ?? "?"})`,
        host,
        url,
        riskCode: high ? "medium" : "low",
        compromise: high
          ? "Exposition moyenne — session potentiellement exposée"
          : "Exposition faible — durcissement cookie incomplet",
        signal: missing.join(", "),
      }),
    );
  }
}

function pushOsintRow(
  out: RiskTableRow[],
  host: string,
  url: string,
  osint: EvidenceLike["osint"],
) {
  if (!osint) return;
  if (osint.ok) {
    out.push(
      row({
        control: "OSINT RDAP",
        host,
        url,
        riskCode: "info",
        compromise: "Observation — métadonnées domaine publiques",
        signal: formatRdapSignal(osint),
      }),
    );
    pushRdapExpiryRow(out, host, url, osint);
  } else {
    out.push(
      row({
        control: "OSINT RDAP indisponible",
        host,
        url,
        riskCode: "info",
        compromise: "Observation — pas d'enrichissement WHOIS passif",
        signal: formatRdapSignal(osint),
      }),
    );
  }
}

/** Domain registration expiry windows from RDAP (apex only). */
function pushRdapExpiryRow(
  out: RiskTableRow[],
  host: string,
  url: string,
  osint: NonNullable<EvidenceLike["osint"]>,
) {
  const days = rdapExpiryDaysRemaining(osint);
  if (days === null) return;
  const day = rdapExpiryIso(osint)!.slice(0, 10);
  if (days < 0) {
    out.push(
      row({
        control: "Domaine — enregistrement expiré",
        host,
        url,
        riskCode: "high",
        compromise:
          "Exposition élevée — domaine expiré (reprise / interruption possible)",
        signal: `expiry=${day} · ${days} j`,
      }),
    );
    return;
  }
  if (days <= 30) {
    out.push(
      row({
        control: "Domaine — expiration imminente",
        host,
        url,
        riskCode: "medium",
        compromise:
          "Exposition moyenne — renouvellement domaine à traiter sous 30 j",
        signal: `expiry=${day} · ${days} j restants`,
      }),
    );
    return;
  }
  if (days <= 90) {
    out.push(
      row({
        control: "Domaine — renouvellement à planifier",
        host,
        url,
        riskCode: "low",
        compromise:
          "Exposition faible — échéance domaine dans les 90 j",
        signal: `expiry=${day} · ${days} j restants`,
      }),
    );
  }
}

function pushSpfPresenceRow(
  out: RiskTableRow[],
  host: string,
  url: string,
  ev: EvidenceLike,
) {
  // Apex only — RDAP runs on apex; avoid scoring SPF on www/api TXT.
  // Caller already skips unresolved hosts; do not re-check resolved===false (TS).
  if (!ev.osint) return;
  if (!Array.isArray(ev.dns?.txtSample)) return;
  const present = hasSpfInTxtSample(ev.dns.txtSample);
  if (present) {
    const hit = ev.dns.txtSample.find((t) => /\bv=spf1\b/i.test(t)) ?? "v=spf1";
    out.push(
      row({
        control: "DNS — SPF présent",
        host,
        url,
        riskCode: "info",
        compromise: "Observation — politique d'émission mail publiée (TXT)",
        signal: hit.trim().slice(0, 120),
      }),
    );
    return;
  }
  out.push(
    row({
      control: "DNS — SPF absent",
      host,
      url,
      riskCode: "low",
      compromise:
        "Exposition faible — pas d'enregistrement SPF observé sur l'apex",
      signal: `txt=${ev.dns.txtSample.length}`,
    }),
  );
}

/** Construit le tableau risque/compromission depuis les preuves Presence. */
export function buildPresenceRiskTable(
  evidence: EvidenceLike[] | null | undefined,
): RiskTableRow[] {
  const out: RiskTableRow[] = [];
  if (!Array.isArray(evidence) || evidence.length === 0) return out;

  for (const ev of evidence) {
    // Ne pas remonter les hôtes devinés non résolus (mail.*, etc.)
    if (ev.dns?.resolved === false) continue;
    const host = ev.host?.trim() || "(hôte inconnu)";
    const url = evidenceTargetUrl(host, ev.http?.url);
    pushDnsHttpRows(out, host, url, ev);
    pushRedirectRows(out, host, url, ev.http);
    pushTlsRows(out, host, url, ev.tls);
    pushApiPolicyObservation(out, host, url, ev.http);
    pushHeaderRows(out, host, url, ev.http?.securityHeaders);
    pushCookieRows(out, host, url, ev.http?.cookies);
    pushOsintRow(out, host, url, ev.osint);
    pushSpfPresenceRow(out, host, url, ev);
  }

  return sortRiskTable(out);
}

/**
 * Une ligne par contrôle (hôtes listés, sans troncature) — densité UI.
 * Conservé séparé d'aggregateRiskTable (empreintes Suivi = 1 hôte / ligne).
 */
export function collapseRiskTableByControl(
  rows: RiskTableRow[],
): RiskTableRow[] {
  const map = new Map<string, RiskTableRow & { _hosts: string[] }>();
  for (const r of expandRiskTableRows(rows)) {
    const key = `${r.control}|${r.riskCode}|${r.compromise}`;
    const existing = map.get(key);
    if (!existing) {
      map.set(key, { ...r, _hosts: [r.host].filter(Boolean) });
      continue;
    }
    if (r.host && !existing._hosts.includes(r.host)) {
      existing._hosts.push(r.host);
    }
    if (RISK_RANK[r.riskCode] > RISK_RANK[existing.riskCode]) {
      existing.riskCode = r.riskCode;
      existing.risk = RISK_LABEL_FR[r.riskCode];
      existing.compromise = r.compromise;
      existing.signal = r.signal;
    }
  }
  return sortRiskTable(
    [...map.values()].map(({ _hosts, ...r }) => ({
      ...r,
      host: _hosts.join(", "),
      // Multi-hôtes : pas d'URL unique trompeuse
      url: _hosts.length === 1 ? r.url || evidenceTargetUrl(_hosts[0]!) : "",
    })),
  );
}

/** Sépare findings actionnables et observations info (résumé). */
export function partitionRiskTable(rows: RiskTableRow[]): {
  findings: RiskTableRow[];
  observations: RiskTableRow[];
} {
  const findings: RiskTableRow[] = [];
  const observations: RiskTableRow[] = [];
  for (const r of rows) {
    if (r.riskCode === "info") observations.push(r);
    else findings.push(r);
  }
  return { findings, observations };
}

/** Score 0–100 + 3 actions prioritaires pour le bilan bas de page. */
export function buildBilanSummary(rows: RiskTableRow[]): {
  score: number;
  priorityActions: string[];
} {
  const actionable = rows.filter((r) => r.riskCode !== "info");
  let score = 100;
  for (const r of actionable) {
    if (r.riskCode === "critical") score -= 25;
    else if (r.riskCode === "high") score -= 15;
    else if (r.riskCode === "medium") score -= 8;
    else if (r.riskCode === "low") score -= 3;
  }
  score = Math.max(0, Math.min(100, score));
  const priorityActions = sortRiskTable(actionable)
    .slice(0, 3)
    .map((r) => {
      const where = r.host && r.host !== "—" ? ` (${r.host})` : "";
      return `${r.control}${where}`;
    });
  return { score, priorityActions };
}

/** Ajoute des lignes finding classiques (sévérité → risque/compromission). */
export function rowsFromFindings(
  findings: Array<{ title: string; severity: string; summary?: string }>,
): RiskTableRow[] {
  return findings.map((f) => {
    const mapped = mapSeverityToRisk(f.severity);
    return row({
      control: f.title,
      host: "—",
      url: "",
      riskCode: mapped.riskCode,
      compromise: mapped.compromise,
      signal: (f.summary ?? "").slice(0, 160),
    });
  });
}

export function sortRiskTable(rows: RiskTableRow[]): RiskTableRow[] {
  return [...rows].sort((a, b) => {
    const d = RISK_RANK[b.riskCode] - RISK_RANK[a.riskCode];
    if (d !== 0) return d;
    return (
      a.control.localeCompare(b.control, "fr") ||
      a.url.localeCompare(b.url) ||
      a.host.localeCompare(b.host)
    );
  });
}

/** Éclate un ancien blob « api.x, www.x » en une ligne par hôte/URL. */
export function expandRiskTableRows(rows: RiskTableRow[]): RiskTableRow[] {
  const out: RiskTableRow[] = [];
  for (const r of rows) {
    const hosts = r.host
      .split(",")
      .map((h) => h.trim())
      .filter(Boolean);
    if (hosts.length <= 1) {
      out.push({
        ...r,
        host: hosts[0] ?? r.host,
        url: r.url || evidenceTargetUrl(hosts[0] ?? r.host),
      });
      continue;
    }
    for (const host of hosts) {
      out.push({
        ...r,
        host,
        url: evidenceTargetUrl(host),
      });
    }
  }
  return out;
}

/**
 * Dédoublonne les lignes exactes — une ligne par URL hôte.
 * Ne fusionne jamais les hôtes en blobs « api.x, www.x ».
 */
export function aggregateRiskTable(rows: RiskTableRow[]): RiskTableRow[] {
  const map = new Map<string, RiskTableRow>();
  for (const r of expandRiskTableRows(rows)) {
    const url = r.url || evidenceTargetUrl(r.host);
    const key = `${r.control}|${r.riskCode}|${r.compromise}|${url}|${r.host}`;
    if (!map.has(key)) {
      map.set(key, { ...r, url });
    }
  }
  return sortRiskTable([...map.values()]);
}
