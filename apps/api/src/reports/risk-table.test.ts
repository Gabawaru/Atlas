import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  aggregateRiskTable,
  buildPresenceRiskTable,
  evidenceTargetUrl,
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
      url: "https://pragma-serve.com/",
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
    http: {
      ok: false,
      url: "https://mail.pragma-serve.com/",
      error: "fetch failed",
    },
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

  it("evidenceTargetUrl — https://host/ par défaut", () => {
    assert.equal(evidenceTargetUrl("a.example"), "https://a.example/");
    assert.equal(
      evidenceTargetUrl("a.example", "https://a.example/app"),
      "https://a.example/app",
    );
    assert.equal(evidenceTargetUrl("—"), "");
  });

  it("buildPresenceRiskTable — headers + TLS + DNS + url", () => {
    const rows = buildPresenceRiskTable(sampleEvidence);
    assert.ok(rows.length >= 5);
    const hsts = rows.find((r) => r.control.includes("HSTS"));
    assert.ok(hsts);
    assert.equal(hsts!.risk, "moyen");
    assert.equal(hsts!.url, "https://pragma-serve.com/");
    assert.match(hsts!.compromise, /Exposition moyenne/);
    const tls = rows.find((r) => r.control.includes("renouvellement"));
    assert.ok(tls);
    assert.equal(tls!.risk, "moyen");
    const dnsMissing = rows.find((r) => r.host === "mail.pragma-serve.com");
    assert.ok(dnsMissing);
    assert.equal(dnsMissing!.risk, "info");
    assert.equal(dnsMissing!.url, "https://mail.pragma-serve.com/");
  });

  it("expand — blob legacy → une URL par hôte", () => {
    const agg = aggregateRiskTable([
      {
        control: "Header HSTS absent",
        host: "api.x, www.x",
        url: "",
        riskCode: "medium",
        risk: "moyen",
        compromise: "Exposition moyenne",
        signal: "hsts",
      },
    ]);
    assert.equal(agg.length, 2);
    assert.deepEqual(
      agg.map((r) => r.url).sort(),
      ["https://api.x/", "https://www.x/"],
    );
  });

  it("aggregateRiskTable — une ligne par URL (pas de blob hôtes)", () => {
    const rows = buildPresenceRiskTable([
      {
        host: "a.example",
        http: {
          ok: true,
          status: 200,
          url: "https://a.example/",
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
          url: "https://b.example/",
          securityHeaders: { missing: ["strict-transport-security"] },
        },
        dns: { resolved: true, addresses: ["1.0.0.1"] },
        tls: { authorized: true, protocol: "TLSv1.3", daysRemaining: 90 },
      },
    ]);
    const agg = aggregateRiskTable(rows);
    const hsts = agg.filter((r) => r.control.includes("HSTS"));
    assert.equal(hsts.length, 2);
    assert.equal(hsts[0]!.host.includes(","), false);
    assert.equal(hsts[1]!.host.includes(","), false);
    const urls = hsts.map((r) => r.url).sort();
    assert.deepEqual(urls, ["https://a.example/", "https://b.example/"]);
  });

  it("rowsFromFindings — sévérité → compromission", () => {
    const rows = rowsFromFindings([
      { title: "CVE démo", severity: "high", summary: "patch" },
    ]);
    assert.equal(rows[0]!.risk, "élevé");
    assert.match(rows[0]!.compromise, /Exposition élevée/);
    assert.equal(rows[0]!.url, "");
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
    assert.equal(bad!.url, "https://bad.example/");
  });
});
