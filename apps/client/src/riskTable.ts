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
  /** Hôte concerné (un seul hôte — jamais agrégé) */
  host: string;
  /** URL explicite de la cible (https://host/… quand connue) */
  url: string;
  riskCode: RiskCode;
  risk: RiskLabelFr;
  compromise: string;
  signal: string;
};

const RISK_LABEL_FR: Record<RiskCode, RiskLabelFr> = {
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
  };
  http?: {
    ok?: boolean;
    status?: number;
    url?: string;
    error?: string;
    securityHeaders?: { missing?: string[] };
    cookies?: Array<{ name?: string; missingFlags?: string[] }>;
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

export function buildPresenceRiskTable(
  evidence: EvidenceLike[] | null | undefined,
): RiskTableRow[] {
  const out: RiskTableRow[] = [];
  if (!Array.isArray(evidence)) return out;

  for (const ev of evidence) {
    const host = ev.host?.trim() || "(hôte inconnu)";
    const url = evidenceTargetUrl(host, ev.http?.url);
    if (ev.dns?.resolved === false) {
      out.push(
        row({
          control: "DNS — hôte non résolu",
          host,
          url,
          riskCode: "info",
          compromise: "Observation — pas d'exposition HTTP publique détectée",
          signal: ev.dns.error ?? "NXDOMAIN / ENOTFOUND",
        }),
      );
    } else if (ev.dns?.resolved) {
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
      // API pushDnsHttpRows parity — http.error typed but was dropped on rebuild.
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
          // API pushTlsRows parity — issuerCN typed on EvidenceLike but was dropped.
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
    } else if (typeof tls?.daysRemaining === "number" && tls.daysRemaining <= 14) {
      out.push(
        row({
          control: "TLS — expiration imminente",
          host,
          url,
          riskCode: "high",
          compromise:
            "Exposition élevée — interruption HTTPS / alerte navigateurs proche",
          // API pushTlsRows parity — protocol typed on EvidenceLike but was dropped
          // on ≤14 while medium (≤45) already keeps it.
          signal: `${tls.daysRemaining} j restants · ${tls.protocol ?? "?"}`,
        }),
      );
    } else if (typeof tls?.daysRemaining === "number" && tls.daysRemaining <= 45) {
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
      out.push(
        row({
          control: "TLS — certificat valide",
          host,
          url,
          riskCode: "info",
          compromise: "Observation — chaîne de confiance OK",
          signal: `${tls.protocol ?? "TLS"} · ${tls.daysRemaining ?? "?"} j`,
        }),
      );
    }

    // API pushHeaderRows parity — empty missing[] is an observed all-clear, not silence.
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

    // API risk-table pushCookieRows parity — evidence rebuild must not drop cookies.
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
