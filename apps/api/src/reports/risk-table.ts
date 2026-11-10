/**
 * Interprète les preuves Presence web (DNS/TLS/headers) en tableau
 * Contrôle → niveau de risque → niveau de compromission / exposition.
 * Labels FR : critique / élevé / moyen / faible / info.
 */

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
  /** Hôte concerné (agrégé si plusieurs) */
  host: string;
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
    error?: string;
  };
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
    error?: string;
    securityHeaders?: {
      missing?: string[];
      hsts?: string;
      csp?: string;
      xFrameOptions?: string;
      xContentTypeOptions?: string;
      referrerPolicy?: string;
    };
    cookies?: Array<{ name?: string; missingFlags?: string[] }>;
  };
  osint?: {
    ok?: boolean;
    error?: string;
    source?: string;
  };
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

function pushTlsRows(out: RiskTableRow[], host: string, tls: EvidenceLike["tls"]) {
  if (!tls) return;
  if (tls.error) {
    out.push(
      row({
        control: "TLS — sonde en échec",
        host,
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
        riskCode: "critical",
        compromise:
          "Compromission potentielle — chaîne de confiance rompue / MITM possible",
        signal: `authorized=false · ${tls.protocol ?? "?"} · issuer=${tls.issuerCN ?? "?"}`,
      }),
    );
    return;
  }
  const days = tls.daysRemaining;
  if (typeof days === "number" && days < 0) {
    out.push(
      row({
        control: "TLS — certificat expiré",
        host,
        riskCode: "critical",
        compromise:
          "Compromission potentielle — service HTTPS non fiable pour les clients",
        signal: `daysRemaining=${days}`,
      }),
    );
  } else if (typeof days === "number" && days <= 14) {
    out.push(
      row({
        control: "TLS — expiration imminente",
        host,
        riskCode: "high",
        compromise:
          "Exposition élevée — interruption HTTPS / alerte navigateurs proche",
        signal: `${days} j restants · ${tls.protocol ?? "?"}`,
      }),
    );
  } else if (typeof days === "number" && days <= 45) {
    out.push(
      row({
        control: "TLS — renouvellement à planifier",
        host,
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
        riskCode: "info",
        compromise: "Observation — chaîne de confiance OK",
        signal: `${tls.protocol ?? "TLS"} · ${typeof days === "number" ? `${days} j` : "durée n/d"}`,
      }),
    );
  }
}

function pushDnsHttpRows(
  out: RiskTableRow[],
  host: string,
  ev: EvidenceLike,
) {
  if (ev.dns?.resolved === false) {
    out.push(
      row({
        control: "DNS — hôte non résolu",
        host,
        riskCode: "info",
        compromise: "Observation — pas d'exposition HTTP publique détectée",
        signal: ev.dns.error ?? "NXDOMAIN / ENOTFOUND",
      }),
    );
    return;
  }
  if (ev.dns?.resolved) {
    const addrs = (ev.dns.addresses ?? []).slice(0, 2).join(", ");
    out.push(
      row({
        control: "DNS — résolution publique",
        host,
        riskCode: "info",
        compromise: "Observation — surface DNS visible sur Internet",
        signal: addrs || "résolu",
      }),
    );
  }
  if (ev.http?.ok) {
    out.push(
      row({
        control: "HTTP — présence web",
        host,
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
        riskCode: "info",
        compromise: "Observation — pas de réponse HTTP exploitable",
        signal: ev.http.error,
      }),
    );
  }
}

function pushHeaderRows(
  out: RiskTableRow[],
  host: string,
  missing: string[] | undefined,
) {
  if (!missing?.length) {
    if (missing) {
      out.push(
        row({
          control: "Headers de sécurité",
          host,
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
        riskCode: high ? "medium" : "low",
        compromise: high
          ? "Exposition moyenne — session potentiellement exposée"
          : "Exposition faible — durcissement cookie incomplet",
        signal: missing.join(", "),
      }),
    );
  }
}

function pushOsintRow(out: RiskTableRow[], host: string, osint: EvidenceLike["osint"]) {
  if (!osint) return;
  if (osint.ok) {
    out.push(
      row({
        control: "OSINT RDAP",
        host,
        riskCode: "info",
        compromise: "Observation — métadonnées domaine publiques",
        signal: osint.source ?? "rdap",
      }),
    );
  } else {
    out.push(
      row({
        control: "OSINT RDAP indisponible",
        host,
        riskCode: "info",
        compromise: "Observation — pas d'enrichissement WHOIS passif",
        signal: osint.error ?? "échec",
      }),
    );
  }
}

/** Construit le tableau risque/compromission depuis les preuves Presence. */
export function buildPresenceRiskTable(
  evidence: EvidenceLike[] | null | undefined,
): RiskTableRow[] {
  const out: RiskTableRow[] = [];
  if (!Array.isArray(evidence) || evidence.length === 0) return out;

  for (const ev of evidence) {
    const host = ev.host?.trim() || "(hôte inconnu)";
    pushDnsHttpRows(out, host, ev);
    pushTlsRows(out, host, ev.tls);
    pushHeaderRows(out, host, ev.http?.securityHeaders?.missing);
    pushCookieRows(out, host, ev.http?.cookies);
    pushOsintRow(out, host, ev.osint);
  }

  return sortRiskTable(out);
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
    return a.control.localeCompare(b.control, "fr") || a.host.localeCompare(b.host);
  });
}

/** Agrège hôtes identiques pour un même contrôle (vue Scanner compacte). */
export function aggregateRiskTable(rows: RiskTableRow[]): RiskTableRow[] {
  const map = new Map<string, RiskTableRow>();
  for (const r of rows) {
    const key = `${r.control}|${r.riskCode}|${r.compromise}`;
    const existing = map.get(key);
    if (!existing) {
      map.set(key, { ...r });
      continue;
    }
    const hosts = new Set(
      existing.host.split(", ").concat(r.host.split(", ")).filter(Boolean),
    );
    existing.host = [...hosts].sort().join(", ");
    if (RISK_RANK[r.riskCode] > RISK_RANK[existing.riskCode]) {
      existing.riskCode = r.riskCode;
      existing.risk = r.risk;
      existing.signal = r.signal;
    }
  }
  return sortRiskTable([...map.values()]);
}
