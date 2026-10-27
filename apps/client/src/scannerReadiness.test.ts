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
    assert.match(r.blockReason ?? "", /présence web|Policy Guard/i);
  });

  it("bloque sans cible", () => {
    const r = evaluateScannerReadiness({ ...readyBase, assetCount: 0 });
    assert.equal(r.ready, false);
    assert.match(r.blockReason ?? "", /cible|actif/i);
  });

  it("bloque sans connecteur (Policy Guard)", () => {
    const r = evaluateScannerReadiness({
      ...readyBase,
      webConnectorActive: false,
    });
    assert.equal(r.ready, false);
    assert.match(r.blockReason ?? "", /Connecteur|Policy Guard/i);
  });

  it("autorise quand auth + besoin + cible + connecteur", () => {
    const r = evaluateScannerReadiness(readyBase);
    assert.equal(r.ready, true);
    assert.equal(r.blockReason, null);
  });
});
