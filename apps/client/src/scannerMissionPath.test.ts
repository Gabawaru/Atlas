import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canClientExecute,
  circuitAPendingMessage,
  createMissionBody,
  validateRealMissionInput,
} from "./scannerMissionPath.js";

describe("validateRealMissionInput", () => {
  it("refuse sans déclaration de responsabilité", () => {
    const r = validateRealMissionInput({
      signatureEnvelopeId: "244",
      targetHost: "pragma-serve.com",
      testResponsibilityAccepted: false,
    });
    assert.equal(r.ok, false);
    if (!r.ok) assert.match(r.reason, /responsable des tests/i);
  });

  it("refuse envelopeId vide", () => {
    const r = validateRealMissionInput({
      signatureEnvelopeId: "  ",
      targetHost: "pragma-serve.com",
      testResponsibilityAccepted: true,
    });
    assert.equal(r.ok, false);
    if (!r.ok) assert.match(r.reason, /signatureEnvelopeId/);
  });

  it("refuse cible vide", () => {
    const r = validateRealMissionInput({
      signatureEnvelopeId: "244",
      targetHost: "  ",
      testResponsibilityAccepted: true,
    });
    assert.equal(r.ok, false);
    if (!r.ok) assert.match(r.reason, /FQDN|RoE/);
  });

  it("normalise cible et envelopeId", () => {
    const r = validateRealMissionInput({
      signatureEnvelopeId: "  244  ",
      targetHost: "Pragma-Serve.com.",
      testResponsibilityAccepted: true,
    });
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.envelopeId, "244");
      assert.equal(r.targetHost, "pragma-serve.com");
      assert.equal(r.testResponsibilityAccepted, true);
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
