/**
 * Archive des remédiations Atlas — export documentaire (PDF.md).
 *
 * Enregistre ce qui a été fait et l'analyse du correctif final pour chaque
 * entrée résolue du suivi vulnérabilités. Les propositions IA restent hors scope
 * (voir stub `proposeAiFixStub` dans vulnTracking.ts).
 */

import type { VulnTrackEntry, VulnTrackingStore } from "./vulnTracking";
import {
  formatHeavyTimestamp,
  formatOpenRange,
  listResolved,
} from "./vulnTracking";

export type VulnArchiveDocument = {
  /** Nom de fichier suggéré (.pdf.md = Markdown prêt pour rendu/export PDF) */
  filename: string;
  /** Corps Markdown (PDF.md) */
  markdown: string;
  resolvedCount: number;
};

/**
 * Construit l'archive PDF.md à partir des entrées résolues du store de suivi.
 * Chaque entrée porte son ID court CCV + plage de dates + analyse du correctif.
 */
export function buildVulnArchivePdfMd(
  store: VulnTrackingStore,
  meta: { generatedAt?: string; title?: string } = {},
): VulnArchiveDocument {
  const generatedAt = meta.generatedAt ?? new Date().toISOString();
  const resolved = listResolved(store);
  const title = meta.title ?? "Archive Atlas — remédiations vulnérabilités";
  const stamp = generatedAt.slice(0, 10);
  const filename = `atlas-vuln-archive-${stamp}.pdf.md`;

  const lines: string[] = [
    "---",
    "title: Archive Atlas — remédiations",
    "brand: Atlas",
    `generatedAt: ${generatedAt}`,
    `resolvedCount: ${resolved.length}`,
    "format: pdf.md",
    "---",
    "",
    `# ${title}`,
    "",
    `Généré le **${formatHeavyTimestamp(generatedAt)}**.`,
    "",
    "Ce document archive tout ce qui a été fait pour chaque vulnérabilité",
    "marquée résolue, avec l'analyse du correctif final. Chaque entrée est",
    "traçable via son **ID court CCV** (lié à l'empreinte cross-scan).",
    "Les propositions de correctifs par IA sont une étape future — non incluses ici.",
    "",
    "## Synthèse",
    "",
    `| Entrées résolues | ${resolved.length} |`,
    `| Store mis à jour | ${formatHeavyTimestamp(store.updatedAt)} |`,
    "",
  ];

  if (resolved.length === 0) {
    lines.push("_Aucune entrée résolue pour l’instant._", "");
  } else {
    lines.push("## Index des ID", "");
    for (const entry of resolved) {
      lines.push(
        `- **${entry.shortId}** — ${entry.control} (${formatOpenRange(entry)})`,
      );
    }
    lines.push("", "## Détail des remédiations", "");
    resolved.forEach((entry, index) => {
      lines.push(...entrySection(entry, index + 1));
    });
  }

  lines.push(
    "---",
    "",
    "_Document Atlas — suivi cross-scan (empreinte control + URL + hôte → CCV)._ ",
    "",
  );

  return {
    filename,
    markdown: lines.join("\n"),
    resolvedCount: resolved.length,
  };
}

function entrySection(entry: VulnTrackEntry, ordinal: number): string[] {
  return [
    `### ${ordinal}. ${entry.shortId} — ${entry.control}`,
    "",
    `| Champ | Valeur |`,
    `| --- | --- |`,
    `| ID court | **${entry.shortId}** |`,
    `| Empreinte | \`${entry.fingerprint}\` |`,
    `| URL | ${entry.url || "—"} |`,
    `| Hôte | ${entry.host || "—"} |`,
    `| Risque | ${entry.risk} (\`${entry.riskCode}\`) |`,
    `| Plage ouverte | ${formatOpenRange(entry)} |`,
    `| De (premier constat) | ${formatHeavyTimestamp(entry.firstSeenAt)} |`,
    `| À (résolu) | ${formatHeavyTimestamp(entry.resolvedAt)} |`,
    `| Dernier constat | ${formatHeavyTimestamp(entry.lastSeenAt)} |`,
    `| Occurrences (scans) | ${entry.seenCount} |`,
    `| Mission | ${entry.lastMissionId ?? "—"} |`,
    `| Rapport | ${entry.lastReportId ?? "—"} |`,
    "",
    "#### Ce qui a été fait",
    "",
    entry.resolutionNotes?.trim() || "_Non renseigné._",
    "",
    "#### Analyse du correctif final",
    "",
    entry.fixAnalysis?.trim() || "_Non renseigné._",
    "",
    "#### Signal / exposition au moment du suivi",
    "",
    `- Compromission / exposition : ${entry.compromise || "—"}`,
    `- Signal : ${entry.signal || "—"}`,
    "",
  ];
}

/** Déclenche un téléchargement navigateur du PDF.md. */
export function downloadVulnArchivePdfMd(doc: VulnArchiveDocument): void {
  const blob = new Blob([doc.markdown], {
    type: "text/markdown;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = doc.filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
