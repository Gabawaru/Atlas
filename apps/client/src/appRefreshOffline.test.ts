/**
 * Pin refresh() offline recovery — post-login / mid-session API death must not
 * leave only « Connecteur inactif » without Démarrer (parity login #111).
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

describe("refresh offline recovery", () => {
  it("refresh catch uses formatLocalBridgeNetworkFailure(api-health)", () => {
    const start = appSrc.indexOf("async function refresh()");
    assert.ok(start >= 0);
    const end = appSrc.indexOf("async function updateRemediation", start);
    const refresh = appSrc.slice(start, end > start ? end : undefined);
    assert.match(refresh, /try \{/);
    assert.match(refresh, /catch \(e\)/);
    assert.match(
      refresh,
      /formatLocalBridgeNetworkFailure\(raw,\s*"api-health"\)/,
    );
  });

  it("api-health helper pins Démarrer recovery line", () => {
    const formatted = formatLocalBridgeNetworkFailure(
      "Failed to fetch",
      "api-health",
    );
    assert.match(formatted, /Failed to fetch/);
    assert.match(formatted, /Démarrer l'API/);
  });

  it("goScanner re-calls refresh when token present (post-Demarrer recovery)", () => {
    const start = appSrc.indexOf("function goScanner()");
    assert.ok(start >= 0);
    const end = appSrc.indexOf("function goSession()", start);
    const go = appSrc.slice(start, end > start ? end : undefined);
    assert.match(go, /goRoute\("scanner"\)/);
    assert.match(go, /if \(token\) void refresh\(\)/);
  });

  it("hashchange to #scanner re-calls refresh when token present", () => {
    assert.match(
      appSrc,
      /parseSessionHash\(window\.location\.hash\)[\s\S]*next === "scanner" && token\) void refresh\(\)/,
    );
    assert.match(appSrc, /addEventListener\("hashchange"[\s\S]*\}, \[token\]\)/);
  });

  it("Session Gabriel hub renders error banner (parity login/Scanner)", () => {
    const start = appSrc.indexOf('view === "session"');
    assert.ok(start >= 0);
    const end = appSrc.indexOf('view === "tracking"', start);
    const hub = appSrc.slice(start, end > start ? end : undefined);
    assert.match(hub, /gabriel-session/);
    assert.match(hub, /\{error &&/);
    assert.match(hub, /role="status"/);
  });
});
