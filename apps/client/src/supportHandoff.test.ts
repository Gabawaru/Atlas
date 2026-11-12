import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildSupportHandoffReport,
  requestPragmaSupportHandoff,
} from "./supportHandoff";
import {
  emptyVulnTrackingStore,
  ingestRiskTableIntoTracking,
  type VulnTrackEntry,
} from "./vulnTracking";
import type { RiskTableRow } from "./riskTable";

function sampleEntry(): VulnTrackEntry {
  const store = ingestRiskTableIntoTracking(emptyVulnTrackingStore(), [
    {
      host: "pragma-serve.com",
      url: "https://pragma-serve.com/",
      control: "Header HSTS absent",
      riskCode: "medium",
      risk: "moyen",
      compromise: "Exposition moyenne",
      signal: "hsts",
    } satisfies RiskTableRow,
  ], { seenAt: "2026-11-01T10:00:00.000Z" });
  return store.entries[0]!;
}

describe("supportHandoff", () => {
  it("buildSupportHandoffReport inclut Statut + dates", () => {
    const md = buildSupportHandoffReport([sampleEntry()]);
    assert.match(md, /À corriger/);
    assert.match(md, /2026-11-01T10:00:00.000Z/);
    assert.match(md, /seul egress/i);
    assert.match(md, /abonnement/i);
  });

  it("refus local_only sans compte support — aucun fetch", async () => {
    let called = false;
    const r = await requestPragmaSupportHandoff({
      entries: [sampleEntry()],
      apiBase: "http://localhost:3001",
      token: null,
      supportCustomer: false,
      fetchImpl: (async () => {
        called = true;
        return new Response("{}");
      }) as typeof fetch,
    });
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.code, "local_only");
    assert.equal(called, false);
  });

  it("refus no_selection", async () => {
    const r = await requestPragmaSupportHandoff({
      entries: [],
      apiBase: "http://localhost:3001",
      token: "t",
      supportCustomer: true,
    });
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.code, "no_selection");
  });

  it("POST /v1/support/handoff quand support + token", async () => {
    let url = "";
    let body: unknown;
    const r = await requestPragmaSupportHandoff({
      entries: [sampleEntry()],
      apiBase: "http://localhost:3001",
      token: "tok",
      supportCustomer: true,
      fetchImpl: (async (input, init) => {
        url = String(input);
        body = JSON.parse(String(init?.body ?? "{}"));
        return new Response(
          JSON.stringify({
            ticketId: "tix-1",
            notice: "ok",
          }),
          { status: 200 },
        );
      }) as typeof fetch,
    });
    assert.equal(r.ok, true);
    assert.equal(url, "http://localhost:3001/v1/support/handoff");
    assert.ok(body && typeof body === "object");
    const b = body as { reportMarkdown: string; fingerprints: string[] };
    assert.match(b.reportMarkdown, /HSTS/);
    assert.equal(b.fingerprints.length, 1);
    if (r.ok) assert.equal(r.ticketId, "tix-1");
  });

  it("après handoff + supportSessionId → POST /v1/support/vulns (scanner opt-in)", async () => {
    const calls: { url: string; body: unknown; headers: HeadersInit | undefined }[] =
      [];
    const r = await requestPragmaSupportHandoff({
      entries: [sampleEntry()],
      apiBase: "http://localhost:3001",
      token: "tok",
      supportCustomer: true,
      fetchImpl: (async (input, init) => {
        const url = String(input);
        calls.push({
          url,
          body: JSON.parse(String(init?.body ?? "{}")),
          headers: init?.headers,
        });
        if (url.endsWith("/v1/support/handoff")) {
          return new Response(
            JSON.stringify({
              ticketId: "tix-2",
              supportSessionId: "sup_opaque_test",
              notice: "ok",
            }),
            { status: 200 },
          );
        }
        if (url.endsWith("/v1/support/vulns")) {
          return new Response(JSON.stringify({ vulns: [] }), { status: 200 });
        }
        return new Response("nope", { status: 404 });
      }) as typeof fetch,
    });
    assert.equal(r.ok, true);
    if (r.ok) assert.equal(r.supportSessionId, "sup_opaque_test");
    assert.equal(calls.length, 2);
    assert.equal(calls[1]!.url, "http://localhost:3001/v1/support/vulns");
    const headers = calls[1]!.headers as Record<string, string>;
    assert.equal(headers["X-Atlas-Support-Session"], "sup_opaque_test");
    const ingest = calls[1]!.body as {
      vulns: Array<{ title: string; fingerprint: string }>;
      source: string;
    };
    assert.equal(ingest.source, "scanner-opt-in");
    assert.match(ingest.vulns[0]!.title, /HSTS/);
    assert.equal(/email|firstName/i.test(JSON.stringify(ingest)), false);
  });
});
