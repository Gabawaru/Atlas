import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  buildReportCsv,
  buildReportJson,
  generateReportExports,
} from "./report-export";

const sample = {
  reportId: "rep_test",
  missionId: "mis_test",
  missionTitle: "[FICTIF] Présence web",
  synthetic: true,
  executiveSummary: "[FICTIF] Bilan décideur de démo.",
  technicalDetail: "Module web.passive.presence.v1",
  findings: [
    {
      severity: "info",
      title: "[FICTIF] Finding démo",
      summary: "Exemple",
    },
  ],
  scopeHash: "abc",
  moduleId: "web.passive.presence.v1",
};

describe("report exports", () => {
  it("JSON marque les données FICTIF", () => {
    const json = buildReportJson(sample);
    assert.equal(json.synthetic, true);
    assert.match(String(json.disclaimer), /FICTIF/);
    assert.equal(json.bilanDecideur, sample.executiveSummary);
  });

  it("CSV contient bilan + findings + marqueur", () => {
    const csv = buildReportCsv(sample);
    assert.match(csv, /bilan_decideur/);
    assert.match(csv, /finding/);
    assert.match(csv, /FICTIF/);
  });

  it("JSON/CSV exposent riskTable interprété depuis evidence", () => {
    const withEvidence = {
      ...sample,
      evidence: [
        {
          host: "pragma-serve.com",
          dns: { resolved: true, addresses: ["1.2.3.4"] },
          http: {
            ok: true,
            status: 200,
            securityHeaders: {
              missing: ["strict-transport-security", "content-security-policy"],
            },
          },
          tls: {
            authorized: true,
            protocol: "TLSv1.3",
            daysRemaining: 45,
          },
        },
      ],
    };
    const json = buildReportJson(withEvidence);
    const table = json.riskTable as Array<{ risk: string; control: string }>;
    assert.ok(Array.isArray(table) && table.length > 0);
    assert.ok(table.some((r) => r.control.includes("HSTS") && r.risk === "moyen"));
    const csv = buildReportCsv(withEvidence);
    assert.match(csv, /risk_row/);
    assert.match(csv, /élevé|moyen|faible|info|critique/);
  });

  it("génère JSON + CSV + PDF sur disque", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "atlas-report-"));
    const result = await generateReportExports(sample, dir);
    assert.equal(result.exportsMarkedSynthetic, true);
    assert.ok(result.contentHashes.pdf.length === 64);
    const pdf = await readFile(result.pdfPath);
    assert.ok(pdf.subarray(0, 4).toString() === "%PDF");
    const csvOnDisk = await readFile(
      path.join(dir, `${sample.reportId}.csv`),
      "utf8",
    );
    assert.match(csvOnDisk, /detail_technique/);
  });
});
