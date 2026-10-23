import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { MockSignatureProvider } from "./mock-signature.provider";

describe("MockSignatureProvider", () => {
  it("crée une enveloppe et la marque signée (mock)", async () => {
    const p = new MockSignatureProvider();
    const created = await p.createEnvelope("doc-hash-abc", [
      { email: "owner@demo.atlas.local", name: "Camille" },
    ]);
    assert.equal(created.provider, "mock");
    assert.equal(await p.getStatus(created.envelopeId), "signed");
    const art = await p.fetchArtifact(created.envelopeId);
    assert.equal(art.isMock, true);
    assert.match(art.artifactRef, /^mock:\/\//);
    assert.equal(art.contentHash.length, 64);
  });
});
