import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  assertInScope,
  runWebPassivePresence,
} from "./web-passive";

describe("web.passive.presence.v1", () => {
  it("refuse une cible hors périmètre", () => {
    const allowed = new Set(["example.com"]);
    assert.throws(
      () => assertInScope("evil.example.net", allowed),
      /OUT_OF_SCOPE/,
    );
  });

  it("accepte une cible du scope (sous-domaine)", () => {
    const allowed = new Set(["example.com"]);
    assert.doesNotThrow(() => assertInScope("www.example.com", allowed));
  });

  it("refuse IP / host non listés même proches", () => {
    const allowed = new Set(["example.com"]);
    assert.throws(() => assertInScope("example.com.evil.test", allowed));
  });

  it("rate-limit + cancel + jamais hors scope + hash preuve", async () => {
    let cancelled = false;
    const results = await runWebPassivePresence(
      [{ host: "demo.atlas.local" }, { host: "other.atlas.local" }],
      {
        allowedHosts: new Set(["demo.atlas.local", "other.atlas.local"]),
        rateLimitPerMinute: 120,
        isCancelled: () => cancelled,
        lookupFn: async (host) => {
          if (host === "demo.atlas.local") cancelled = true;
          return { a: ["127.0.0.1"], aaaa: [] };
        },
        fetchFn: async () => ({
          status: 200,
          headers: { server: "demo" },
        }),
        sleepFn: async () => undefined,
      },
    );
    assert.equal(results.length, 1);
    assert.equal(results[0]!.host, "demo.atlas.local");
    assert.equal(results[0]!.inScope, true);
    assert.ok(results[0]!.dns.resolved);
    assert.equal(results[0]!.evidenceHash.length, 64);
    assert.equal(results[0]!.networkMocked, true);
  });

  it("échoue si le worker tente un host hors allowlist", async () => {
    await assert.rejects(
      () =>
        runWebPassivePresence([{ host: "not-allowed.test" }], {
          allowedHosts: new Set(["allowed.test"]),
          rateLimitPerMinute: 60,
          isCancelled: () => false,
          lookupFn: async () => ({ a: ["1.2.3.4"], aaaa: [] }),
          fetchFn: async () => ({ status: 200, headers: {} }),
          sleepFn: async () => undefined,
        }),
      /OUT_OF_SCOPE/,
    );
  });

  it("rapporte la progression", async () => {
    const progress: string[] = [];
    await runWebPassivePresence([{ host: "a.test" }, { host: "b.test" }], {
      allowedHosts: new Set(["a.test", "b.test"]),
      rateLimitPerMinute: 1000,
      isCancelled: () => false,
      onProgress: (p) => {
        progress.push(`${p.current}/${p.total}:${p.host}`);
      },
      lookupFn: async () => ({ a: ["127.0.0.1"], aaaa: [] }),
      fetchFn: async () => ({ status: 200, headers: {} }),
      sleepFn: async () => undefined,
    });
    assert.deepEqual(progress, ["1/2:a.test", "2/2:b.test"]);
  });
});
