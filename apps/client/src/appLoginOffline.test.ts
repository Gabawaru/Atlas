/**
 * Pin login() offline recovery — Entrer must not clear error and go silent
 * when API is down (parity Session api-health / formatLocalBridgeNetworkFailure).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { formatLocalBridgeNetworkFailure } from "./localShell.js";

const appSrc = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "App.tsx"),
  "utf8",
);

describe("login offline recovery", () => {
  it("App.tsx catches fetch failures via formatLocalBridgeNetworkFailure(api-health)", () => {
    assert.match(appSrc, /formatLocalBridgeNetworkFailure/);
    assert.match(appSrc, /formatLocalBridgeNetworkFailure\(raw,\s*"api-health"\)/);
    assert.match(appSrc, /async function login\(\)[\s\S]*try \{[\s\S]*catch \(e\)/);
  });

  it("api-health helper pins Démarrer recovery line", () => {
    const formatted = formatLocalBridgeNetworkFailure(
      "Failed to fetch",
      "api-health",
    );
    assert.match(formatted, /Failed to fetch/);
    assert.match(formatted, /Démarrer l'API/);
  });
});
