import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { MockSignatureProvider } from "./mock-signature.provider";

describe("MockSignatureProvider", () => {
  const prevStub = process.env.ATLAS_CHAT_SIGNATURE_STUB;

  beforeEach(() => {
    delete process.env.ATLAS_CHAT_SIGNATURE_STUB;
  });

  afterEach(() => {
    if (prevStub === undefined) delete process.env.ATLAS_CHAT_SIGNATURE_STUB;
    else process.env.ATLAS_CHAT_SIGNATURE_STUB = prevStub;
  });

  it("exige deux parties et reste pending jusqu'à co-signature", async () => {
    const p = new MockSignatureProvider();
    await assert.rejects(
      () =>
        p.createEnvelope("hash", [
          { email: "a@t.local", name: "A", role: "owner" },
        ]),
      /deux parties/,
    );

    const env = await p.createEnvelope("doc-hash", [
      { email: "owner@t.local", name: "Owner", role: "owner" },
      { email: "ops@a.local", name: "Atlas Ops", role: "counterparty" },
    ]);
    assert.equal(env.status, "pending");
    assert.equal(await p.getStatus(env.envelopeId), "pending");

    assert.equal(
      await p.completeSigner(env.envelopeId, "owner@t.local"),
      "pending",
    );
    assert.equal(
      await p.completeSigner(env.envelopeId, "ops@a.local"),
      "signed",
    );
    const art = await p.fetchArtifact(env.envelopeId);
    assert.equal(art.isMock, true);
    assert.equal(art.signedBy.length, 2);
  });

  it("sign() défaut pending (pas de Pragma Sign)", async () => {
    const p = new MockSignatureProvider();
    const r = await p.sign({ documentHash: "doc-a", purpose: "chat" });
    assert.equal(r.status, "pending");
    assert.equal(r.isMock, true);
    assert.equal(r.provider, "mock");
    assert.match(r.requestId, /^mock-authz-/);
  });

  it("sign() honore stubOutcome et ATLAS_CHAT_SIGNATURE_STUB", async () => {
    const p = new MockSignatureProvider();
    assert.equal(
      (await p.sign({ documentHash: "x", stubOutcome: "signed" })).status,
      "signed",
    );
    assert.equal(
      (await p.sign({ documentHash: "x", stubOutcome: "rejected" })).status,
      "rejected",
    );

    process.env.ATLAS_CHAT_SIGNATURE_STUB = "signed";
    assert.equal(
      (await p.sign({ documentHash: "y", purpose: "chat" })).status,
      "signed",
    );
    process.env.ATLAS_CHAT_SIGNATURE_STUB = "rejected";
    assert.equal((await p.sign({ documentHash: "z" })).status, "rejected");
  });
});
