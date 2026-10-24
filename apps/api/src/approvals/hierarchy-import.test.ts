import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  matchExistingApprovers,
  parseHierarchyCsv,
  parseHierarchyJson,
} from "./hierarchy-import.ts";

describe("hierarchy import — format prêt, pas d'invention", () => {
  it("CSV vide → empty (missions réelles restent BLOCKED)", () => {
    const r = parseHierarchyCsv("   \n  ");
    assert.equal(r.empty, true);
    assert.equal(r.rows.length, 0);
  });

  it("CSV en-tête seul → empty", () => {
    const r = parseHierarchyCsv("email,role\n");
    assert.equal(r.empty, true);
  });

  it("CSV parse emails valides", () => {
    const r = parseHierarchyCsv(
      "email,role\napprover@a.atlas.local,approver\nbogus,x\n",
    );
    assert.equal(r.empty, false);
    assert.equal(r.rows.length, 1);
    assert.equal(r.rows[0]!.email, "approver@a.atlas.local");
    assert.ok(r.errors.some((e) => /invalide/i.test(e)));
  });

  it("JSON [] → empty", () => {
    assert.equal(parseHierarchyJson("[]").empty, true);
  });

  it("JSON { approvers } parse", () => {
    const r = parseHierarchyJson(
      JSON.stringify({
        approvers: [{ email: "approver@a.atlas.local", role: "approver" }],
      }),
    );
    assert.equal(r.rows.length, 1);
  });

  it("matchExistingApprovers n'invente pas d'IDs", () => {
    const map = new Map([["approver@a.atlas.local", "user-1"]]);
    const m = matchExistingApprovers(
      [
        { email: "approver@a.atlas.local" },
        { email: "ghost@nowhere.test" },
      ],
      map,
    );
    assert.deepEqual(m.matchedUserIds, ["user-1"]);
    assert.deepEqual(m.unknownEmails, ["ghost@nowhere.test"]);
  });
});
