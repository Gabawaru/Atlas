import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildHierarchyTree,
  uniqueApproverIds,
  wouldCreateCycle,
} from "./hierarchy-tree.ts";

describe("hierarchy-tree", () => {
  it("buildHierarchyTree — parent–enfant + multi-niveaux", () => {
    const tree = buildHierarchyTree([
      { id: "b", parentId: "a", title: "Expert cyber", sortOrder: 1 },
      { id: "a", parentId: null, title: "Cofondateur", sortOrder: 0 },
      { id: "c", parentId: "a", title: "Stagiaire", sortOrder: 0 },
    ]);
    assert.equal(tree.length, 1);
    assert.equal(tree[0]!.id, "a");
    assert.deepEqual(
      tree[0]!.children.map((c) => c.id),
      ["c", "b"],
    );
  });

  it("buildHierarchyTree — deux racines même niveau (cofondateurs)", () => {
    const tree = buildHierarchyTree([
      { id: "1", parentId: null, title: "Cofondateur", sortOrder: 0 },
      { id: "2", parentId: null, title: "Cofondateur", sortOrder: 0 },
    ]);
    assert.equal(tree.length, 2);
  });

  it("wouldCreateCycle — self / descendant", () => {
    const nodes = [
      { id: "a", parentId: null },
      { id: "b", parentId: "a" },
      { id: "c", parentId: "b" },
    ];
    assert.equal(wouldCreateCycle(nodes, "a", "a"), true);
    assert.equal(wouldCreateCycle(nodes, "a", "c"), true);
    assert.equal(wouldCreateCycle(nodes, "c", "a"), false);
    assert.equal(wouldCreateCycle(nodes, "b", null), false);
  });

  it("uniqueApproverIds — même user multi-postes dédupliqué", () => {
    const ids = uniqueApproverIds([
      { userId: "ben", canApprove: true },
      { userId: "ben", canApprove: true },
      { userId: "rom", canApprove: true },
      { userId: "stag", canApprove: false },
    ]);
    assert.deepEqual(ids, ["ben", "rom"]);
  });
});
