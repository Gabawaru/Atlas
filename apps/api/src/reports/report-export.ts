/**
 * Exports rapport MVP : JSON + CSV + PDF.
 * Les exports issus de missions synthétiques sont explicitement marqués FICTIF.
 */
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import PDFDocument from "pdfkit";

export interface ReportExportInput {
  reportId: string;
  missionId: string;
  missionTitle: string;
  synthetic: boolean;
  executiveSummary: string;
  technicalDetail: string;
  findings: Array<{
    severity: string;
    title: string;
    summary: string;
    technical?: string | null;
  }>;
  evidence?: unknown;
  scopeHash?: string;
  moduleId?: string;
}

export interface ReportExportResult {
  json: Record<string, unknown>;
  csv: string;
  pdfPath: string;
  contentHashes: { json: string; csv: string; pdf: string };
  exportsMarkedSynthetic: boolean;
}

function banner(synthetic: boolean): string {
  return synthetic
    ? "FICTIF — Données de démonstration — aucune cible réelle / pas une preuve juridique"
    : "Rapport Atlas — contrôles déterministes ; ne constitue pas un avis juridique";
}

export function buildReportJson(input: ReportExportInput): Record<string, unknown> {
  return {
    format: "atlas.report.v1",
    generatedAt: new Date().toISOString(),
    disclaimer: banner(input.synthetic),
    synthetic: input.synthetic,
    missionId: input.missionId,
    reportId: input.reportId,
    title: input.missionTitle,
    scopeHash: input.scopeHash,
    moduleId: input.moduleId,
    bilanDecideur: input.executiveSummary,
    detailTechnique: input.technicalDetail,
    findings: input.findings,
    evidence: input.evidence ?? null,
  };
}

export function buildReportCsv(input: ReportExportInput): string {
  const rows: string[][] = [
    ["section", "severity", "title", "summary", "synthetic"],
    [
      "disclaimer",
      "",
      banner(input.synthetic),
      "",
      String(input.synthetic),
    ],
    [
      "bilan_decideur",
      "",
      "Bilan décideur",
      input.executiveSummary.replace(/\n/g, " "),
      String(input.synthetic),
    ],
    [
      "detail_technique",
      "",
      "Détail technique",
      input.technicalDetail.replace(/\n/g, " "),
      String(input.synthetic),
    ],
    ...input.findings.map((f) => [
      "finding",
      f.severity,
      f.title,
      f.summary.replace(/\n/g, " "),
      String(input.synthetic),
    ]),
  ];
  return rows.map((r) => r.map(csvEscape).join(",")).join("\n") + "\n";
}

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export async function buildReportPdf(
  input: ReportExportInput,
  outDir: string,
): Promise<{ pdfPath: string; bytes: Buffer }> {
  await mkdir(outDir, { recursive: true });
  const pdfPath = path.join(outDir, `${input.reportId}.pdf`);
  const doc = new PDFDocument({ margin: 50, size: "A4" });
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));

  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  doc.fontSize(16).text("Atlas — Rapport de mission", { underline: true });
  doc.moveDown(0.5);
  doc.fontSize(10).fillColor("#8a4b2a").text(banner(input.synthetic));
  doc.fillColor("#000000");
  doc.moveDown();
  doc.fontSize(12).text(`Mission : ${input.missionTitle}`);
  doc.text(`ID mission : ${input.missionId}`);
  doc.text(`ID rapport : ${input.reportId}`);
  if (input.scopeHash) doc.text(`scope_hash : ${input.scopeHash}`);
  if (input.moduleId) doc.text(`module : ${input.moduleId}`);
  doc.moveDown();
  doc.fontSize(14).text("Bilan décideur");
  doc.fontSize(11).text(input.executiveSummary, { align: "justify" });
  doc.moveDown();
  doc.fontSize(14).text("Détail technique");
  doc.fontSize(11).text(input.technicalDetail, { align: "justify" });
  doc.moveDown();
  doc.fontSize(14).text("Findings");
  for (const f of input.findings) {
    doc.fontSize(11).text(`[${f.severity}] ${f.title}`);
    doc.fontSize(10).text(f.summary);
    doc.moveDown(0.4);
  }
  doc.end();

  const bytes = await done;
  await writeFile(pdfPath, bytes);
  return { pdfPath, bytes };
}

export async function generateReportExports(
  input: ReportExportInput,
  storageRoot?: string,
): Promise<ReportExportResult> {
  const root =
    storageRoot ??
    path.join(process.cwd(), "storage", "reports", input.missionId);
  const json = buildReportJson(input);
  const csv = buildReportCsv(input);
  const { pdfPath, bytes } = await buildReportPdf(input, root);

  const jsonStr = JSON.stringify(json, null, 2);
  await writeFile(path.join(root, `${input.reportId}.json`), jsonStr, "utf8");
  await writeFile(path.join(root, `${input.reportId}.csv`), csv, "utf8");

  return {
    json,
    csv,
    pdfPath,
    contentHashes: {
      json: createHash("sha256").update(jsonStr).digest("hex"),
      csv: createHash("sha256").update(csv).digest("hex"),
      pdf: createHash("sha256").update(bytes).digest("hex"),
    },
    exportsMarkedSynthetic: input.synthetic,
  };
}
