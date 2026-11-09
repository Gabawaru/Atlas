import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  PragmaSignClient,
  PRAGMA_SIGN_USER_AGENT,
  mapPragmaStatusToSignatureStatus,
  mapPragmaStatusToAuthz,
  type FetchLike,
} from "./pragma-sign.client";
import { PragmaSignSignatureProvider } from "./pragma-sign.provider";
import { resolveSignedAuthzAttested } from "./authz-attestation";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("PragmaSignClient (mocked HTTP)", () => {
  it("envoie X-Api-Key + User-Agent atlas/1.0", async () => {
    const seen: { url?: string; headers?: HeadersInit } = {};
    const fetchImpl: FetchLike = async (url, init) => {
      seen.url = String(url);
      seen.headers = init?.headers;
      return jsonResponse({
        signature: { id: 5678, status: "pending" },
        events: [],
      });
    };
    const client = new PragmaSignClient({
      apiKey: "test-key-not-real",
      fetchImpl,
    });
    const env = await client.getEnvelope("5678");
    assert.equal(env.signature.status, "pending");
    assert.match(seen.url!, /\/v1\/partner\/signatures\/5678$/);
    const h = seen.headers as Record<string, string>;
    assert.equal(h["X-Api-Key"], "test-key-not-real");
    assert.equal(h["User-Agent"], PRAGMA_SIGN_USER_AGENT);
  });

  it("mappe les statuts API", () => {
    assert.equal(mapPragmaStatusToSignatureStatus("signed"), "signed");
    assert.equal(mapPragmaStatusToSignatureStatus("viewed"), "pending");
    assert.equal(mapPragmaStatusToSignatureStatus("refused"), "declined");
    assert.equal(mapPragmaStatusToAuthz("cancelled"), "rejected");
    assert.equal(mapPragmaStatusToAuthz("signed"), "signed");
  });
});

describe("PragmaSignSignatureProvider (mocked HTTP)", () => {
  const prevPurpose = process.env.ATLAS_PURPOSE_ENFORCE;

  beforeEach(() => {
    delete process.env.ATLAS_PURPOSE_ENFORCE;
  });

  afterEach(() => {
    if (prevPurpose === undefined) delete process.env.ATLAS_PURPOSE_ENFORCE;
    else process.env.ATLAS_PURPOSE_ENFORCE = prevPurpose;
  });

  it("createEnvelope → documents + request, isMock false sur artifact", async () => {
    const calls: string[] = [];
    const fetchImpl: FetchLike = async (url, init) => {
      const u = String(url);
      const method = (init?.method ?? "GET").toUpperCase();
      calls.push(`${method} ${u}`);
      if (u.endsWith("/documents") && method === "POST") {
        return jsonResponse({ id: 1234 });
      }
      if (u.endsWith("/request") && method === "POST") {
        return jsonResponse({
          id: "5678",
          token: "tok",
          sign_url: "https://sign.pragma.mc/tok",
          status: "pending",
          expires_at: "2099-01-01T00:00:00Z",
        });
      }
      if (u.includes("/signatures/5678") && method === "GET") {
        return jsonResponse({
          signature: {
            id: 5678,
            status: "signed",
            signer_email: "owner@t.local",
          },
          events: [],
        });
      }
      return jsonResponse({ detail: "unexpected " + u }, 500);
    };

    const p = new PragmaSignSignatureProvider({
      apiKey: "test-key-not-real",
      fetchImpl,
    });
    const env = await p.createEnvelope("doc-hash-abc", [
      { email: "owner@t.local", name: "Owner", role: "owner" },
      { email: "ops@a.local", name: "Ops", role: "counterparty" },
    ]);
    assert.equal(env.provider, "pragma-sign");
    assert.equal(env.envelopeId, "5678");
    assert.equal(env.status, "pending");

    assert.equal(await p.getStatus("5678"), "signed");
    const art = await p.fetchArtifact("5678");
    assert.equal(art.isMock, false);
    assert.ok(art.signedBy.includes("owner@t.local"));
    assert.ok(calls.some((c) => c.includes("/documents")));
    assert.ok(calls.some((c) => c.includes("/request")));
  });

  it("sign() poll après création (pending → signed)", async () => {
    let status: "pending" | "signed" = "pending";
    let created = false;
    const fetchImpl: FetchLike = async (url, init) => {
      const u = String(url);
      const method = (init?.method ?? "GET").toUpperCase();
      if (u.endsWith("/documents") && method === "POST") {
        created = true;
        return jsonResponse({ id: 99 });
      }
      if (u.endsWith("/request") && method === "POST") {
        return jsonResponse({
          id: "42",
          token: "t",
          sign_url: "https://sign.pragma.mc/t",
          status: "pending",
          expires_at: "2099-01-01T00:00:00Z",
        });
      }
      if (u.includes("/signatures/42") && method === "GET") {
        return jsonResponse({
          signature: { id: 42, status },
          events: [],
        });
      }
      return jsonResponse({ detail: "nope" }, 404);
    };

    const p = new PragmaSignSignatureProvider({
      apiKey: "test-key-not-real",
      fetchImpl,
    });
    const first = await p.sign({ documentHash: "chat-doc", purpose: "chat" });
    assert.equal(first.status, "pending");
    assert.equal(first.isMock, false);
    assert.equal(first.requestId, "42");
    assert.equal(created, true);

    status = "signed";
    const second = await p.sign({ documentHash: "chat-doc", purpose: "chat" });
    assert.equal(second.status, "signed");
    assert.equal(second.requestId, "42");
  });
});

