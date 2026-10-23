import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { canTransition } from "./index";


describe("mission transitions", () => {
  it("autorise DRAFT → ASSETS_LINKED", () => {
    assert.equal(canTransition("DRAFT", "ASSETS_LINKED"), true);
  });

  it("interdit DRAFT → RUNNING", () => {
    assert.equal(canTransition("DRAFT", "RUNNING"), false);
  });

  it("interdit AUTH_PENDING → QUEUED (sans AUTH_VALID)", () => {
    assert.equal(canTransition("AUTH_PENDING", "QUEUED"), false);
  });

  it("interdit A_APPROVAL_PENDING → RUNNING", () => {
    assert.equal(canTransition("A_APPROVAL_PENDING", "RUNNING"), false);
  });

  it("autorise A_APPROVED → QUEUED", () => {
    assert.equal(canTransition("A_APPROVED", "QUEUED"), true);
  });

  it("autorise A_SKIPPED_DEMO → QUEUED (démo uniquement)", () => {
    assert.equal(canTransition("A_SKIPPED_DEMO", "QUEUED"), true);
  });
});
