/**
 * Suivi vulnérabilités cross-scan — identité stable (empreinte) + ID court CCV
 * + persistance locale + plage de dates ouverte.
 *
 * FUTURE (ne pas implémenter ici) : propositions de correctifs générées par IA
 * à partir du contexte site — stub uniquement, voir `proposeAiFixStub`.
 */

import type { RiskCode, RiskLabelFr, RiskTableRow } from "./riskTable";

export const VULN_TRACKING_STORAGE_KEY = "atlas.vuln-tracking.v1";

export type VulnTrackStatus = "unresolved" | "resolved";

export type VulnTrackEntry = {
  /** Empreinte stable : control + url + host (+ riskCode) */
  fingerprint: string;
  /**
   * Identifiant court style CCV, dérivé de l'empreinte (stable cross-scan).
   * Ex. CCV-7K2M9A — affiché dans les 3 tables + archive PDF.md.
   */
  shortId: string;
  control: string;
  url: string;
  host: string;
  riskCode: RiskCode;
  risk: RiskLabelFr;
  compromise: string;
  signal: string;
  status: VulnTrackStatus;
  /** Début de la plage ouverte (premier constat ISO) */
  firstSeenAt: string;
  /** Dernier constat encore ouvert / re-vu (ISO) */
  lastSeenAt: string;
  /** Fin de plage = résolution humaine (ISO) ; null = encore ouvert */
  resolvedAt: string | null;
  seenCount: number;
  lastMissionId: string | null;
  lastReportId: string | null;
  /** Ce qui a été concrètement fait pour corriger */
  resolutionNotes: string | null;
  /** Analyse du correctif final (humain) — alimente l'archive PDF.md */
  fixAnalysis: string | null;
};

export type VulnTrackingStore = {
  version: 1;
  updatedAt: string;
  entries: VulnTrackEntry[];
};

export type ResolveVulnInput = {
  resolutionNotes: string;
  fixAnalysis: string;
  resolvedAt?: string;
};

export type ArchiveFilterOptions = {
  /** Recherche libre : date (sous-chaîne ISO/affichée) ou nom de vulnérabilité / ID */
  query?: string;
  /** Filtre début de plage (inclus, YYYY-MM-DD ou ISO) */
  dateFrom?: string;
  /** Filtre fin de plage (inclus) */
  dateTo?: string;
  /** Type / sévérité (riskCode) — vide = tous */
  riskCode?: RiskCode | "" | "all";
  /** Tri alphabétique sur le contrôle (sinon tri par date de résolution desc) */
  alphabetical?: boolean;
};

/** Clés d'identité alignées sur les lignes riskTable (sans signal/compromise volatils). */
export function vulnFingerprint(input: {
  control: string;
  url: string;
  host: string;
  riskCode?: string;
}): string {
  const control = normalizePart(input.control);
  const url = normalizePart(input.url || evidenceUrlFallback(input.host));
  const host = normalizePart(input.host);
  const risk = normalizePart(input.riskCode ?? "");
  return `${control}|${url}|${host}|${risk}`;
}

/**
 * ID court déterministe lié à l'empreinte (CCV-XXXXXX).
 * Même empreinte ⇒ même ID à chaque scan.
 */
export function shortVulnIdFromFingerprint(fingerprint: string): string {
  const h = fnv1a(fingerprint);
  const code = h.toString(36).toUpperCase().padStart(6, "0").slice(0, 6);
  return `CCV-${code}`;
}

