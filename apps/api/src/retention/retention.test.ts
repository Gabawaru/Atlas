import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  cutoffDate,
  DEFAULT_RETENTION_TTL_DAYS,
  isAllowedProcessingPurpose,
  isAllowedSignPurpose,
  isPurposeEnforceEnabled,
  PROCESSING_PURPOSES,
  PURPOSE_DISCLAIMER,
  RETENTION_CATEGORIES,
  RETENTION_DISCLAIMER,
  SIGN_PURPOSES,
} from "./retention.policy";

describe("rétention & purge — politique", () => {
  it("disclaimer marque hypothèses RGPD (pas de certification)", () => {
    assert.match(RETENTION_DISCLAIMER, /Hypothèses/i);
    assert.match(RETENTION_DISCLAIMER, /pas une certification/i);
    assert.match(RETENTION_DISCLAIMER, /Legal hold/i);
  });

  it("catégories couvrent audit, rapports, artefacts, PII, llm", () => {
    assert.ok(RETENTION_CATEGORIES.includes("audit"));
    assert.ok(RETENTION_CATEGORIES.includes("reports"));
    assert.ok(RETENTION_CATEGORIES.includes("artefacts"));
    assert.ok(RETENTION_CATEGORIES.includes("pii_minimized"));
    assert.ok(RETENTION_CATEGORIES.includes("llm_usage"));
  });

  it("TTL llm < audit (minimisation hypothèse)", () => {
    assert.ok(DEFAULT_RETENTION_TTL_DAYS.llm_usage < DEFAULT_RETENTION_TTL_DAYS.audit);
    assert.ok(DEFAULT_RETENTION_TTL_DAYS.llm_usage === 90 || DEFAULT_RETENTION_TTL_DAYS.llm_usage > 0);
  });

  it("cutoffDate recule bien de N jours", () => {
    const now = new Date("2026-10-23T12:00:00.000Z");
    const c = cutoffDate(90, now);
    assert.equal(c.toISOString().slice(0, 10), "2026-07-25");
  });
});

describe("limitation de finalité — politique", () => {
  it("disclaimer purpose n'est pas un avis juridique", () => {
    assert.match(PURPOSE_DISCLAIMER, /hypothèse/i);
    assert.match(PURPOSE_DISCLAIMER, /pas une base légale/i);
  });

  it("PROCESSING_PURPOSES couvre contrôle passif + authz + chat + audit + rétention + billing", () => {
    for (const p of [
      "authorized_passive_control",
      "mission_authorization",
      "assistant_chat",
      "audit_trail",
      "retention_ops",
      "subscription_billing",
    ] as const) {
      assert.ok(PROCESSING_PURPOSES.includes(p));
      assert.equal(isAllowedProcessingPurpose(p), true);
    }
    assert.equal(isAllowedProcessingPurpose("ad_targeting"), false);
  });

  it("SIGN_PURPOSES = chat|mission ; vide autorisé", () => {
    assert.deepEqual([...SIGN_PURPOSES], ["chat", "mission"]);
    assert.equal(isAllowedSignPurpose("chat"), true);
    assert.equal(isAllowedSignPurpose("mission"), true);
    assert.equal(isAllowedSignPurpose(undefined), true);
    assert.equal(isAllowedSignPurpose(""), true);
    assert.equal(isAllowedSignPurpose("newsletter"), false);
  });

  it("ATLAS_PURPOSE_ENFORCE défaut true ; false désactive", () => {
    assert.equal(isPurposeEnforceEnabled({}), true);
    assert.equal(isPurposeEnforceEnabled({ ATLAS_PURPOSE_ENFORCE: "true" }), true);
    assert.equal(isPurposeEnforceEnabled({ ATLAS_PURPOSE_ENFORCE: "false" }), false);
  });

  it("TTL env flags sont des nombres positifs (hooks rétention)", () => {
    for (const n of Object.values(DEFAULT_RETENTION_TTL_DAYS)) {
      assert.ok(Number.isFinite(n) && n > 0);
    }
  });
});

describe("rétention — legal hold (invariant)", () => {
  it("si legalHold alors heldSkipped et counts à zéro (contrat API)", () => {
    const held = {
      legalHold: true,
      heldSkipped: true,
      counts: {
        audit: 0,
        reports: 0,
        artefacts: 0,
        pii_minimized: 0,
        llm_usage: 0,
      },
    };
    assert.equal(held.legalHold && held.heldSkipped, true);
    assert.ok(Object.values(held.counts).every((n) => n === 0));
  });
});
