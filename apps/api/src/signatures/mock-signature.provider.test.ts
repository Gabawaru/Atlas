import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { MockSignatureProvider } from "./mock-signature.provider";

describe("MockSignatureProvider", () => {
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
});
