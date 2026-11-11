/**
 * Pin Scanner results FR accents (parity VulnTracking « Aucun résultat »,
 * risk badges élevé / échec, platform Démarrer #97/#98).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const appSrc = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "App.tsx"),
  "utf8",
);

describe("Scanner results FR accents", () => {
  it("heading + empty state use Résultats (not ASCII Resultats)", () => {
    assert.match(appSrc, /id="results-title">Résultats</);
    assert.match(appSrc, />Aucun résultat\.</);
    assert.doesNotMatch(appSrc, /Resultats/);
    assert.doesNotMatch(appSrc, /Aucun resultat\./);
  });
});
