import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  phaseFromGateCode,
  phaseLabelFr,
  phaseStatusHintFr,
} from "./supportHandoffPhase";

describe("supportHandoffPhase", () => {
  it("maps gate codes", () => {
    assert.equal(phaseFromGateCode("phone_blocked"), "phone_blocked");
    assert.equal(phaseFromGateCode("cancelled"), "cancelled");
    assert.equal(phaseFromGateCode("other"), "error");
  });

  it("labels + hints stay flat FR", () => {
    assert.match(phaseLabelFr("sending"), /Envoi/);
    assert.match(phaseLabelFr("idle", 2), /\(2\)/);
    assert.match(phaseLabelFr("phone_blocked"), /PC/);
    assert.match(String(phaseStatusHintFr("active")), /active/i);
    assert.equal(phaseStatusHintFr("idle"), null);
  });
});
