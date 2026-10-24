/**
 * Import hiérarchie prêt (CSV / JSON) — format + validation.
 * N'invente jamais d'approbateurs. Fichier vide → 0 membre → pas de route.
 */

export type HierarchyImportRow = {
  email: string;
  /** Ignoré pour le routage MVP — documentation / futur mapping */
  role?: string;
};

export type HierarchyParseResult = {
  rows: HierarchyImportRow[];
  empty: boolean;
  errors: string[];
};

/** Contenu vide ou uniquement commentaires / en-tête → empty. */
export function parseHierarchyCsv(content: string): HierarchyParseResult {
  const errors: string[] = [];
  const text = content.replace(/^\uFEFF/, "").trim();
  if (!text) {
    return { rows: [], empty: true, errors: [] };
  }
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"));
  if (lines.length === 0) {
    return { rows: [], empty: true, errors: [] };
  }

  let start = 0;
  const header = lines[0]!.toLowerCase();
  if (header.includes("email") || header.includes("courriel")) {
    start = 1;
  }
  if (start >= lines.length) {
    return { rows: [], empty: true, errors: [] };
  }

  const rows: HierarchyImportRow[] = [];
  for (let i = start; i < lines.length; i++) {
    const cols = lines[i]!.split(/[,;\t]/).map((c) => c.trim().replace(/^"|"$/g, ""));
    const email = (cols[0] ?? "").toLowerCase();
    if (!email) continue;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errors.push(`Ligne ${i + 1}: email invalide « ${cols[0]} »`);
      continue;
    }
    rows.push({ email, role: cols[1] || undefined });
  }
  return { rows, empty: rows.length === 0, errors };
}

export function parseHierarchyJson(content: string): HierarchyParseResult {
  const text = content.replace(/^\uFEFF/, "").trim();
  if (!text || text === "[]" || text === "{}") {
    return { rows: [], empty: true, errors: [] };
  }
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { rows: [], empty: true, errors: ["JSON invalide"] };
  }
  const list = Array.isArray(data)
    ? data
    : Array.isArray((data as { approvers?: unknown }).approvers)
      ? (data as { approvers: unknown[] }).approvers
      : null;
  if (!list) {
    return {
      rows: [],
      empty: true,
      errors: ["JSON : tableau ou { approvers: [...] } attendu"],
    };
  }
  if (list.length === 0) {
    return { rows: [], empty: true, errors: [] };
  }
  const rows: HierarchyImportRow[] = [];
  const errors: string[] = [];
  for (let i = 0; i < list.length; i++) {
    const item = list[i];
    const email =
      typeof item === "string"
        ? item.toLowerCase()
        : typeof item === "object" &&
            item &&
            "email" in item &&
            typeof (item as { email: unknown }).email === "string"
          ? (item as { email: string }).email.toLowerCase()
          : "";
    if (!email) {
      errors.push(`Entrée ${i + 1}: email manquant`);
      continue;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errors.push(`Entrée ${i + 1}: email invalide`);
      continue;
    }
    const role =
      typeof item === "object" &&
      item &&
      "role" in item &&
      typeof (item as { role: unknown }).role === "string"
        ? (item as { role: string }).role
        : undefined;
    rows.push({ email, role });
  }
  return { rows, empty: rows.length === 0, errors };
}

export function parseHierarchyFile(
  content: string,
  format: "csv" | "json",
): HierarchyParseResult {
  return format === "json" ? parseHierarchyJson(content) : parseHierarchyCsv(content);
}

/**
 * Ne crée jamais d'utilisateur. Ne garde que les emails déjà staff approver.
 */
export function matchExistingApprovers(
  rows: HierarchyImportRow[],
  existingApproverEmails: Map<string, string>, // email → userId
): {
  matchedUserIds: string[];
  unknownEmails: string[];
} {
  const matchedUserIds: string[] = [];
  const unknownEmails: string[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const id = existingApproverEmails.get(row.email.toLowerCase());
    if (!id) {
      unknownEmails.push(row.email);
      continue;
    }
    if (seen.has(id)) continue;
    seen.add(id);
    matchedUserIds.push(id);
  }
  return { matchedUserIds, unknownEmails };
}
