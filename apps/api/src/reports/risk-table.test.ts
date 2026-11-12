import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  aggregateRiskTable,
  buildBilanSummary,
  buildPresenceRiskTable,
  collapseRiskTableByControl,
  evidenceTargetUrl,
  HSTS_MAX_AGE_FLOOR_SEC,
  isAutoRenewIssuer,
  isHstsMaxAgeWeak,
  mapSeverityToRisk,
  parseHstsMaxAge,
  partitionRiskTable,
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
      cdn: { provider: "Cloudflare", originNotAnalyzed: true },
      securityHeaders: {
        missing: [
          "strict-transport-security",
          "content-security-policy",
          "x-frame-options",
          "x-content-type-options",
          "referrer-policy",
          "permissions-policy",
        ],
      },
    },
    tls: {
      authorized: true,
      protocol: "TLSv1.3",
      daysRemaining: 45,
      issuerCN: "YE1",
      autoRenewLikely: true,
    },
    osint: { ok: true, source: "rdap" },
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

  it("isAutoRenewIssuer — LE / YE1", () => {
    assert.equal(isAutoRenewIssuer("YE1"), true);
    assert.equal(isAutoRenewIssuer("R3"), true);
    assert.equal(isAutoRenewIssuer("Let's Encrypt"), true);
    assert.equal(isAutoRenewIssuer("DigiCert SHA2"), false);
  });

  it("parseHstsMaxAge / isHstsMaxAgeWeak — floor 180j", () => {
    assert.equal(parseHstsMaxAge("max-age=31536000; includeSubDomains"), 31536000);
    assert.equal(parseHstsMaxAge("max-age=1"), 1);
    assert.equal(parseHstsMaxAge("includeSubDomains"), null);
    assert.equal(isHstsMaxAgeWeak("max-age=1"), true);
    assert.equal(isHstsMaxAgeWeak(`max-age=${HSTS_MAX_AGE_FLOOR_SEC}`), false);
    assert.equal(isHstsMaxAgeWeak(undefined), false);
  });

  it("buildPresenceRiskTable — HSTS max-age insuffisant (faible, pas all-clear)", () => {
    const rows = buildPresenceRiskTable([
      {
        host: "weak-hsts.test",
        dns: { resolved: true, addresses: ["1.1.1.1"] },
        http: {
          ok: true,
          status: 200,
          url: "https://weak-hsts.test/",
          securityHeaders: {
            missing: [],
            hsts: "max-age=1",
          },
        },
      },
    ]);
    const weak = rows.find((r) => r.control.includes("max-age insuffisant"));
    assert.ok(weak);
    assert.equal(weak!.risk, "faible");
    assert.match(weak!.signal ?? "", /max-age=1/);
    assert.equal(
      rows.some((r) => r.control === "Headers de sécurité"),
      false,
      "weak HSTS must not emit all-clear",
    );
  });

  it("buildPresenceRiskTable — headers + TLS auto-renew + skip unresolved", () => {
    const rows = buildPresenceRiskTable(sampleEvidence);
    assert.ok(rows.length >= 6);
    const hsts = rows.find((r) => r.control.includes("HSTS"));
    assert.ok(hsts);
    assert.equal(hsts!.risk, "moyen");
    assert.equal(hsts!.url, "https://pragma-serve.com/");
    assert.match(hsts!.compromise, /Exposition moyenne/);
    const pp = rows.find((r) => r.control.includes("Permissions-Policy"));
    assert.ok(pp, "Permissions-Policy missing must surface in riskTable");
    assert.equal(pp!.risk, "faible");
    // YE1 / LE 45j → info (pas medium)
    const tlsRenew = rows.find((r) => r.control.includes("renouvellement"));
    assert.equal(tlsRenew, undefined);
    const tlsOk = rows.find((r) => r.control.includes("certificat valide"));
    assert.ok(tlsOk);
    assert.equal(tlsOk!.risk, "info");
    assert.match(tlsOk!.signal ?? "", /auto-renew/);
    const cf = rows.find((r) => r.control.includes("Cloudflare"));
    assert.ok(cf, "Cloudflare origin note required");
    assert.equal(cf!.risk, "info");
    // mail.* non résolu — absent du tableau
    assert.equal(
      rows.some((r) => r.host === "mail.pragma-serve.com"),
      false,
    );
  });

  it("TLS 45j sans auto-renew → medium ; ≤14j → high même ACME", () => {
    const mid = buildPresenceRiskTable([
      {
        host: "manual.example",
        dns: { resolved: true, addresses: ["1.1.1.1"] },
        tls: {
          authorized: true,
          protocol: "TLSv1.2",
          daysRemaining: 45,
          issuerCN: "DigiCert SHA2 Secure Server CA",
        },
      },
    ]);
    const plan = mid.find((r) => r.control.includes("renouvellement"));
    assert.ok(plan);
    assert.equal(plan!.risk, "moyen");

    const soon = buildPresenceRiskTable([
      {
        host: "le.example",
        dns: { resolved: true, addresses: ["1.1.1.1"] },
        tls: {
          authorized: true,
          protocol: "TLSv1.3",
          daysRemaining: 7,
          issuerCN: "R3",
          autoRenewLikely: true,
        },
      },
    ]);
    const imminent = soon.find((r) => r.control.includes("expiration imminente"));
    assert.ok(imminent);
    assert.equal(imminent!.risk, "élevé");
  });

  it("collapse + partition + bilan score/actions", () => {
    const rows = buildPresenceRiskTable([
      {
        host: "a.example",
        dns: { resolved: true, addresses: ["1.1.1.1"] },
        http: {
          ok: true,
          status: 200,
          url: "https://a.example/",
          securityHeaders: { missing: ["strict-transport-security"] },
        },
      },
      {
        host: "b.example",
        dns: { resolved: true, addresses: ["1.0.0.1"] },
        http: {
          ok: true,
          status: 200,
          url: "https://b.example/",
          securityHeaders: { missing: ["strict-transport-security"] },
        },
      },
    ]);
    const collapsed = collapseRiskTableByControl(rows);
    const hsts = collapsed.filter((r) => r.control.includes("HSTS"));
    assert.equal(hsts.length, 1);
    assert.match(hsts[0]!.host, /a\.example/);
    assert.match(hsts[0]!.host, /b\.example/);
    const { findings, observations } = partitionRiskTable(collapsed);
    assert.ok(findings.every((r) => r.riskCode !== "info"));
    assert.ok(observations.every((r) => r.riskCode === "info"));
    const bilan = buildBilanSummary(collapsed);
    assert.ok(bilan.score <= 100 && bilan.score >= 0);
    assert.ok(bilan.priorityActions.length >= 1);
    assert.ok(bilan.priorityActions.length <= 3);
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

  it("API JSON — observation CSP/XFO non applicables", () => {
    const rows = buildPresenceRiskTable([
      {
        host: "api.example.com",
        dns: { resolved: true, addresses: ["1.1.1.1"] },
        http: {
          ok: true,
          status: 200,
          url: "https://api.example.com/",
          securityHeaders: {
            missing: ["permissions-policy"],
            browserOnlySkipped: true,
          },
        },
      },
    ]);
    const obs = rows.find((r) => r.control.includes("CSP/XFO non applicables"));
    assert.ok(obs);
    assert.equal(obs!.risk, "info");
    assert.equal(
      rows.some((r) => r.control.includes("Header CSP absent")),
      false,
    );
  });

  it("redirect — http sans upgrade HTTPS → faible ; stuck 3xx → info/low", () => {
    const plain = buildPresenceRiskTable([
      {
        host: "plain.example",
        dns: { resolved: true, addresses: ["1.1.1.1"] },
        http: {
          ok: true,
          status: 200,
          url: "http://plain.example/",
          redirectChain: [{ url: "http://plain.example/", status: 200 }],
        },
      },
    ]);
    const noHttps = plain.find((r) =>
      r.control.includes("pas de redirection vers HTTPS"),
    );
    assert.ok(noHttps);
    assert.equal(noHttps!.risk, "faible");

    const stuck = buildPresenceRiskTable([
      {
        host: "loop.example",
        dns: { resolved: true, addresses: ["1.1.1.1"] },
        http: {
          ok: false,
          status: 302,
          url: "https://loop.example/a",
          redirectChain: [
            {
              url: "https://loop.example/",
              status: 302,
              location: "https://loop.example/a",
            },
            {
              url: "https://loop.example/a",
              status: 302,
              location: "https://loop.example/b",
            },
            {
              url: "https://loop.example/b",
              status: 302,
              location: "https://loop.example/c",
            },
            {
              url: "https://loop.example/c",
              status: 302,
              location: "https://loop.example/d",
            },
            {
              url: "https://loop.example/d",
              status: 302,
              location: "https://loop.example/e",
            },
          ],
        },
      },
    ]);
    const unresolved = stuck.find((r) =>
      r.control.includes("redirection non résolue"),
    );
    assert.ok(unresolved);
    assert.equal(unresolved!.risk, "faible");
    assert.match(unresolved!.signal, /hops=5/);
  });
});
