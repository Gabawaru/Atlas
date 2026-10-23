import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  assertInScope,
  runWebPassivePresence,
} from "./web-passive";

describe("web.passive.presence.v1", () => {
  it("refuse une cible hors périmètre", () => {
    const allowed = new Set(["example.com"]);
    assert.throws(() => assertInScope("evil.example.net", allowed), /OUT_OF_SCOPE/);
  });

  it("accepte une cible du scope", () => {
    const allowed = new Set(["example.com"]);
    assert.doesNotThrow(() => assertInScope("www.example.com", allowed));
  });

  it("rate-limit + cancel + jamais hors scope", async () => {
    let cancelled = false;
    const calls: string[] = [];
    const results = await runWebPassivePresence(
      [
        { host: "demo.atlas.local" },
        { host: "other.atlas.local" },
      ],
      {
        allowedHosts: new Set(["demo.atlas.local", "other.atlas.local"]),
        rateLimitPerMinute: 120,
        isCancelled: () => cancelled,
        lookupFn: async (host) => {
          calls.push(`dns:${host}`);
          if (host === "demo.atlas.local") cancelled = true;
          return ["127.0.0.1"];
        },
        fetchFn: async (url) => {
          calls.push(`http:${url}`);
          return { status: 200, headers: { server: "demo" } };
        },
        sleepFn: async () => undefined,
      },
    );
    assert.equal(results.length, 1);
    assert.equal(results[0].host, "demo.atlas.local");
    assert.ok(results[0].dns.resolved);
  });

  it("échoue si le worker tente un host hors allowlist", async () => {
    await assert.rejects(
      () =>
        runWebPassivePresence([{ host: "not-allowed.test" }], {
          allowedHosts: new Set(["allowed.test"]),
          rateLimitPerMinute: 60,
          isCancelled: () => false,
          lookupFn: async () => ["1.2.3.4"],
          fetchFn: async () => ({ status: 200, headers: {} }),
          sleepFn: async () => undefined,
        }),
      /OUT_OF_SCOPE/,
    );
  });
});
