import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  AUDIT_GENESIS,
  hashAuditEvent,
  verifyAuditChain,
  type AuditChainRecord,
} from "./audit-chain";

describe("audit hash chain (AC-07)", () => {
  it("verify_chain OK sur chaîne valide", () => {
    const e1Hash = hashAuditEvent({
      prevHash: AUDIT_GENESIS,
      action: "mission.created",
      tenantId: "t1",
      payload: { a: 1 },
    });
    const e2Hash = hashAuditEvent({
      prevHash: e1Hash,
      action: "policy_guard.evaluate",
      tenantId: "t1",
      payload: { decision: "ALLOW" },
    });
    const chain: AuditChainRecord[] = [
      {
        prevHash: AUDIT_GENESIS,
        hash: e1Hash,
        action: "mission.created",
        tenantId: "t1",
        payload: { a: 1 },
      },
      {
        prevHash: e1Hash,
        hash: e2Hash,
        action: "policy_guard.evaluate",
        tenantId: "t1",
        payload: { decision: "ALLOW" },
      },
    ];
    const r = verifyAuditChain(chain);
    assert.equal(r.ok, true);
    assert.equal(r.checked, 2);
  });

  it("détecte une « mise à jour » simulée du payload (intégrité cassée)", () => {
    const e1Hash = hashAuditEvent({
      prevHash: AUDIT_GENESIS,
      action: "seed.completed",
      payload: { synthetic: true },
    });
    const tampered: AuditChainRecord[] = [
      {
        prevHash: AUDIT_GENESIS,
        hash: e1Hash,
        action: "seed.completed",
        // payload altéré après coup — hash historique ne match plus
        payload: { synthetic: true, injected: "evil" },
      },
    ];
    const r = verifyAuditChain(tampered);
    assert.equal(r.ok, false);
    assert.match(r.reason ?? "", /hash mismatch/);
  });

  it("détecte une rupture de chaînage prevHash", () => {
    const e1Hash = hashAuditEvent({
      prevHash: AUDIT_GENESIS,
      action: "a",
    });
    const r = verifyAuditChain([
      {
        prevHash: AUDIT_GENESIS,
        hash: e1Hash,
        action: "a",
      },
      {
        prevHash: "NOT_THE_PREV",
        hash: hashAuditEvent({ prevHash: "NOT_THE_PREV", action: "b" }),
        action: "b",
      },
    ]);
    assert.equal(r.ok, false);
    assert.match(r.reason ?? "", /prevHash mismatch/);
  });
});
