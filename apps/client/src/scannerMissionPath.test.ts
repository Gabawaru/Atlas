import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canClientExecute,
  circuitAPendingMessage,
  createMissionBody,
  validateRealMissionInput,
} from "./scannerMissionPath.js";

describe("validateRealMissionInput", () => {
  it("refuse attestation trop courte", () => {
    const r = validateRealMissionInput({
      paradiseAttestation: "ab.cd",
      targetHost: "pragma-serve.com",
    });
    assert.equal(r.ok, false);
    if (!r.ok) assert.match(r.reason, /Attestation Paradise/);
  });

  it("refuse cible vide", () => {
    const r = validateRealMissionInput({
      paradiseAttestation: "body.signaturehex",
      targetHost: "  ",
    });
    assert.equal(r.ok, false);
    if (!r.ok) assert.match(r.reason, /FQDN/);
  });

  it("normalise cible et attestation", () => {
    const r = validateRealMissionInput({
      paradiseAttestation: "  body.sigabcdef  ",
      targetHost: "Pragma-Serve.com.",
    });
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.attestation, "body.sigabcdef");
      assert.equal(r.targetHost, "pragma-serve.com");
    }
  });
});

describe("createMissionBody", () => {
  it("FICTIF → synthetic true", () => {
    const body = createMissionBody({
      mode: "fictif",
      assetId: "a1",
      uxNeedId: "web_presence",
    });
    assert.equal(body.synthetic, true);
    assert.match(String(body.title), /FICTIF/);
  });

  it("réel → synthetic false", () => {
    const body = createMissionBody({
      mode: "real",
      assetId: "a1",
      uxNeedId: "web_presence",
    });
    assert.equal(body.synthetic, false);
    assert.deepEqual(body.exclusions, []);
    assert.doesNotMatch(String(body.title), /FICTIF/);
  });
});

describe("Circuit A helpers", () => {
  it("message documente l’admin", () => {
    const msg = circuitAPendingMessage("mid", "A_APPROVAL_PENDING");
    assert.match(msg, /Circuit A/);
    assert.match(msg, /admin\/approvals/);
    assert.match(msg, /mid/);
  });

  it("execute seulement après A_APPROVED / démo skip", () => {
    assert.equal(canClientExecute("A_APPROVAL_PENDING"), false);
    assert.equal(canClientExecute("A_APPROVED"), true);
    assert.equal(canClientExecute("A_SKIPPED_DEMO"), true);
  });
});
