import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  aggregateRiskTable,
  buildPresenceRiskTable,
  mapSeverityToRisk,
  rowsFromFindings,
} from "./risk-table";

const sampleEvidence = [
  {
    host: "pragma-serve.com",
    dns: { resolved: true, addresses: ["188.114.97.6"] },
    http: {
      ok: true,
      status: 200,
      securityHeaders: {
        missing: [
          "strict-transport-security",
          "content-security-policy",
          "x-frame-options",
          "x-content-type-options",
          "referrer-policy",
        ],
      },
    },
    tls: {
      authorized: true,
      protocol: "TLSv1.3",
      daysRemaining: 45,
      issuerCN: "YE1",
    },
    osint: { ok: false, error: "HTTP 403", source: "rdap" },
  },
  {
    host: "mail.pragma-serve.com",
    dns: { resolved: false, addresses: [] },
    http: { ok: false, error: "fetch failed" },
    tls: { error: "getaddrinfo ENOTFOUND mail.pragma-serve.com" },
  },
];

describe("risk-table", () => {
  it("mapSeverityToRisk — labels FR", () => {
    assert.equal(mapSeverityToRisk("critical").risk, "critique");
    assert.equal(mapSeverityToRisk("high").risk, "élevé");
    assert.equal(mapSeverityToRisk("medium").compromise.includes("moyenne"), true);
    assert.equal(mapSeverityToRisk("info").risk, "info");
  });

  it("buildPresenceRiskTable — headers + TLS + DNS", () => {
    const rows = buildPresenceRiskTable(sampleEvidence);
    assert.ok(rows.length >= 5);
    const hsts = rows.find((r) => r.control.includes("HSTS"));
    assert.ok(hsts);
    assert.equal(hsts!.risk, "moyen");
    assert.match(hsts!.compromise, /Exposition moyenne/);
    const tls = rows.find((r) => r.control.includes("renouvellement"));
    assert.ok(tls);
    assert.equal(tls!.risk, "moyen");
    const dnsMissing = rows.find((r) => r.host === "mail.pragma-serve.com");
    assert.ok(dnsMissing);
    assert.equal(dnsMissing!.risk, "info");
  });

  it("aggregateRiskTable — fusionne hôtes par contrôle", () => {
    const rows = buildPresenceRiskTable([
      {
        host: "a.example",
        http: {
          ok: true,
          status: 200,
          securityHeaders: { missing: ["strict-transport-security"] },
        },
        dns: { resolved: true, addresses: ["1.1.1.1"] },
        tls: { authorized: true, protocol: "TLSv1.3", daysRemaining: 90 },
      },
      {
        host: "b.example",
        http: {
          ok: true,
          status: 200,
          securityHeaders: { missing: ["strict-transport-security"] },
        },
        dns: { resolved: true, addresses: ["1.0.0.1"] },
        tls: { authorized: true, protocol: "TLSv1.3", daysRemaining: 90 },
      },
    ]);
    const agg = aggregateRiskTable(rows);
    const hsts = agg.find((r) => r.control.includes("HSTS"));
    assert.ok(hsts);
    assert.match(hsts!.host, /a\.example/);
    assert.match(hsts!.host, /b\.example/);
  });

  it("rowsFromFindings — sévérité → compromission", () => {
    const rows = rowsFromFindings([
      { title: "CVE démo", severity: "high", summary: "patch" },
    ]);
    assert.equal(rows[0]!.risk, "élevé");
    assert.match(rows[0]!.compromise, /Exposition élevée/);
  });

  it("TLS non autorisé → critique", () => {
    const rows = buildPresenceRiskTable([
      {
        host: "bad.example",
        dns: { resolved: true, addresses: ["9.9.9.9"] },
        tls: { authorized: false, protocol: "TLSv1.2", issuerCN: "Fake" },
      },
    ]);
    const bad = rows.find((r) => r.control.includes("non de confiance"));
    assert.ok(bad);
    assert.equal(bad!.risk, "critique");
  });
});
