/** Client helpers for GET /v1/missions/:id/reports/:reportId/export */

export type ReportExportFormat = "json" | "csv" | "pdf";

export const REPORT_EXPORT_FORMATS: ReportExportFormat[] = [
  "json",
  "csv",
  "pdf",
];

export function reportExportUrl(
  apiBase: string,
  missionId: string,
  reportId: string,
  format: ReportExportFormat,
): string {
  const base = apiBase.replace(/\/$/, "");
  const q = new URLSearchParams({ format });
  return `${base}/v1/missions/${encodeURIComponent(missionId)}/reports/${encodeURIComponent(reportId)}/export?${q}`;
}

/** Prefer Content-Disposition filename; fall back to reportId + format. */
export function filenameFromDisposition(
  header: string | null,
  reportId: string,
  format: ReportExportFormat,
): string {
  if (header) {
    const star = /filename\*=UTF-8''([^;]+)/i.exec(header);
    if (star?.[1]) {
      try {
        return decodeURIComponent(star[1].trim());
      } catch {
        /* keep scanning */
      }
    }
    const plain = /filename="([^"]+)"/i.exec(header);
    if (plain?.[1]) return plain[1];
    const bare = /filename=([^;\s]+)/i.exec(header);
    if (bare?.[1]) return bare[1].replace(/^"|"$/g, "");
  }
  return `${reportId}.${format}`;
}

export function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
