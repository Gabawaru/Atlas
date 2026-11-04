/**
 * Paradise drawn-signature attestation + provider (no Pragma key).
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  isParadiseEnvelopeId,
  mintParadiseAttestation,
  verifyParadiseAttestation,
  type ParadiseAttestationPayload,
} from "./paradise-authz";
import {
  mintTestParadiseAttestation,
  ParadiseSignSignatureProvider,
} from "./paradise-sign.provider";
import { resolveSignedAuthzAttested } from "./authz-attestation";

const SECRET = "test-paradise-authz-secret-not-real";

describe("paradise-authz HMAC", () => {
  it("mint + verify round-trip for Ben signed attestation", () => {
    const token = mintTestParadiseAttestation(SECRET, { person: "benjamin" });
    const v = verifyParadiseAttestation(token, SECRET);
    assert.equal(v.ok, true);
    if (!v.ok) return;
    assert.equal(v.payload.person, "benjamin");
    assert.equal(v.payload.status, "signed");
    assert.ok(isParadiseEnvelopeId(v.payload.envelopeId));
  });

  it("reject tampered token", () => {
    const token = mintTestParadiseAttestation(SECRET);
    const [body] = token.split(".");
    const bad = `${body}.AAAAAAAAAAAAAAAAAAAAAA`;
    const v = verifyParadiseAttestation(bad, SECRET);
    assert.equal(v.ok, false);
  });

  it("reject expired attestation", () => {
    const now = Math.floor(Date.now() / 1000);
    const token = mintTestParadiseAttestation(SECRET, {
      iat: now - 7200,
      exp: now - 3600,
    });
    const v = verifyParadiseAttestation(token, SECRET);
    assert.equal(v.ok, false);
  });
});

describe("ParadiseSignSignatureProvider", () => {
  it("ingestAttestation → getStatus signed + artifact non-mock", async () => {
    const provider = new ParadiseSignSignatureProvider({ secret: SECRET });
    const token = mintTestParadiseAttestation(SECRET, {
      signerEmail: "ben@pragma.mc",
      person: "benjamin",
    });
    const ingested = provider.ingestAttestation(token);
    assert.equal(ingested.status, "signed");
    assert.equal(await provider.getStatus(ingested.envelopeId), "signed");
    const art = await provider.fetchArtifact(ingested.envelopeId);
    assert.equal(art.isMock, false);
    assert.ok(art.artifactRef.startsWith("paradise-attestation://v1/"));
    assert.deepEqual(art.signedBy, ["ben@pragma.mc"]);
  });

  it("createEnvelope falls back to local pending when Paradise HTTP fails", async () => {
    const provider = new ParadiseSignSignatureProvider({
      secret: SECRET,
      fetchImpl: async () => new Response("nope", { status: 503 }),
    });
    const env = await provider.createEnvelope("hash", [
      { email: "ben@pragma.mc", name: "Ben", role: "owner" },
    ]);
    assert.ok(isParadiseEnvelopeId(env.envelopeId));
    assert.equal(env.status, "pending");
    assert.equal(env.provider, "paradise-gate");
  });
});

describe("resolveSignedAuthzAttested — Paradise", () => {
  it("inline attestation → true without Pragma key", async () => {
    const token = mintTestParadiseAttestation(SECRET);
    const ok = await resolveSignedAuthzAttested({
      paradiseAttestation: token,
      env: { ATLAS_PARADISE_AUTHZ_SECRET: SECRET },
    });
    assert.equal(ok, true);
  });

  it("secret set without envelope → fail-closed false (no ATLAS_AUTHZ theater)", async () => {
    const ok = await resolveSignedAuthzAttested({
      env: {
        ATLAS_PARADISE_AUTHZ_SECRET: SECRET,
        ATLAS_AUTHZ: "signed",
      },
    });
    assert.equal(ok, false);
  });

  it("remote Paradise signed + attestation → true", async () => {
    const token = mintTestParadiseAttestation(SECRET);
    const payload = (
      verifyParadiseAttestation(token, SECRET) as {
        ok: true;
        payload: ParadiseAttestationPayload;
      }
    ).payload;
    const ok = await resolveSignedAuthzAttested({
      envelopeId: payload.envelopeId,
      env: { ATLAS_PARADISE_AUTHZ_SECRET: SECRET },
      paradiseFetchImpl: async () =>
        new Response(
          JSON.stringify({
            id: payload.envelopeId,
            status: "signed",
            person: "benjamin",
            signerEmail: "ben@pragma.mc",
            signerName: "Ben",
            signatureStrokeHash: payload.signatureStrokeHash,
            attestation: token,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
    });
    assert.equal(ok, true);
  });
});

describe("mintParadiseAttestation export", () => {
  it("builds verifiable token from raw payload", () => {
    const now = Math.floor(Date.now() / 1000);
    const payload: ParadiseAttestationPayload = {
      v: 1,
      iss: "cultivationparadise.com",
      provider: "paradise-gate",
      envelopeId: "paradise-manual-1",
      status: "signed",
      person: "gabriel",
      signerEmail: "gabriel.carb.pro@gmail.com",
      signerName: "Gabriel",
      purpose: "atlas-owner-authz",
      signatureStrokeHash: "c".repeat(64),
      iat: now,
      exp: now + 600,
    };
    const token = mintParadiseAttestation(payload, SECRET);
    const v = verifyParadiseAttestation(token, SECRET);
    assert.equal(v.ok, true);
  });
});
