import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  assertTransition,
  IllegalMissionTransitionError,
  nextAfterAuthValid,
} from "./mission-state";

describe("mission state machine (API)", () => {
  it("accepte transitions légales", () => {
    assert.doesNotThrow(() => assertTransition("DRAFT", "ASSETS_LINKED"));
    assert.doesNotThrow(() => assertTransition("A_APPROVED", "QUEUED"));
  });

  it("rejette transitions interdites", () => {
    assert.throws(
      () => assertTransition("DRAFT", "RUNNING"),
      IllegalMissionTransitionError,
    );
    assert.throws(
      () => assertTransition("AUTH_PENDING", "QUEUED"),
      IllegalMissionTransitionError,
    );
    assert.throws(
      () => assertTransition("A_APPROVAL_PENDING", "RUNNING"),
      IllegalMissionTransitionError,
    );
  });

  it("mission réelle sans approbateur → BLOCKED", () => {
    const r = nextAfterAuthValid({
      isRealMission: true,
      isSyntheticDemo: false,
      approvalRouteConfigured: false,
    });
    assert.equal(r.status, "BLOCKED");
    assert.match(r.blockedReason ?? "", /NO_APPROVAL_ROUTE/);
  });

  it("démo synthétique → A_SKIPPED_DEMO", () => {
    const r = nextAfterAuthValid({
      isRealMission: false,
      isSyntheticDemo: true,
      approvalRouteConfigured: false,
    });
    assert.equal(r.status, "A_SKIPPED_DEMO");
  });

  it("mission réelle avec route → A_APPROVAL_PENDING", () => {
    const r = nextAfterAuthValid({
      isRealMission: true,
      isSyntheticDemo: false,
      approvalRouteConfigured: true,
    });
    assert.equal(r.status, "A_APPROVAL_PENDING");
  });
});
