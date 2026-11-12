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
      targetHost: "pragma-serve.com",
      testResponsibilityAccepted: false,
    });
    assert.equal(r.ok, false);
    if (!r.ok) {
      assert.match(r.reason, /responsabilité de ce scan/i);
      assert.match(r.reason, /non autorisé/i);
    }
  });

  it("refuse cible vide", () => {
    const r = validateRealMissionInput({
      targetHost: "  ",
      testResponsibilityAccepted: true,
    });
    assert.equal(r.ok, false);
    if (!r.ok) assert.match(r.reason, /FQDN|RoE/);
  });

  it("normalise cible avec responsabilité cochée", () => {
    const r = validateRealMissionInput({
      targetHost: "Pragma-Serve.com.",
      testResponsibilityAccepted: true,
    });
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.targetHost, "pragma-serve.com");
      assert.equal(r.testResponsibilityAccepted, true);
    }
  });

  it("refuse hors RoE avant POST mission", () => {
    const r = validateRealMissionInput({
      targetHost: "evil.com",
      testResponsibilityAccepted: true,
    });
    assert.equal(r.ok, false);
    if (!r.ok) assert.match(r.reason, /hors RoE/i);
  });

  it("refuse apex pragma-cloud.com / pragma.mc (Policy Guard parity)", () => {
    for (const host of ["pragma-cloud.com", "pragma.mc"] as const) {
      const r = validateRealMissionInput({
        targetHost: host,
        testResponsibilityAccepted: true,
      });
      assert.equal(r.ok, false, host);
      if (!r.ok) assert.match(r.reason, /hors RoE/i);
    }
  });

  it("accepte sous-domaine RoE", () => {
    const r = validateRealMissionInput({
      targetHost: "api.pragma-serve.com",
      testResponsibilityAccepted: true,
    });
    assert.equal(r.ok, true);
    if (r.ok) assert.equal(r.targetHost, "api.pragma-serve.com");
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
    assert.equal(body.title, "Présence web");
    assert.doesNotMatch(String(body.title), /FICTIF|réelle/i);
    assert.doesNotMatch(String(body.notes), /Sign attach/i);
  });
});

describe("Circuit A helpers", () => {
  it("message court sans Sign ni Circuit A admin", () => {
    const msg = circuitAPendingMessage("mid", "A_APPROVAL_PENDING");
    assert.match(msg, /Scan non prêt/);
    assert.match(msg, /mid/);
    assert.doesNotMatch(msg, /Circuit A/i);
    assert.doesNotMatch(msg, /Enveloppe Sign/i);
    assert.doesNotMatch(msg, /PRAGMA_SIGN/i);
  });

  it("execute seulement après A_APPROVED / démo skip", () => {
    assert.equal(canClientExecute("A_APPROVAL_PENDING"), false);
    assert.equal(canClientExecute("A_APPROVED"), true);
    assert.equal(canClientExecute("A_SKIPPED_DEMO"), true);
  });
});
