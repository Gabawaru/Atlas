import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  ResendClient,
  RESEND_USER_AGENT,
  type FetchLike,
} from "./resend.client";
import { ResendMailProvider } from "./resend.provider";
import { MockMailProvider } from "./mock-mail.provider";
import { createMailProvider } from "./mail.module";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("ResendClient (mocked HTTP)", () => {
  it("envoie Authorization Bearer + User-Agent atlas/1.0", async () => {
    const seen: { url?: string; headers?: HeadersInit; body?: string } = {};
    const fetchImpl: FetchLike = async (url, init) => {
      seen.url = String(url);
      seen.headers = init?.headers;
      seen.body = typeof init?.body === "string" ? init.body : undefined;
      return jsonResponse({ id: "re_test_msg_1" });
    };
    const client = new ResendClient({
      apiKey: "re_test_key_not_real",
      fetchImpl,
    });
    const out = await client.sendEmail({
      from: "gabriel@hq.atlas-secu.com",
      to: ["owner@t.local"],
      subject: "hello",
      text: "body",
      replyTo: "gabriel@atlas-secu.com",
    });
    assert.equal(out.id, "re_test_msg_1");
    assert.match(seen.url!, /\/emails$/);
    const h = seen.headers as Record<string, string>;
    assert.equal(h.Authorization, "Bearer re_test_key_not_real");
    assert.equal(h["User-Agent"], RESEND_USER_AGENT);
    const parsed = JSON.parse(seen.body!) as Record<string, unknown>;
    assert.equal(parsed.from, "gabriel@hq.atlas-secu.com");
    assert.deepEqual(parsed.to, ["owner@t.local"]);
    assert.equal(parsed.reply_to, "gabriel@atlas-secu.com");
  });

  it("refuse clé vide", () => {
    assert.throws(
      () => new ResendClient({ apiKey: "  " }),
      /RESEND_API_KEY manquante/,
    );
  });
});

describe("ResendMailProvider (mocked HTTP)", () => {
  it("send → isMock false + id Resend", async () => {
    const fetchImpl: FetchLike = async () =>
      jsonResponse({ id: "re_provider_1" });
    const p = new ResendMailProvider({
      apiKey: "re_test_key_not_real",
      fetchImpl,
    });
    const r = await p.send({
      from: "gabriel@hq.atlas-secu.com",
      to: "a@t.local",
      subject: "subj",
      html: "<p>hi</p>",
    });
    assert.equal(r.provider, "resend");
    assert.equal(r.isMock, false);
    assert.equal(r.id, "re_provider_1");
  });
});

describe("MockMailProvider", () => {
  it("send → isMock true sans réseau", async () => {
    const p = new MockMailProvider();
    const r = await p.send({
      from: "gabriel@hq.atlas-secu.com",
      to: "a@t.local",
      subject: "subj",
      text: "hi",
    });
    assert.equal(r.provider, "mock");
    assert.equal(r.isMock, true);
    assert.match(r.id, /^mock-mail-/);
  });
});

describe("createMailProvider (env)", () => {
  const prev = process.env.RESEND_API_KEY;

  afterEach(() => {
    if (prev === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = prev;
  });

  beforeEach(() => {
    delete process.env.RESEND_API_KEY;
  });

  it("sans clé → mock", () => {
    const p = createMailProvider();
    assert.equal(p.name, "mock");
  });

  it("avec RESEND_API_KEY → resend", () => {
    process.env.RESEND_API_KEY = "re_test_key_not_real";
    const p = createMailProvider();
    assert.equal(p.name, "resend");
  });
});
