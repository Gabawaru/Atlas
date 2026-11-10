import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  aggregateRiskTable,
  buildPresenceRiskTable,
  evidenceTargetUrl,
  riskTableFromReportExport,
} from "./riskTable";

describe("client riskTable", () => {
  it("dérive HSTS moyen + url depuis evidence", () => {
    const rows = buildPresenceRiskTable([
      {
        host: "pragma-serve.com",
        dns: { resolved: true, addresses: ["1.1.1.1"] },
        http: {
          ok: true,
          status: 200,
          url: "https://pragma-serve.com/",
          securityHeaders: { missing: ["strict-transport-security"] },
        },
        tls: { authorized: true, protocol: "TLSv1.3", daysRemaining: 45 },
      },
    ]);
    const hsts = rows.find((r) => r.control.includes("HSTS"));
    assert.ok(hsts);
    assert.equal(hsts!.risk, "moyen");
    assert.equal(hsts!.url, "https://pragma-serve.com/");
    assert.match(hsts!.compromise, /Exposition moyenne/);
  });

  it("riskTableFromReportExport préfère riskTable stocké + backfill url", () => {
    const rows = riskTableFromReportExport({
      riskTable: [
        {
          control: "Header HSTS absent",
          host: "x.example",
          url: "",
          riskCode: "medium",
          risk: "moyen",
          compromise: "Exposition moyenne",
          signal: "hsts",
        },
      ],
      evidence: [],
    });
    assert.equal(rows.length, 1);
    assert.equal(rows[0]!.risk, "moyen");
    assert.equal(rows[0]!.url, "https://x.example/");
  });

  it("riskTableFromReportExport reconstruit depuis evidence si blob legacy", () => {
    const rows = riskTableFromReportExport({
      riskTable: [
        {
          control: "Header HSTS absent",
          host: "a.test, b.test",
          url: "",
          riskCode: "medium",
          risk: "moyen",
          compromise: "Exposition moyenne",
          signal: "hsts",
        },
      ],
      evidence: [
        {
          host: "a.test",
          http: {
            ok: true,
            status: 200,
            url: "https://a.test/",
            securityHeaders: { missing: ["strict-transport-security"] },
          },
          dns: { resolved: true, addresses: ["1.1.1.1"] },
        },
        {
          host: "b.test",
          http: {
            ok: true,
            status: 200,
            url: "https://b.test/",
            securityHeaders: { missing: ["strict-transport-security"] },
          },
          dns: { resolved: true, addresses: ["1.0.0.1"] },
        },
      ],
    });
    const hsts = rows.filter((r) => r.control.includes("HSTS"));
    assert.equal(hsts.length, 2);
    assert.deepEqual(
      hsts.map((r) => r.url).sort(),
      ["https://a.test/", "https://b.test/"],
    );
  });

  it("aggregate — une ligne par URL (pas de blob)", () => {
    const agg = aggregateRiskTable(
      buildPresenceRiskTable([
        {
          host: "a.test",
          http: {
            ok: true,
            status: 200,
            url: "https://a.test/",
            securityHeaders: { missing: ["referrer-policy"] },
          },
          dns: { resolved: true, addresses: ["1.1.1.1"] },
        },
        {
          host: "b.test",
          http: {
            ok: true,
            status: 200,
            url: "https://b.test/",
            securityHeaders: { missing: ["referrer-policy"] },
          },
          dns: { resolved: true, addresses: ["1.0.0.1"] },
        },
      ]),
    );
    const refs = agg.filter((r) => r.control.includes("Referrer"));
    assert.equal(refs.length, 2);
    assert.equal(refs.every((r) => !r.host.includes(",")), true);
    assert.deepEqual(
      refs.map((r) => r.url).sort(),
      ["https://a.test/", "https://b.test/"],
    );
    assert.equal(evidenceTargetUrl("solo.test"), "https://solo.test/");
  });
});
