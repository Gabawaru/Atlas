import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { ApprovalsService } from "../approvals/approvals.service";
import { buildHierarchyTree, uniqueApproverIds } from "./hierarchy-tree";

@Injectable()
export class HierarchyService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(ApprovalsService) private readonly approvals: ApprovalsService,
  ) {}

  async listStaffForOrg(orgId: string) {
    await this.assertOrg(orgId);
    const memberships = await this.prisma.staffMembership.findMany({
      where: { orgId },
      include: { user: true },
      orderBy: { userId: "asc" },
    });
    const byUser = new Map<
      string,
      {
        userId: string;
        email: string;
        displayName: string;
        staffRoles: string[];
      }
    >();
    for (const m of memberships) {
      const cur = byUser.get(m.userId);
      if (cur) {
        if (!cur.staffRoles.includes(m.staffRole)) {
          cur.staffRoles.push(m.staffRole);
        }
      } else {
        byUser.set(m.userId, {
          userId: m.userId,
          email: m.user.email,
          displayName: m.user.displayName,
          staffRoles: [m.staffRole],
        });
      }
    }
    return [...byUser.values()].sort((a, b) =>
      a.displayName.localeCompare(b.displayName, "fr"),
    );
  }

  async getTree(orgId: string) {
    await this.assertOrg(orgId);
    const nodes = await this.prisma.hierarchyNode.findMany({
      where: { orgId },
      include: {
        assignments: {
          include: {
            user: {
              select: { id: true, email: true, displayName: true },
            },
          },
          orderBy: { createdAt: "asc" },
        },
      },
      orderBy: [{ sortOrder: "asc" }, { title: "asc" }],
    });
    const flat = nodes.map((n) => ({
      id: n.id,
      orgId: n.orgId,
      title: n.title,
      parentId: n.parentId,
      sortOrder: n.sortOrder,
      isStub: n.isStub,
      assignments: n.assignments.map((a) => ({
        id: a.id,
        userId: a.userId,
        canApprove: a.canApprove,
        user: a.user,
      })),
    }));
    return {
      orgId,
      disclaimer:
        "Arbre éditable — postes ≠ identités ; multi-affectations OK. isStub tant que pas source A réelle. Routage Policy Guard via StaffGroup (import CSV/stub ou publish).",
      tree: buildHierarchyTree(flat),
    };
  }

  async createNode(input: {
    orgId: string;
    title: string;
    parentId?: string | null;
    sortOrder?: number;
  }) {
    await this.assertOrg(input.orgId);
    const title = input.title.trim();
    if (!title) throw new BadRequestException("title requis");
    if (input.parentId) {
      const parent = await this.prisma.hierarchyNode.findFirst({
        where: { id: input.parentId, orgId: input.orgId },
      });
      if (!parent) throw new BadRequestException("parentId introuvable dans l'org");
    }
    const node = await this.prisma.hierarchyNode.create({
      data: {
        orgId: input.orgId,
        title,
        parentId: input.parentId ?? null,
        sortOrder: input.sortOrder ?? 0,
        isStub: true,
      },
    });
    await this.audit.append({
      action: "hierarchy.node_created",
      objectType: "hierarchy_node",
      objectId: node.id,
      payload: { orgId: input.orgId, title, parentId: node.parentId, isStub: true },
    });
    return node;
  }

  async deleteNode(nodeId: string) {
    const node = await this.prisma.hierarchyNode.findUnique({
      where: { id: nodeId },
    });
    if (!node) throw new NotFoundException();
    // Cascade DB : enfants + affectations
    await this.prisma.hierarchyNode.delete({ where: { id: nodeId } });
    await this.audit.append({
      action: "hierarchy.node_deleted",
      objectType: "hierarchy_node",
      objectId: nodeId,
      payload: { orgId: node.orgId, title: node.title },
    });
    return { deleted: true, id: nodeId };
  }

  async assign(input: {
    nodeId: string;
    userId: string;
    canApprove?: boolean;
  }) {
    const node = await this.prisma.hierarchyNode.findUnique({
      where: { id: input.nodeId },
    });
    if (!node) throw new NotFoundException("Nœud introuvable");

    const staff = await this.prisma.staffMembership.findFirst({
      where: { orgId: node.orgId, userId: input.userId },
    });
    if (!staff) {
      throw new BadRequestException(
        "userId doit être staff de l'org — aucun compte inventé",
      );
    }

    const assignment = await this.prisma.hierarchyAssignment.upsert({
      where: {
        nodeId_userId: { nodeId: input.nodeId, userId: input.userId },
      },
      create: {
        nodeId: input.nodeId,
        userId: input.userId,
        canApprove: input.canApprove ?? false,
      },
      update: {
        ...(input.canApprove !== undefined
          ? { canApprove: input.canApprove }
          : {}),
      },
      include: {
        user: { select: { id: true, email: true, displayName: true } },
      },
    });
    await this.audit.append({
      action: "hierarchy.assignment_upserted",
      objectType: "hierarchy_assignment",
      objectId: assignment.id,
      payload: {
        nodeId: input.nodeId,
        userId: input.userId,
        canApprove: assignment.canApprove,
      },
    });
    return assignment;
  }

  async updateAssignment(assignmentId: string, canApprove: boolean) {
    const existing = await this.prisma.hierarchyAssignment.findUnique({
      where: { id: assignmentId },
    });
    if (!existing) throw new NotFoundException();
    const updated = await this.prisma.hierarchyAssignment.update({
      where: { id: assignmentId },
      data: { canApprove },
      include: {
        user: { select: { id: true, email: true, displayName: true } },
      },
    });
    return updated;
  }

  async unassign(assignmentId: string) {
    const existing = await this.prisma.hierarchyAssignment.findUnique({
      where: { id: assignmentId },
    });
    if (!existing) throw new NotFoundException();
    await this.prisma.hierarchyAssignment.delete({
      where: { id: assignmentId },
    });
    await this.audit.append({
      action: "hierarchy.assignment_deleted",
      objectType: "hierarchy_assignment",
      objectId: assignmentId,
      payload: { nodeId: existing.nodeId, userId: existing.userId },
    });
    return { deleted: true, id: assignmentId };
  }

  /**
   * Publie les canApprove de l'arbre vers StaffGroup + ApprovalRoutingPolicy (isStub).
   * Réutilise importStubHierarchy — n'invente pas d'users ; 0 canApprove → pas de route.
   */
  async publishRouting(orgId: string, tenantId?: string | null) {
    await this.assertOrg(orgId);
    const assignments = await this.prisma.hierarchyAssignment.findMany({
      where: { node: { orgId }, canApprove: true },
      select: { userId: true, canApprove: true },
    });
    const memberIds = uniqueApproverIds(assignments);
    if (memberIds.length === 0) {
      return {
        published: false,
        policyCreated: false,
        realMissionsRemainBlocked: true,
        matchedUserIds: [] as string[],
        disclaimer:
          "Aucun canApprove dans l'arbre — aucune route créée. Missions réelles restent BLOCKED (NO_APPROVAL_ROUTE). Aucun approbateur inventé.",
      };
    }
    const result = await this.approvals.importStubHierarchy(
      orgId,
      memberIds,
      tenantId,
    );
    return {
      published: true,
      policyCreated: true,
      realMissionsRemainBlocked: false,
      matchedUserIds: memberIds,
      ...result,
      disclaimer:
        "Routage publié depuis l'arbre (isStub) — pas une org chart RH certifiée A. Policy Guard / NO_APPROVAL_ROUTE inchangés.",
    };
  }

  private async assertOrg(orgId: string) {
    const org = await this.prisma.organization.findUnique({
      where: { id: orgId },
    });
    if (!org) throw new BadRequestException("orgId introuvable");
  }
}
