/**
 * Pin Scanner results FR accents (parity VulnTracking « Aucun résultat »,
 * risk badges élevé / échec, platform Démarrer #97/#98).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));
const appSrc = readFileSync(join(dir, "App.tsx"), "utf8");
const missionSrc = readFileSync(join(dir, "scannerMissionPath.ts"), "utf8");
const cssSrc = readFileSync(join(dir, "styles.css"), "utf8");

describe("Scanner results FR accents", () => {
  it("heading + empty state use Résultats (not ASCII Resultats)", () => {
    assert.match(appSrc, /id="results-title">Résultats</);
    assert.match(appSrc, />Aucun résultat\.</);
    assert.doesNotMatch(appSrc, /Resultats/);
    assert.doesNotMatch(appSrc, /Aucun resultat\./);
  });

  it("CTA idle label Scanner + Présence mission titles", () => {
    assert.match(appSrc, /busy \? "…" : "Scanner"/);
    assert.match(missionSrc, /REAL_MISSION_TITLE = "Présence web"/);
    assert.match(missionSrc, /FICTIF_MISSION_TITLE = "\[FICTIF\] Présence web"/);
  });

  it("UI density — collapse findings, observations, bilan, no host truncation", () => {
    assert.match(appSrc, /collapseRiskTableByControl/);
    assert.match(appSrc, /partitionRiskTable/);
    assert.match(appSrc, /buildBilanSummary/);
    assert.match(appSrc, /data-testid="bilan-score"/);
    assert.match(appSrc, /risk-summary/);
    assert.match(appSrc, /export-btn-active/);
    assert.match(cssSrc, /\.risk-hosts/);
    assert.match(cssSrc, /text-overflow:\s*clip/);
    assert.match(cssSrc, /\.export-btn-active/);
  });
});
