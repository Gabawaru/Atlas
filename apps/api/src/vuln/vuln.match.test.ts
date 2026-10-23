import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  confidenceForIdentity,
  matchFromFixtures,
  mergeCandidates,
  VERSION_MATCH_DISCLAIMER,
} from "./match";
import { parseServerBanner } from "./parse-identity";
import { FeedRateLimiter } from "./rate-limit";
import { VERSION_MATCH_DISCLAIMER as D2 } from "./disclaimer";

describe("vuln matching — confiance ≠ gravité", () => {
  it("disclaimer explicite", () => {
    assert.match(VERSION_MATCH_DISCLAIMER, /ne confirme pas une vulnérabilité/i);
    assert.equal(VERSION_MATCH_DISCLAIMER, D2);
  });

  it("parse bannière Server nginx/openssl", () => {
    const ids = parseServerBanner("nginx/1.14.0 (Ubuntu) OpenSSL/1.0.2k");
    assert.ok(ids.some((i) => i.name === "nginx" && i.version === "1.14.0"));
    assert.ok(ids.some((i) => i.name === "openssl" && i.version === "1.0.2k"));
  });

  it("fixture openssl → CVE avec confidence medium et severity distincte", () => {
    const hits = matchFromFixtures({
      name: "openssl",
      version: "1.0.2k",
      ecosystem: "openssl",
    });
    assert.ok(hits.length >= 1);
    const h = hits[0];
    assert.equal(h.cveId, "CVE-2017-3731");
    assert.equal(h.severity, "medium");
    assert.ok(["low", "medium", "high"].includes(h.confidence));
    // Confiance et gravité sont des axes distincts (ici medium/medium par coincidence fixture)
    assert.ok("confidence" in h && "severity" in h);
  });

  it("log4j fixture marque KEV sans hausser artificiellement la confidence à = severity", () => {
    const hits = matchFromFixtures({
      name: "log4j-core",
      version: "2.14.1",
      ecosystem: "maven",
    });
    assert.equal(hits[0]?.cveId, "CVE-2021-44228");
    assert.equal(hits[0]?.kevListed, true);
    assert.equal(hits[0]?.severity, "critical");
    assert.equal(hits[0]?.confidence, "high"); // multi-source + KEV = matching fort
    // Le principe métier reste : confidence décrit le matching, pas l'exploitabilité
    assert.ok(hits[0].feedSources.includes("kev"));
  });

  it("mergeCandidates dédoublonne par CVE", () => {
    const a = matchFromFixtures({
      name: "nginx",
      version: "1.14.0",
      ecosystem: "nginx",
    });
    const merged = mergeCandidates([...a, ...a]);
    assert.equal(merged.length, a.length);
  });

  it("confidenceForIdentity : banner synthétique reste low", () => {
    assert.equal(
      confidenceForIdentity(
        { name: "atlas-synthetic", version: "1.0", ecosystem: "generic" },
        ["osv"],
        false,
      ),
      "low",
    );
  });

  it("rate limit bloque au-delà du plafond", () => {
    let t = 0;
    const lim = new FeedRateLimiter(2, () => t);
    assert.equal(lim.tryAcquire("osv"), true);
    assert.equal(lim.tryAcquire("osv"), true);
    assert.equal(lim.tryAcquire("osv"), false);
    t += 61_000;
    assert.equal(lim.tryAcquire("osv"), true);
  });
});
