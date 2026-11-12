/** Tableau Contrôle → risque → compromission (labels FR). Miroir API. */

export type RiskCode = "critical" | "high" | "medium" | "low" | "info";

export type RiskLabelFr =
  | "critique"
  | "élevé"
  | "moyen"
  | "faible"
  | "info";

export type RiskTableRow = {
  control: string;
  /** Hôte concerné (un seul hôte — jamais agrégé côté Suivi) */
  host: string;
  /** URL explicite de la cible (https://host/… quand connue) */
  url: string;
  riskCode: RiskCode;
  risk: RiskLabelFr;
  compromise: string;
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
  dns?: { resolved?: boolean; addresses?: string[]; error?: string };
  tls?: {
    authorized?: boolean;
    protocol?: string;
    daysRemaining?: number;
    error?: string;
    issuerCN?: string;
    autoRenewLikely?: boolean;
  };
  http?: {
    ok?: boolean;
    status?: number;
    url?: string;
    error?: string;
    securityHeaders?: {
      missing?: string[];
      browserOnlySkipped?: boolean;
    };
    cookies?: Array<{ name?: string; missingFlags?: string[] }>;
    cdn?: { provider?: string; originNotAnalyzed?: boolean };
    redirectChain?: Array<{
      url?: string;
      status?: number;
      location?: string;
    }>;
  };
  osint?: { ok?: boolean; error?: string; source?: string };
};

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

/** Let's Encrypt / ISRG / CDN edge — renouvellement ACME probable. */
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

function row(
  partial: Omit<RiskTableRow, "risk"> & { riskCode: RiskCode },
): RiskTableRow {
  return { ...partial, risk: RISK_LABEL_FR[partial.riskCode] };
}

function sortRiskTable(rows: RiskTableRow[]): RiskTableRow[] {
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
 * Ne fusionne jamais les hôtes en blobs « api.x, www.x » (Suivi / empreintes).
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

/**
 * Densité UI : une ligne par contrôle, hôtes listés sans troncature.
 * Séparé d'aggregateRiskTable (empreintes Suivi restent 1 hôte / ligne).
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
      url: _hosts.length === 1 ? r.url || evidenceTargetUrl(_hosts[0]!) : "",
    })),
  );
}

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

/** Redirect depth — mirror API risk-table (http→https + stuck 3xx). */
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

export function buildPresenceRiskTable(
  evidence: EvidenceLike[] | null | undefined,
): RiskTableRow[] {
  const out: RiskTableRow[] = [];
  if (!Array.isArray(evidence)) return out;

  for (const ev of evidence) {
    // Hôtes non résolus (devinés) — ne pas rapporter
    if (ev.dns?.resolved === false) continue;

    const host = ev.host?.trim() || "(hôte inconnu)";
    const url = evidenceTargetUrl(host, ev.http?.url);

    if (ev.dns?.resolved) {
      out.push(
        row({
          control: "DNS — résolution publique",
          host,
          url,
          riskCode: "info",
          compromise: "Observation — surface DNS visible sur Internet",
          signal: (ev.dns.addresses ?? []).slice(0, 2).join(", ") || "résolu",
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

    pushRedirectRows(out, host, url, ev.http);

    if (ev.http?.securityHeaders?.browserOnlySkipped) {
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

    const tls = ev.tls;
    if (tls?.error) {
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
    } else if (tls?.authorized === false) {
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
    } else if (typeof tls?.daysRemaining === "number" && tls.daysRemaining < 0) {
      out.push(
        row({
          control: "TLS — certificat expiré",
          host,
          url,
          riskCode: "critical",
          compromise:
            "Compromission potentielle — service HTTPS non fiable pour les clients",
          signal: `daysRemaining=${tls.daysRemaining}`,
        }),
      );
    } else if (
      typeof tls?.daysRemaining === "number" &&
      tls.daysRemaining <= 14
    ) {
      const autoRenew =
        tls.autoRenewLikely === true || isAutoRenewIssuer(tls.issuerCN);
      out.push(
        row({
          control: "TLS — expiration imminente",
          host,
          url,
          riskCode: "high",
          compromise:
            "Exposition élevée — interruption HTTPS / alerte navigateurs proche",
          signal: `${tls.daysRemaining} j restants · ${tls.protocol ?? "?"}${autoRenew ? " · auto-renew ?" : ""}`,
        }),
      );
    } else if (
      typeof tls?.daysRemaining === "number" &&
      tls.daysRemaining <= 45 &&
      !(tls.autoRenewLikely === true || isAutoRenewIssuer(tls.issuerCN))
    ) {
      out.push(
        row({
          control: "TLS — renouvellement à planifier",
          host,
          url,
          riskCode: "medium",
          compromise: "Exposition moyenne — certificat valide mais fenêtre courte",
          signal: `${tls.daysRemaining} j restants · ${tls.protocol ?? "?"}`,
        }),
      );
    } else if (tls?.authorized) {
      const autoRenew =
        tls.autoRenewLikely === true || isAutoRenewIssuer(tls.issuerCN);
      out.push(
        row({
          control: "TLS — certificat valide",
          host,
          url,
          riskCode: "info",
          compromise: autoRenew
            ? "Observation — chaîne OK · renouvellement automatique probable"
            : "Observation — chaîne de confiance OK",
          signal: `${tls.protocol ?? "TLS"} · ${tls.daysRemaining ?? "?"} j${autoRenew ? " · auto-renew" : ""}`,
        }),
      );
    }

    const missingHeaders = ev.http?.securityHeaders?.missing;
    if (missingHeaders && !missingHeaders.length) {
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
    for (const name of missingHeaders ?? []) {
      const meta = HEADER_META[name.toLowerCase()];
      out.push(
        row({
          control: meta?.control ?? `Header ${name} absent`,
          host,
          url,
          riskCode: meta?.riskCode ?? "low",
          compromise:
            meta?.compromise ??
            "Exposition faible — durcissement HTTP incomplet",
          signal: name,
        }),
      );
    }

    for (const c of ev.http?.cookies ?? []) {
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

    if (ev.osint) {
      out.push(
        row({
          control: ev.osint.ok ? "OSINT RDAP" : "OSINT RDAP indisponible",
          host,
          url,
          riskCode: "info",
          compromise: ev.osint.ok
            ? "Observation — métadonnées domaine publiques"
            : "Observation — pas d'enrichissement WHOIS passif",
          signal: ev.osint.error ?? ev.osint.source ?? "rdap",
        }),
      );
    }
  }

  return sortRiskTable(out);
}

/** Extrait riskTable d'un exportJson rapport, sinon dérive depuis evidence. */
export function riskTableFromReportExport(
  exportJson: unknown,
): RiskTableRow[] {
  if (!exportJson || typeof exportJson !== "object") return [];
  const obj = exportJson as {
    riskTable?: RiskTableRow[];
    evidence?: EvidenceLike[];
  };
  if (Array.isArray(obj.riskTable) && obj.riskTable.length > 0) {
    const needsRebuild = obj.riskTable.some(
      (r) => !r.url || r.host.includes(","),
    );
    if (needsRebuild && Array.isArray(obj.evidence) && obj.evidence.length) {
      return aggregateRiskTable(buildPresenceRiskTable(obj.evidence));
    }
    return aggregateRiskTable(obj.riskTable);
  }
  return aggregateRiskTable(buildPresenceRiskTable(obj.evidence));
}