describe("resolveSignedAuthzAttested", () => {
  const prevKey = process.env.PRAGMA_SIGN_API_KEY;
  const prevAuthz = process.env.ATLAS_AUTHZ;

  afterEach(() => {
    if (prevKey === undefined) delete process.env.PRAGMA_SIGN_API_KEY;
    else process.env.PRAGMA_SIGN_API_KEY = prevKey;
    if (prevAuthz === undefined) delete process.env.ATLAS_AUTHZ;
    else process.env.ATLAS_AUTHZ = prevAuthz;
  });

  it("sans clé : ATLAS_AUTHZ=signed local/dev", async () => {
    const ok = await resolveSignedAuthzAttested({
      env: { ATLAS_AUTHZ: "signed" },
      envelopeId: null,
    });
    assert.equal(ok, true);
    const no = await resolveSignedAuthzAttested({
      env: {},
      envelopeId: "x",
    });
    assert.equal(no, false);
  });

  it("avec clé : poll Sign API (signed)", async () => {
    const fetchImpl: FetchLike = async () =>
      jsonResponse({
        signature: { id: 1, status: "signed" },
        events: [],
      });
    const ok = await resolveSignedAuthzAttested({
      env: { PRAGMA_SIGN_API_KEY: "test-key-not-real" },
      envelopeId: "1",
      fetchImpl,
    });
    assert.equal(ok, true);
  });

  it("avec clé + enveloppe pending → false (fail-closed)", async () => {
    const fetchImpl: FetchLike = async () =>
      jsonResponse({
        signature: { id: 1, status: "pending" },
        events: [],
      });
    const ok = await resolveSignedAuthzAttested({
      env: {
        PRAGMA_SIGN_API_KEY: "test-key-not-real",
        ATLAS_AUTHZ: "signed",
      },
      envelopeId: "1",
      fetchImpl,
    });
    assert.equal(ok, false);
  });

  it("avec clé sans envelopeId → ATLAS_AUTHZ=signed (checkbox path, no Sign)", async () => {
    const ok = await resolveSignedAuthzAttested({
      env: {
        PRAGMA_SIGN_API_KEY: "test-key-not-real",
        ATLAS_AUTHZ: "signed",
      },
      envelopeId: null,
    });
    assert.equal(ok, true);
    const no = await resolveSignedAuthzAttested({
      env: {
        PRAGMA_SIGN_API_KEY: "test-key-not-real",
      },
      envelopeId: null,
    });
    assert.equal(no, false);
  });
});
