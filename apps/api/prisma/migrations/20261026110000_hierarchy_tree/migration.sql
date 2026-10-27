-- Arbre de postes (parent–enfant) + multi-affectations User↔ nœud.
-- StaffGroup / ApprovalRoutingPolicy inchangés (routage + import CSV/stub).

CREATE TABLE "HierarchyNode" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "parentId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isStub" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HierarchyNode_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "HierarchyAssignment" (
    "id" TEXT NOT NULL,
    "nodeId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "canApprove" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HierarchyAssignment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "HierarchyNode_orgId_parentId_idx" ON "HierarchyNode"("orgId", "parentId");
CREATE INDEX "HierarchyNode_orgId_sortOrder_idx" ON "HierarchyNode"("orgId", "sortOrder");
CREATE INDEX "HierarchyAssignment_userId_idx" ON "HierarchyAssignment"("userId");
CREATE UNIQUE INDEX "HierarchyAssignment_nodeId_userId_key" ON "HierarchyAssignment"("nodeId", "userId");

ALTER TABLE "HierarchyNode" ADD CONSTRAINT "HierarchyNode_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "HierarchyNode" ADD CONSTRAINT "HierarchyNode_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "HierarchyNode"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HierarchyAssignment" ADD CONSTRAINT "HierarchyAssignment_nodeId_fkey" FOREIGN KEY ("nodeId") REFERENCES "HierarchyNode"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HierarchyAssignment" ADD CONSTRAINT "HierarchyAssignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
