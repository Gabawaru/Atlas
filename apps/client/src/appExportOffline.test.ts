/**
 * Pin report export offline recovery — must not dump bare Failed to fetch
 * (parity login #111 / Scan #113).
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

describe("export offline recovery", () => {
  it("downloadReportExport catch uses formatLocalBridgeNetworkFailure(api-health)", () => {
    const start = appSrc.indexOf("setExportBusyKey");
    assert.ok(start >= 0, "export helper missing");
    const snippet = appSrc.slice(start, appSrc.indexOf("async function login"));
    assert.match(
      snippet,
      /formatLocalBridgeNetworkFailure\(raw,\s*"api-health"\)/,
    );
    assert.doesNotMatch(
      snippet,
      /setError\(e instanceof Error \? e\.message : String\(e\)\)/,
    );
  });
});
