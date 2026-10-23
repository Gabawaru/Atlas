import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { REMEDIATION_STATUSES } from "./remediation.service";

describe("remediation statuses", () => {
  it("expose le parcours finding → correction", () => {
    assert.ok(REMEDIATION_STATUSES.includes("open"));
    assert.ok(REMEDIATION_STATUSES.includes("in_progress"));
    assert.ok(REMEDIATION_STATUSES.includes("fixed"));
    assert.ok(REMEDIATION_STATUSES.includes("retest_requested"));
    assert.ok(!REMEDIATION_STATUSES.includes("approved" as never));
  });
});
