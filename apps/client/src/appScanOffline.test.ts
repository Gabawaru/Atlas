/**
 * Pin runScanner / executeMission offline recovery — Scan must not dump bare
 * Failed to fetch (parity login #111 / platform runScan #112).
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

describe("Scan offline recovery", () => {
  it("runScanner + executeMission use formatLocalBridgeNetworkFailure(api-health)", () => {
    const runScanner = appSrc.slice(
      appSrc.indexOf("async function runScanner"),
      appSrc.indexOf("async function executeMission"),
    );
    const executeMission = appSrc.slice(
      appSrc.indexOf("async function executeMission"),
      appSrc.indexOf("async function loadRoe"),
    );
    for (const [name, snippet] of [
      ["runScanner", runScanner],
      ["executeMission", executeMission],
    ] as const) {
      assert.match(
        snippet,
        /formatLocalBridgeNetworkFailure\(raw,\s*"api-health"\)/,
        `${name} missing api-health network recovery`,
      );
      assert.doesNotMatch(
        snippet,
        /setError\(e instanceof Error \? e\.message : String\(e\)\)/,
        `${name} still dumps bare e.message`,
      );
    }
  });
});
