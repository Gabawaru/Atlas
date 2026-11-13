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
  parseHstsMaxAge,
  partitionRiskTable,
  bilanFromReportExport,
  formatRdapSignal,
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

  it("TLS LE/YE1 à 45j → info (pas medium) ; unresolved skip", () => {
    assert.equal(isAutoRenewIssuer("YE1"), true);
    const rows = buildPresenceRiskTable([
      {
        host: "pragma-serve.com",
        dns: { resolved: true, addresses: ["1.1.1.1"] },
        http: {
          ok: true,
          status: 200,
          url: "https://pragma-serve.com/",
          cdn: { provider: "Cloudflare", originNotAnalyzed: true },
        },
        tls: {
          authorized: true,
          protocol: "TLSv1.3",
          daysRemaining: 45,
          issuerCN: "YE1",
          autoRenewLikely: true,
        },
      },
      {
        host: "mail.pragma-serve.com",
        dns: { resolved: false, addresses: [] },
        tls: { error: "ENOTFOUND" },
      },
    ]);
    assert.equal(
      rows.some((r) => r.control.includes("renouvellement")),
      false,
    );
    const tls = rows.find((r) => r.control.includes("certificat valide"));
    assert.ok(tls);
    assert.equal(tls!.risk, "info");
    assert.ok(rows.some((r) => r.control.includes("Cloudflare")));
    assert.equal(
      rows.some((r) => r.host === "mail.pragma-serve.com"),
      false,
    );
  });

  it("collapseByControl + bilan (densité UI)", () => {
    const rows = buildPresenceRiskTable([
      {
        host: "a.test",
        dns: { resolved: true, addresses: ["1.1.1.1"] },
        http: {
          ok: true,
          status: 200,
          url: "https://a.test/",
          securityHeaders: { missing: ["content-security-policy"] },
        },
      },
      {
        host: "b.test",
        dns: { resolved: true, addresses: ["1.0.0.1"] },
        http: {
          ok: true,
          status: 200,
          url: "https://b.test/",
          securityHeaders: { missing: ["content-security-policy"] },
        },
      },
    ]);
    const collapsed = collapseRiskTableByControl(rows);
    const csp = collapsed.filter((r) => r.control.includes("CSP"));
    assert.equal(csp.length, 1);
    assert.match(csp[0]!.host, /a\.test.*b\.test|b\.test.*a\.test/);
    const { findings } = partitionRiskTable(collapsed);
    assert.ok(findings.length >= 1);
    const bilan = buildBilanSummary(collapsed);
    assert.ok(bilan.priorityActions.length <= 3);
  });

  it("SPF apex — présent / absent (parity API, osint gate)", () => {
    const present = buildPresenceRiskTable([
      {
        host: "apex.test",
        dns: {
          resolved: true,
          addresses: ["1.1.1.1"],
          txtSample: ["v=spf1 -all"],
        },
        osint: { ok: true, source: "rdap" },
      },
    ]);
    assert.ok(present.find((r) => r.control === "DNS — SPF présent"));
    const missing = buildPresenceRiskTable([
      {
        host: "apex.test",
        dns: { resolved: true, addresses: ["1.1.1.1"], txtSample: [] },
        osint: { ok: true, source: "rdap" },
      },
    ]);
    const absent = missing.find((r) => r.control === "DNS — SPF absent");
    assert.ok(absent);
    assert.equal(absent!.risk, "faible");
  });

  it("RDAP signal enrichi — registrar + expiry (parity API)", () => {
    assert.match(
      formatRdapSignal({
        ok: true,
        source: "rdap",
        registrar: "Example Registrar",
        events: [{ action: "expiration", date: "2027-06-01T00:00:00Z" }],
      }),
      /Example Registrar.*expiry=2027-06-01/,
    );
    const rows = buildPresenceRiskTable([
      {
        host: "apex.test",
        dns: { resolved: true, addresses: ["1.1.1.1"] },
        osint: {
          ok: true,
          source: "rdap",
          registrar: "Cloudflare, Inc.",
          events: [{ action: "expiration", date: "2028-01-15T12:00:00Z" }],
        },
      },
    ]);
    const rdap = rows.find((r) => r.control === "OSINT RDAP");
    assert.ok(rdap);
    assert.match(rdap!.signal ?? "", /Cloudflare/);
    assert.match(rdap!.signal ?? "", /expiry=2028-01-15/);
  });

  it("HSTS max-age insuffisant — faible + pas all-clear (parity API)", () => {
    assert.equal(parseHstsMaxAge("max-age=86400"), 86400);
    assert.equal(isHstsMaxAgeWeak("max-age=86400"), true);
    assert.equal(isHstsMaxAgeWeak(`max-age=${HSTS_MAX_AGE_FLOOR_SEC}`), false);
    const rows = buildPresenceRiskTable([
      {
        host: "weak-hsts.test",
        dns: { resolved: true, addresses: ["1.1.1.1"] },
        http: {
          ok: true,
          status: 200,
          url: "https://weak-hsts.test/",
          securityHeaders: { missing: [], hsts: "max-age=1" },
        },
      },
    ]);
    const weak = rows.find((r) => r.control.includes("max-age insuffisant"));
    assert.ok(weak);
    assert.equal(weak!.risk, "faible");
    assert.equal(
      rows.some((r) => r.control === "Headers de sécurité"),
      false,
    );
  });

  it("dérive headers all-clear when missing=[] (parity API pushHeaderRows)", () => {
    const rows = buildPresenceRiskTable([
      {
        host: "ok.test",
        dns: { resolved: true, addresses: ["1.1.1.1"] },
        http: {
          ok: true,
          status: 200,
          url: "https://ok.test/",
          securityHeaders: { missing: [] },
        },
      },
    ]);
    const clear = rows.find((r) => r.control === "Headers de sécurité");
    assert.ok(clear, "empty missing[] must surface all-clear on rebuild");
    assert.equal(clear!.risk, "info");
    assert.match(clear!.signal ?? "", /aucun header critique manquant/);
  });

  it("dérive HTTP sonde en échec (parity API pushDnsHttpRows)", () => {
    const rows = buildPresenceRiskTable([
      {
        host: "down.test",
        dns: { resolved: true, addresses: ["1.1.1.1"] },
        http: {
          ok: false,
          url: "https://down.test/",
          error: "fetch failed",
        },
      },
    ]);
    const http = rows.find((r) => r.control.includes("HTTP — sonde"));
    assert.ok(http, "http.error must reach client riskTable rebuild");
    assert.equal(http!.risk, "info");
    assert.match(http!.signal ?? "", /fetch failed/);
  });

  it("dérive TLS unauthorized + issuerCN (parity API pushTlsRows)", () => {
    const rows = buildPresenceRiskTable([
      {
        host: "bad.test",
        dns: { resolved: true, addresses: ["1.1.1.1"] },
        http: { ok: true, status: 200, url: "https://bad.test/" },
        tls: {
          authorized: false,
          protocol: "TLSv1.3",
          issuerCN: "Evil CA",
        },
      },
    ]);
    const tls = rows.find((r) => r.control.includes("non de confiance"));
    assert.ok(tls);
    assert.equal(tls!.risk, "critique");
    assert.match(tls!.signal ?? "", /issuer=Evil CA/);
  });

  it("dérive TLS expiration imminente + protocol (parity API pushTlsRows)", () => {
    const rows = buildPresenceRiskTable([
      {
        host: "soon.test",
        dns: { resolved: true, addresses: ["1.1.1.1"] },
        http: { ok: true, status: 200, url: "https://soon.test/" },
        tls: {
          authorized: true,
          protocol: "TLSv1.3",
          daysRemaining: 7,
        },
      },
    ]);
    const tls = rows.find((r) => r.control.includes("expiration imminente"));
    assert.ok(tls);
    assert.equal(tls!.risk, "élevé");
    assert.match(tls!.signal ?? "", /7 j restants · TLSv1\.3/);
  });

  it("dérive cookie flags manquants (parity API pushCookieRows)", () => {
    const rows = buildPresenceRiskTable([
      {
        host: "a.test",
        dns: { resolved: true, addresses: ["1.1.1.1"] },
        http: {
          ok: true,
          status: 200,
          url: "https://a.test/",
          cookies: [
            { name: "session", missingFlags: ["Secure", "HttpOnly"] },
            { name: "prefs", missingFlags: ["SameSite"] },
          ],
        },
      },
    ]);
    const session = rows.find((r) => r.control.includes("session"));
    assert.ok(session, "Secure/HttpOnly cookie must reach client riskTable rebuild");
    assert.equal(session!.risk, "moyen");
    assert.match(session!.signal ?? "", /Secure/);
    const prefs = rows.find((r) => r.control.includes("prefs"));
    assert.ok(prefs);
    assert.equal(prefs!.risk, "faible");
  });

  it("bilanFromReportExport lit bilanScore + priorityActions", () => {
    assert.equal(bilanFromReportExport(null), null);
    assert.equal(bilanFromReportExport({ riskTable: [] }), null);
    const bilan = bilanFromReportExport({
      bilanScore: 77,
      priorityActions: ["Header HSTS absent (a.test)", "x", "y", "z"],
    });
    assert.deepEqual(bilan, {
      score: 77,
      priorityActions: [
        "Header HSTS absent (a.test)",
        "x",
        "y",
      ],
    });
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
            missing: [],
            browserOnlySkipped: true,
          },
        },
      },
    ]);
    const obs = rows.find((r) => r.control.includes("CSP/XFO non applicables"));
    assert.ok(obs);
    assert.equal(obs!.risk, "info");
  });

  it("redirect — http sans HTTPS + stuck 3xx scorés", () => {
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
          url: "https://loop.example/e",
          redirectChain: Array.from({ length: 5 }, (_, i) => ({
            url: `https://loop.example/${i}`,
            status: 302,
            location: `https://loop.example/${i + 1}`,
          })),
        },
      },
    ]);
    const unresolved = stuck.find((r) =>
      r.control.includes("redirection non résolue"),
    );
    assert.ok(unresolved);
    assert.equal(unresolved!.risk, "faible");
  });
});
