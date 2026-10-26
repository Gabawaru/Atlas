/**
 * Helpers arbre de postes — purs (pas de Prisma).
 * Poste ≠ identité : multi-affectations gérées ailleurs.
 */

export type FlatHierarchyNode = {
  id: string;
  parentId: string | null;
  title: string;
  sortOrder: number;
};

export type TreeNode<T extends FlatHierarchyNode> = T & {
  children: TreeNode<T>[];
};

/** Construit un arbre trié par sortOrder puis title. Orphelins (parent manquant) → racines. */
export function buildHierarchyTree<T extends FlatHierarchyNode>(
  flat: T[],
): TreeNode<T>[] {
  const byId = new Map<string, TreeNode<T>>();
  for (const n of flat) {
    byId.set(n.id, { ...n, children: [] });
  }
  const roots: TreeNode<T>[] = [];
  for (const n of byId.values()) {
    if (n.parentId && byId.has(n.parentId)) {
      byId.get(n.parentId)!.children.push(n);
    } else {
      roots.push(n);
    }
  }
  const sortRec = (nodes: TreeNode<T>[]) => {
    nodes.sort(
      (a, b) =>
        a.sortOrder - b.sortOrder || a.title.localeCompare(b.title, "fr"),
    );
    for (const c of nodes) sortRec(c.children);
  };
  sortRec(roots);
  return roots;
}

/**
 * Refuse un parentId qui créerait un cycle (self ou descendant).
 * `nodes` = liste plate id → parentId courant (avant mutation).
 */
export function wouldCreateCycle(
  nodes: Iterable<{ id: string; parentId: string | null }>,
  nodeId: string,
  newParentId: string | null,
): boolean {
  if (!newParentId) return false;
  if (newParentId === nodeId) return true;
  const parentOf = new Map<string, string | null>();
  for (const n of nodes) parentOf.set(n.id, n.parentId);
  let cur: string | null = newParentId;
  const seen = new Set<string>();
  while (cur) {
    if (cur === nodeId) return true;
    if (seen.has(cur)) return true;
    seen.add(cur);
    cur = parentOf.get(cur) ?? null;
  }
  return false;
}

/** Déduplique les userIds canApprove (ordre stable). */
export function uniqueApproverIds(
  assignments: Iterable<{ userId: string; canApprove: boolean }>,
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const a of assignments) {
    if (!a.canApprove) continue;
    if (seen.has(a.userId)) continue;
    seen.add(a.userId);
    out.push(a.userId);
  }
  return out;
}