function fnv1a(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function normalizePart(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function evidenceUrlFallback(host: string): string {
  const h = host.trim();
  if (!h || h === "—" || h === "(hôte inconnu)") return "";
  if (/^https?:\/\//i.test(h)) return h.endsWith("/") ? h : `${h}/`;
  return `https://${h}/`;
}

/** Observations info pures : hors tables de suivi (trop de bruit). */
export function isTrackableRiskRow(row: RiskTableRow): boolean {
  return row.riskCode !== "info";
}

export function emptyVulnTrackingStore(now = new Date()): VulnTrackingStore {
  return {
    version: 1,
    updatedAt: now.toISOString(),
    entries: [],
  };
}

export function parseVulnTrackingStore(raw: unknown): VulnTrackingStore {
  if (!raw || typeof raw !== "object") return emptyVulnTrackingStore();
  const obj = raw as Partial<VulnTrackingStore>;
  if (obj.version !== 1 || !Array.isArray(obj.entries)) {
    return emptyVulnTrackingStore();
  }
  return {
    version: 1,
    updatedAt:
      typeof obj.updatedAt === "string"
        ? obj.updatedAt
        : new Date().toISOString(),
    entries: obj.entries.filter(isValidEntry).map(ensureShortId),
  };
}

function isValidEntry(value: unknown): value is VulnTrackEntry {
  if (!value || typeof value !== "object") return false;
  const e = value as Partial<VulnTrackEntry>;
  return (
    typeof e.fingerprint === "string" &&
    typeof e.control === "string" &&
    typeof e.url === "string" &&
    typeof e.host === "string" &&
    typeof e.firstSeenAt === "string" &&
    typeof e.lastSeenAt === "string" &&
    (e.status === "resolved" || e.status === "unresolved")
  );
}

function ensureShortId(entry: VulnTrackEntry): VulnTrackEntry {
  if (entry.shortId && /^CCV-[A-Z0-9]{4,8}$/i.test(entry.shortId)) {
    return entry;
  }
  return {
    ...entry,
    shortId: shortVulnIdFromFingerprint(entry.fingerprint),
  };
}

export function loadVulnTrackingStore(
  storage: Pick<Storage, "getItem"> | null | undefined = defaultStorage(),
): VulnTrackingStore {
  if (!storage) return emptyVulnTrackingStore();
  try {
    const raw = storage.getItem(VULN_TRACKING_STORAGE_KEY);
    if (!raw) return emptyVulnTrackingStore();
    return parseVulnTrackingStore(JSON.parse(raw) as unknown);
  } catch {
    return emptyVulnTrackingStore();
  }
}

export function saveVulnTrackingStore(
  store: VulnTrackingStore,
  storage: Pick<Storage, "setItem"> | null | undefined = defaultStorage(),
): void {
  if (!storage) return;
  storage.setItem(VULN_TRACKING_STORAGE_KEY, JSON.stringify(store));
}

function defaultStorage(): Storage | null {
  try {
    if (typeof localStorage === "undefined") return null;
    return localStorage;
  } catch {
    return null;
  }
}

/**
 * Fusionne les lignes riskTable d'un scan avec le store existant.
 * Même empreinte ⇒ même problème + même ID court (cross-scan).
 */
export function ingestRiskTableIntoTracking(
  store: VulnTrackingStore,
  rows: RiskTableRow[],
  meta: {
    seenAt?: string;
    missionId?: string | null;
    reportId?: string | null;
  } = {},
): VulnTrackingStore {
  const seenAt = meta.seenAt ?? new Date().toISOString();
  const byFp = new Map(
    store.entries.map((e) => [e.fingerprint, ensureShortId({ ...e })]),
  );

  for (const row of rows) {
    if (!isTrackableRiskRow(row)) continue;
    const url = row.url || evidenceUrlFallback(row.host);
    const fingerprint = vulnFingerprint({
      control: row.control,
      url,
      host: row.host,
      riskCode: row.riskCode,
    });
    const existing = byFp.get(fingerprint);
    if (existing) {
      existing.control = row.control;
      existing.url = url;
      existing.host = row.host;
      existing.riskCode = row.riskCode;
      existing.risk = row.risk;
      existing.compromise = row.compromise;
      existing.signal = row.signal;
      existing.lastSeenAt = seenAt;
      existing.seenCount += 1;
      existing.lastMissionId = meta.missionId ?? existing.lastMissionId;
      existing.lastReportId = meta.reportId ?? existing.lastReportId;
      if (existing.status === "resolved") {
        existing.status = "unresolved";
        existing.resolvedAt = null;
        existing.resolutionNotes = existing.resolutionNotes
          ? `${existing.resolutionNotes}\n— réapparition au scan ${seenAt}`
          : `Réapparition au scan ${seenAt}`;
      }
      byFp.set(fingerprint, existing);
      continue;
    }
    byFp.set(fingerprint, {
      fingerprint,
      shortId: shortVulnIdFromFingerprint(fingerprint),
      control: row.control,
      url,
      host: row.host,
      riskCode: row.riskCode,
      risk: row.risk,
      compromise: row.compromise,
      signal: row.signal,
      status: "unresolved",
      firstSeenAt: seenAt,
      lastSeenAt: seenAt,
      resolvedAt: null,
      seenCount: 1,
      lastMissionId: meta.missionId ?? null,
      lastReportId: meta.reportId ?? null,
      resolutionNotes: null,
      fixAnalysis: null,
    });
  }

  return {
    version: 1,
    updatedAt: seenAt,
    entries: [...byFp.values()].sort(compareEntries),
  };
}

export function markVulnResolved(
  store: VulnTrackingStore,
  fingerprint: string,
  input: ResolveVulnInput,
): VulnTrackingStore {
  const notes = input.resolutionNotes.trim();
  const analysis = input.fixAnalysis.trim();
  if (!notes || !analysis) {
    throw new Error(
      "Notes de résolution et analyse du correctif final sont requises.",
    );
  }
  const resolvedAt = input.resolvedAt ?? new Date().toISOString();
  const entries = store.entries.map((e) => {
    if (e.fingerprint !== fingerprint) return e;
    return {
      ...e,
      status: "resolved" as const,
      resolvedAt,
      resolutionNotes: notes,
      fixAnalysis: analysis,
    };
  });
  return {
    version: 1,
    updatedAt: resolvedAt,
    entries: entries.sort(compareEntries),
  };
}

export function reopenVuln(
  store: VulnTrackingStore,
  fingerprint: string,
  now = new Date().toISOString(),
): VulnTrackingStore {
  return {
    version: 1,
    updatedAt: now,
    entries: store.entries
      .map((e) =>
        e.fingerprint === fingerprint
          ? {
              ...e,
              status: "unresolved" as const,
              resolvedAt: null,
            }
          : e,
      )
      .sort(compareEntries),
  };
}

export function listUnresolved(store: VulnTrackingStore): VulnTrackEntry[] {
  return store.entries
    .filter((e) => e.status === "unresolved")
    .sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt));
}

export function listResolved(store: VulnTrackingStore): VulnTrackEntry[] {
  return store.entries
    .filter((e) => e.status === "resolved")
    .sort((a, b) =>
      String(b.resolvedAt ?? "").localeCompare(String(a.resolvedAt ?? "")),
    );
}

/**
 * Archive filtrable / triable — 3ᵉ table (rotative + barre de recherche).
 */
export function filterArchiveEntries(
  store: VulnTrackingStore,
  options: ArchiveFilterOptions = {},
): VulnTrackEntry[] {
  const q = (options.query ?? "").trim().toLowerCase();
  const dateFrom = parseDayBound(options.dateFrom, "start");
  const dateTo = parseDayBound(options.dateTo, "end");
  const riskFilter =
    options.riskCode && options.riskCode !== "all" ? options.riskCode : "";

  let rows = listResolved(store);

  if (riskFilter) {
    rows = rows.filter((e) => e.riskCode === riskFilter);
  }

  if (dateFrom || dateTo) {
    rows = rows.filter((e) => {
      const start = Date.parse(e.firstSeenAt);
      const end = Date.parse(e.resolvedAt ?? e.lastSeenAt);
      if (Number.isNaN(start) || Number.isNaN(end)) return true;
      if (dateFrom && end < dateFrom) return false;
      if (dateTo && start > dateTo) return false;
      return true;
    });
  }

  if (q) {
    rows = rows.filter((e) => {
      const hay = [
        e.shortId,
        e.control,
        e.url,
        e.host,
        e.risk,
        e.riskCode,
        e.compromise,
        e.signal,
        e.resolutionNotes ?? "",
        e.fixAnalysis ?? "",
        e.firstSeenAt,
        e.resolvedAt ?? "",
        formatOpenRange(e),
        formatHeavyTimestamp(e.firstSeenAt),
        formatHeavyTimestamp(e.resolvedAt),
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }

  if (options.alphabetical) {
    return [...rows].sort(
      (a, b) =>
        a.control.localeCompare(b.control, "fr") ||
        a.shortId.localeCompare(b.shortId),
    );
  }
  return rows;
}

function parseDayBound(
  value: string | undefined,
  kind: "start" | "end",
): number | null {
  if (!value?.trim()) return null;
  const raw = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return Date.parse(
      kind === "start" ? `${raw}T00:00:00.000Z` : `${raw}T23:59:59.999Z`,
    );
  }
  const t = Date.parse(raw);
  return Number.isNaN(t) ? null : t;
}

function compareEntries(a: VulnTrackEntry, b: VulnTrackEntry): number {
  return b.lastSeenAt.localeCompare(a.lastSeenAt);
}

/**
 * Plage de dates : de (premier constat) → à (résolu) ou « ouvert ».
 */
export function formatOpenRange(entry: VulnTrackEntry): string {
  const from = formatHeavyTimestamp(entry.firstSeenAt);
  if (entry.status === "resolved" && entry.resolvedAt) {
    return `${from} → ${formatHeavyTimestamp(entry.resolvedAt)}`;
  }
  return `${from} → ouvert`;
}

/**
 * STUB — ne pas implémenter les propositions IA pour l'instant.
 * Future étape : générer des propositions de correctifs selon le contexte site.
 */
export function proposeAiFixStub(_entry: VulnTrackEntry): null {
  // FUTURE: AI-generated fix propositions based on site context.
  return null;
}

/** Format horodatage lourd FR pour l'UI (date + heure + fuseau court). */
export function formatHeavyTimestamp(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  try {
    const date = new Intl.DateTimeFormat("fr-FR", {
      weekday: "short",
      day: "2-digit",
      month: "short",
      year: "numeric",
    }).format(d);
    const time = new Intl.DateTimeFormat("fr-FR", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
      timeZoneName: "short",
    }).format(d);
    return `${date} · ${time}`;
  } catch {
    return d.toISOString();
  }
}
