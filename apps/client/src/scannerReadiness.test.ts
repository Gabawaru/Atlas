import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { evaluateScannerReadiness } from "./scannerReadiness.js";

describe("evaluateScannerReadiness", () => {
  const readyBase = {
    authenticated: true,
    selectedNeedId: "web_presence",
    assetCount: 1,
    webConnectorActive: true,
  };

  it("bloque sans session", () => {
    const r = evaluateScannerReadiness({ ...readyBase, authenticated: false });
    assert.equal(r.ready, false);
    assert.match(r.blockReason ?? "", /Connexion/);
  });

  it("bloque besoin non exécutable", () => {
    const r = evaluateScannerReadiness({
      ...readyBase,
      selectedNeedId: "internal_network",
    });
    assert.equal(r.ready, false);
    assert.match(r.blockReason ?? "", /executable/i);
  });

  it("bloque sans cible", () => {
    const r = evaluateScannerReadiness({ ...readyBase, assetCount: 0 });
    assert.equal(r.ready, false);
    assert.match(r.blockReason ?? "", /FQDN/i);
  });

  it("bloque sans connecteur", () => {
    const r = evaluateScannerReadiness({
      ...readyBase,
      webConnectorActive: false,
    });
    assert.equal(r.ready, false);
    assert.match(r.blockReason ?? "", /Connecteur/i);
  });

  it("autorise quand auth + besoin + cible + connecteur", () => {
    const r = evaluateScannerReadiness(readyBase);
    assert.equal(r.ready, true);
    assert.equal(r.blockReason, null);
  });
});
