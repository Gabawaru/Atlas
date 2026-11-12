/**
 * Pin Historique Signal column (parity Scanner findings #149).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));
const viewSrc = readFileSync(join(dir, "VulnTrackingView.tsx"), "utf8");

describe("Historique Signal column", () => {
  it("exposes Signal between Risque and Cible", () => {
    assert.match(viewSrc, /scope="col">Signal</);
    assert.match(viewSrc, /className="risk-signal"/);
    assert.match(viewSrc, /entry\.signal/);
    const risque = viewSrc.indexOf('scope="col">Risque<');
    const signal = viewSrc.indexOf('scope="col">Signal<');
    const cible = viewSrc.indexOf('scope="col">Cible<');
    assert.ok(risque > 0 && signal > risque && cible > signal);
  });
});
