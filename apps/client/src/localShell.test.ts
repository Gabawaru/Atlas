import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  apiHealthUrl,
  formatStartApiFailureBody,
  LOCAL_SHELL_COMMANDS,
  runLocalShellCommand,
  shellUrl,
} from "./localShell";

describe("localShell stubs", () => {
  it("construit les URLs shell / API", () => {
    assert.equal(shellUrl("/healthz", "http://127.0.0.1:17865"), "http://127.0.0.1:17865/healthz");
    assert.equal(shellUrl("healthz", "http://127.0.0.1:17865/"), "http://127.0.0.1:17865/healthz");
    assert.equal(apiHealthUrl("http://localhost:3001"), "http://localhost:3001/v1/health");
  });

  it("expose les 4 commandes session (pas un 2ᵉ Scanner)", () => {
    assert.deepEqual(
      LOCAL_SHELL_COMMANDS.map((c) => c.id),
      ["healthz", "start-api", "api-health", "launch-scan"],
    );
  });

  it("healthz parse JSON ok", async () => {
    const fetchImpl: typeof fetch = async () =>
      new Response(JSON.stringify({ ok: true, service: "atlas-shell" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    const r = await runLocalShellCommand("healthz", { fetchImpl });
    assert.equal(r.ok, true);
    assert.equal(r.status, 200);
    assert.match(r.body, /atlas-shell/);
  });

  it("start-api accepte 202", async () => {
    const fetchImpl: typeof fetch = async () =>
      new Response(JSON.stringify({ ok: true }), { status: 202 });
    const r = await runLocalShellCommand("start-api", { fetchImpl });
    assert.equal(r.ok, true);
    assert.equal(r.status, 202);
  });

  it("start-api fail surface hint + lookedIn (pas JSON brut)", async () => {
    const payload = {
      ok: false,
      error: "AtlasLocal introuvable",
      hint: "bash scripts/unix/install-atlas-prereqs.sh",
      lookedIn: ["~/Atlas", "tools/", "bin/"],
    };
    const formatted = formatStartApiFailureBody(JSON.stringify(payload), 404);
    assert.match(formatted, /AtlasLocal introuvable/);
    assert.match(formatted, /install-atlas-prereqs/);
    assert.match(formatted, /Cherché : ~\/Atlas · tools\/ · bin\//);

    const fetchImpl: typeof fetch = async () =>
      new Response(JSON.stringify(payload), { status: 404 });
    const r = await runLocalShellCommand("start-api", { fetchImpl });
    assert.equal(r.ok, false);
    assert.equal(r.status, 404);
    assert.match(r.body, /Cherché :/);
    assert.doesNotMatch(r.body, /"lookedIn"/);
  });

  it("launch-scan est UI-only", async () => {
    const r = await runLocalShellCommand("launch-scan");
    assert.equal(r.ok, true);
    assert.match(r.body, /Scanner/);
  });

  it("surfaced network errors", async () => {
    const fetchImpl: typeof fetch = async () => {
      throw new TypeError("Failed to fetch");
    };
    const r = await runLocalShellCommand("healthz", { fetchImpl });
    assert.equal(r.ok, false);
    assert.match(r.body, /Failed to fetch/);
  });
});
