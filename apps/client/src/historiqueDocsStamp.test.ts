/**
 * Pin Historique localStorage docs + handoff stamp prominence (atl-retours §4).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));
const root = join(dir, "../../..");
const view = readFileSync(join(dir, "VulnTrackingView.tsx"), "utf8");
const css = readFileSync(join(dir, "styles.css"), "utf8");
const userDoc = readFileSync(join(root, "docs/utilisateur.md"), "utf8");

describe("Historique docs + stamp", () => {
  it("banner + utilisateur.md document localStorage wipe", () => {
    assert.match(view, /atlas\.vuln-tracking\.v1/);
    assert.match(view, /efface\s+l’Historique|efface l'Historique/);
    assert.match(userDoc, /## Historique/);
    assert.match(userDoc, /atlas\.vuln-tracking\.v1/);
    assert.match(userDoc, /Effacer le stockage local/);
  });

  it("handoff stamp is prominent (not muted)", () => {
    assert.match(view, /className="handoff-stamp"/);
    assert.doesNotMatch(view, /className="handoff-stamp muted"/);
    assert.match(css, /\.handoff-stamp\s*\{[^}]*color:\s*var\(--teal-deep\)/s);
  });
});
