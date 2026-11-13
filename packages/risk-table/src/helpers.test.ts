import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatRdapSignal,
  hasDmarcInTxtSample,
  hasSpfInTxtSample,
  HSTS_MAX_AGE_FLOOR_SEC,
  isHstsMaxAgeWeak,
  parseHstsMaxAge,
  rdapExpiryDaysRemaining,
} from "./index";

describe("@atlas/risk-table helpers", () => {
  it("HSTS max-age floor", () => {
    assert.equal(parseHstsMaxAge("max-age=1"), 1);
    assert.equal(isHstsMaxAgeWeak("max-age=1"), true);
    assert.equal(isHstsMaxAgeWeak(`max-age=${HSTS_MAX_AGE_FLOOR_SEC}`), false);
  });

  it("RDAP signal + expiry days", () => {
    assert.equal(
      formatRdapSignal({
        ok: true,
        source: "rdap",
        registrar: "Example",
        events: [{ action: "expiration", date: "2027-06-01T00:00:00Z" }],
      }),
      "rdap · Example · expiry=2027-06-01",
    );
    assert.equal(
      rdapExpiryDaysRemaining(
        {
          ok: true,
          events: [{ action: "expiration", date: "2026-11-01T00:00:00Z" }],
        },
        Date.parse("2026-11-13T00:00:00Z"),
      ),
      -12,
    );
  });

  it("SPF txt sample", () => {
    assert.equal(hasSpfInTxtSample(["v=spf1 -all"]), true);
    assert.equal(hasSpfInTxtSample(["hello"]), false);
  });

  it("DMARC txt sample", () => {
    assert.equal(hasDmarcInTxtSample(["v=DMARC1; p=none"]), true);
    assert.equal(hasDmarcInTxtSample(["v=spf1 -all"]), false);
  });
});
