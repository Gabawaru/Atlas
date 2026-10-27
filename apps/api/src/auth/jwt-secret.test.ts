import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { JWT_DEV_DEFAULT_SECRET, resolveJwtSecret } from "./jwt-secret";

describe("resolveJwtSecret", () => {
  it("autorise le défaut en development", () => {
    assert.equal(
      resolveJwtSecret({ ATLAS_ENV: "development" }),
      JWT_DEV_DEFAULT_SECRET,
    );
  });

  it("autorise le défaut en ci", () => {
    assert.equal(
      resolveJwtSecret({ ATLAS_ENV: "ci" }),
      JWT_DEV_DEFAULT_SECRET,
    );
  });

  it("refuse l'absence de secret hors dev/ci", () => {
    assert.throws(
      () => resolveJwtSecret({ ATLAS_ENV: "production" }),
      /JWT_SECRET is required/,
    );
  });

  it("refuse le secret documenté hors dev/ci", () => {
    assert.throws(
      () =>
        resolveJwtSecret({
          ATLAS_ENV: "production",
          JWT_SECRET: JWT_DEV_DEFAULT_SECRET,
        }),
      /dev default/,
    );
  });

  it("accepte un secret explicite en production", () => {
    assert.equal(
      resolveJwtSecret({
        ATLAS_ENV: "production",
        JWT_SECRET: "prod-grade-not-the-example",
      }),
      "prod-grade-not-the-example",
    );
  });
});
