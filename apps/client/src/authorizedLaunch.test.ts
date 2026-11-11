import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  authorizedLaunchHref,
  isAuthorizedRoeHost,
  parseAuthorizedLaunch,
} from "./authorizedLaunch.js";

describe("isAuthorizedRoeHost", () => {
  it("allows RoE apexes and subdomains only", () => {
    assert.equal(isAuthorizedRoeHost("pragma-serve.com"), true);
    assert.equal(isAuthorizedRoeHost("console.pragma-serve.com"), true);
    assert.equal(isAuthorizedRoeHost("miells.pragma-cloud.com"), true);
    assert.equal(isAuthorizedRoeHost("sign.pragma.mc"), true);
    assert.equal(isAuthorizedRoeHost("evil.com"), false);
    assert.equal(isAuthorizedRoeHost("pragma-serve.com.evil.com"), false);
    assert.equal(isAuthorizedRoeHost("notpragma-cloud.com"), false);
  });

  it("refuses bare pragma-cloud.com / pragma.mc (Policy Guard parity)", () => {
    // policy-guard isRoeInScopeHost("pragma-cloud.com") === false — apex non listé
    assert.equal(isAuthorizedRoeHost("pragma-cloud.com"), false);
    assert.equal(isAuthorizedRoeHost("pragma.mc"), false);
  });
});

describe("parseAuthorizedLaunch", () => {
  it("returns empty miss when no action", () => {
    const r = parseAuthorizedLaunch("");
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.reason, "");
  });

  it("accepts authorized action + default host", () => {
    const r = parseAuthorizedLaunch("?action=scan");
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.intent.action, "scan");
      assert.equal(r.intent.host, "pragma-serve.com");
      assert.equal(r.intent.label, "Scan");
    }
  });

  it("rejects out-of-scope host", () => {
    const r = parseAuthorizedLaunch("?action=osint&host=example.com");
    assert.equal(r.ok, false);
    if (!r.ok) assert.match(r.reason, /hors RoE/);
  });

  it("rejects unknown action", () => {
    const r = parseAuthorizedLaunch("?action=exploit&host=pragma-serve.com");
    assert.equal(r.ok, false);
    if (!r.ok) assert.match(r.reason, /non autorisée/);
  });
});

describe("authorizedLaunchHref", () => {
  it("builds local scanner deep-link", () => {
    assert.equal(
      authorizedLaunchHref("recon"),
      "http://localhost:3002/?action=recon&host=pragma-serve.com#scanner",
    );
  });
});
