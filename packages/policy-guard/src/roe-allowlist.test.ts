import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  evaluateRoeHost,
  evaluateRoeHosts,
  isRoeGatedHost,
  isRoeInScopeHost,
  isRoeScopeOverrideEnabled,
  normalizeRoeHost,
  ROE_ALLOWED_HOST_PATTERNS,
  ROE_GATED_HOSTS,
} from "./roe-allowlist";

describe("RoE host allowlist — allow", () => {
  it("accepte les patterns section 4 (*.pragma-cloud.com / serve / mc)", () => {
    assert.equal(isRoeInScopeHost("miells.pragma-cloud.com"), true);
    assert.equal(isRoeInScopeHost("charis.pragma-cloud.com"), true);
    assert.equal(
      isRoeInScopeHost("2026-foo-bar-1.pragma-cloud.com"),
      true,
    );
    assert.equal(isRoeInScopeHost("api.pragma-serve.com"), true);
    assert.equal(isRoeInScopeHost("sign.pragma.mc"), true);
    assert.ok(ROE_ALLOWED_HOST_PATTERNS.includes("*.pragma-cloud.com"));
  });

  it("accepte les hôtes explicites section 3 (apex pragma-serve.com)", () => {
    assert.equal(isRoeInScopeHost("pragma-serve.com"), true);
    assert.equal(isRoeInScopeHost("console.pragma-serve.com"), true);
    assert.equal(isRoeInScopeHost("ai.pragma-cloud.com"), true);
    assert.equal(isRoeInScopeHost("equipe.pragma.mc"), true);
  });

  it("evaluateRoeHost ALLOW sur cible in-scope", () => {
    const r = evaluateRoeHost("https://Web.Pragma-Serve.com/path");
    assert.equal(r.decision, "ALLOW");
    assert.equal(r.host, "web.pragma-serve.com");
    assert.equal(normalizeRoeHost("HTTPS://AI.PRAGMA-CLOUD.COM/"), "ai.pragma-cloud.com");
  });
});

describe("RoE host allowlist — reject out-of-scope", () => {
  it("REJECT hôtes hors patterns / hors section 3", () => {
    const r = evaluateRoeHost("evil.example.com");
    assert.equal(r.decision, "REJECT");
    assert.equal(r.code, "TARGET_OUT_OF_SCOPE");

    assert.equal(isRoeInScopeHost("pragma-cloud.com"), false); // apex non listé
    assert.equal(isRoeInScopeHost("notpragma-cloud.com"), false);
    assert.equal(isRoeInScopeHost("evil.pragma-cloud.com.attacker.test"), false);
  });

  it("REJECT liste vide (fail-closed)", () => {
    const r = evaluateRoeHosts([]);
    assert.equal(r.decision, "REJECT");
    assert.equal(r.code, "TARGET_OUT_OF_SCOPE");
  });

  it("ALLOW hors périmètre seulement avec override", () => {
    const denied = evaluateRoeHost("example.com");
    assert.equal(denied.decision, "REJECT");
    const allowed = evaluateRoeHost("example.com", { override: true });
    assert.equal(allowed.decision, "ALLOW");
  });
});

describe("RoE host allowlist — gated section 5", () => {
  it("détecte les domaines gated (exact + sous-domaine)", () => {
    assert.equal(isRoeGatedHost("cepmonaco.com"), true);
    assert.equal(isRoeGatedHost("www.cepmonaco.com"), true);
    assert.equal(isRoeGatedHost("support.lechoeurdusud.com"), true);
    assert.equal(isRoeGatedHost("admin.scriptur.fr"), true);
    assert.equal(isRoeGatedHost("adj.flash-studio.app"), true);
    assert.equal(isRoeGatedHost("quirel.com"), true);
    assert.ok(ROE_GATED_HOSTS.includes("flash-studio.app"));
  });

  it("REJECT gated par défaut (pas d'override)", () => {
    const r = evaluateRoeHost("bussignydunkers.ch");
    assert.equal(r.decision, "REJECT");
    assert.equal(r.code, "TARGET_GATED");
  });

  it("REJECT gated prime sur un faux positif pattern", () => {
    // gated never overlaps pragma patterns; still assert code path
    const r = evaluateRoeHosts(["mikra.fr", "miells.pragma-cloud.com"]);
    assert.equal(r.decision, "REJECT");
    assert.equal(r.code, "TARGET_GATED");
  });

  it("ALLOW gated uniquement avec override", () => {
    const r = evaluateRoeHost("www.maison-velanza.com", { override: true });
    assert.equal(r.decision, "ALLOW");
    assert.match(r.reason, /override/i);
  });
});

describe("RoE scope override helper", () => {
  it("isRoeScopeOverrideEnabled lit env et input", () => {
    assert.equal(isRoeScopeOverrideEnabled({}, false), false);
    assert.equal(isRoeScopeOverrideEnabled({}, true), true);
    assert.equal(
      isRoeScopeOverrideEnabled({ ATLAS_ROE_SCOPE_OVERRIDE: "1" }),
      true,
    );
    assert.equal(
      isRoeScopeOverrideEnabled({ ATLAS_ROE_SCOPE_OVERRIDE: "true" }),
      true,
    );
    assert.equal(
      isRoeScopeOverrideEnabled({ ATLAS_ROE_SCOPE_OVERRIDE: "no" }),
      false,
    );
  });
});
