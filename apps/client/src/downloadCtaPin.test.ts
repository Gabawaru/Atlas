/**
 * Pin monorepo index.html download CTA → atlas-secu.com (atl-retours §1).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const html = readFileSync(join(root, "index.html"), "utf8");
const readme = readFileSync(join(root, "README.md"), "utf8");

describe("download CTA atlas-secu.com", () => {
  it("primary Setup CTA points at atlas-secu.com", () => {
    assert.match(
      html,
      /class="btn" href="https:\/\/atlas-secu\.com\/Atlas-Setup\.exe"/,
    );
    assert.match(
      html,
      /class="btn secondary" href="https:\/\/github\.com\/Gabawaru\/Atlas\/releases\/latest\/download\/Atlas-Setup\.exe"/,
    );
  });

  it("README notes unsigned SmartScreen without claiming signed", () => {
    assert.match(readme, /pas encore signé/i);
    assert.match(readme, /SmartScreen/);
    assert.doesNotMatch(readme, /\best signé\b/i);
    assert.doesNotMatch(readme, /certificat (OV\/EV )?déjà/i);
  });
});
