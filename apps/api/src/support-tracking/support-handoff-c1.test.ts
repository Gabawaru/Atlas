import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { BadRequestException } from "@nestjs/common";
import { requirePcConfirmedAt } from "./pc-confirm";

describe("requirePcConfirmedAt (C1 fail-closed)", () => {
  const now = Date.parse("2026-11-12T16:30:00.000Z");

  it("refuse sans pcConfirmedAt", () => {
    assert.throws(() => requirePcConfirmedAt(undefined, now), BadRequestException);
    assert.throws(() => requirePcConfirmedAt("  ", now), /C1/);
  });

  it("refuse ISO invalide", () => {
    assert.throws(() => requirePcConfirmedAt("not-a-date", now), /invalide/);
  });

  it("refuse futur lointain", () => {
    assert.throws(
      () => requirePcConfirmedAt("2026-11-12T17:30:00.000Z", now),
      /futur/,
    );
  });

  it("refuse confirm trop vieux (>15 min)", () => {
    assert.throws(
      () => requirePcConfirmedAt("2026-11-12T16:00:00.000Z", now),
      /expir/,
    );
  });

  it("accepte confirm récent", () => {
    const ok = requirePcConfirmedAt("2026-11-12T16:25:00.000Z", now);
    assert.equal(ok, "2026-11-12T16:25:00.000Z");
  });
});
