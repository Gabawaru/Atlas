import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  aggregateRiskTable,
  buildPresenceRiskTable,
  riskTableFromReportExport,
} from "./riskTable";

describe("client riskTable", () => {
  it("dérive HSTS moyen depuis evidence", () => {
    const rows = buildPresenceRiskTable([
      {
        host: "pragma-serve.com",
        dns: { resolved: true, addresses: ["1.1.1.1"] },
        http: {
          ok: true,
          status: 200,
          securityHeaders: { missing: ["strict-transport-security"] },
        },
        tls: { authorized: true, protocol: "TLSv1.3", daysRemaining: 45 },
      },
    ]);
    const hsts = rows.find((r) => r.control.includes("HSTS"));
    assert.ok(hsts);
    assert.equal(hsts!.risk, "moyen");
    assert.match(hsts!.compromise, /Exposition moyenne/);
  });

  it("riskTableFromReportExport préfère riskTable stocké", () => {
    const rows = riskTableFromReportExport({
      riskTable: [
        {
          control: "Header HSTS absent",
          host: "x",
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
  });

  it("aggregate fusionne hôtes", () => {
    const agg = aggregateRiskTable(
      buildPresenceRiskTable([
        {
          host: "a.test",
          http: {
            ok: true,
            status: 200,
            securityHeaders: { missing: ["referrer-policy"] },
          },
          dns: { resolved: true, addresses: ["1.1.1.1"] },
        },
        {
          host: "b.test",
          http: {
            ok: true,
            status: 200,
            securityHeaders: { missing: ["referrer-policy"] },
          },
          dns: { resolved: true, addresses: ["1.0.0.1"] },
        },
      ]),
    );
    const ref = agg.find((r) => r.control.includes("Referrer"));
    assert.ok(ref);
    assert.match(ref!.host, /a\.test/);
    assert.match(ref!.host, /b\.test/);
  });
});
