import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { MissionsService } from "../missions/missions.service";
import type { AuthUser } from "../auth/auth.types";
import { assertTransition } from "../mission/mission-state";

@Injectable()
export class ApprovalsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(MissionsService) private readonly missions: MissionsService,
  ) {}

  async listQueue() {
    return this.prisma.approvalRequest.findMany({
      where: { status: { in: ["pending", "blocked_no_route"] } },
      include: {
        mission: {
          include: {
            scopeVersions: { orderBy: { version: "desc" }, take: 1 },
            ownerAuths: true,
          },
        },
        decisions: true,
      },
      orderBy: { createdAt: "asc" },
    });
  }

  async decide(
    requestId: string,
    user: AuthUser,
    decision: "approved" | "rejected" | "returned",
    comment?: string,
  ) {
    if (!user.staffRoles.includes("approver")) {
      throw new ForbiddenException(
        "Seul le rôle approver peut décider (support/billing/ops ne peuvent pas).",
      );
    }
    const req = await this.prisma.approvalRequest.findUnique({
      where: { id: requestId },
      include: { mission: true },
    });
    if (!req) throw new NotFoundException();
    if (req.status === "blocked_no_route") {
      throw new BadRequestException(
        "NO_APPROVAL_ROUTE — configurez le routage avant décision.",
      );
    }

    await this.prisma.approvalDecision.create({
      data: {
        requestId,
        decision,
        approverUserId: user.userId,
        scopeHash: req.scopeHash,
        comment,
      },
    });
    await this.prisma.approvalRequest.update({
      where: { id: requestId },
      data: { status: decision === "returned" ? "returned" : decision },
    });

    await this.audit.append({
      tenantId: req.mission.tenantId,
      actorId: user.userId,
      action: "approval.decision",
      objectType: "approval_request",
      objectId: requestId,
      payload: { decision, comment, roleUsed: "approver" },
    });

    if (decision === "approved") {
      const mission = req.mission;
      assertTransition(mission.status as never, "A_APPROVED");
      await this.missions.transition(mission.id, "A_APPROVED", user);
      await this.missions.issueToken(mission.id, user);
    }

    return this.prisma.approvalRequest.findUnique({
      where: { id: requestId },
      include: { decisions: true, mission: true },
    });
  }

  async getRouting() {
    return this.prisma.approvalRoutingPolicy.findMany({
      include: { staffGroup: true, tenant: true },
    });
  }

  /**
   * Import stub hiérarchie — clairement marqué isStub.
   * N'invente PAS une hiérarchie réelle d'entreprise A.
   */
  async importStubHierarchy(orgId: string, approverUserIds: string[]) {
    const group = await this.prisma.staffGroup.create({
      data: {
        orgId,
        name: "[STUB] Groupe approbateurs fictifs",
        isStub: true,
        memberIds: approverUserIds,
      },
    });
    const policy = await this.prisma.approvalRoutingPolicy.create({
      data: {
        orgWide: true,
        modulePattern: "*",
        staffGroupId: group.id,
        enabled: true,
        isStub: true,
      },
    });
    await this.audit.append({
      actorId: null,
      action: "approval_routing.stub_imported",
      objectType: "approval_routing_policy",
      objectId: policy.id,
      payload: {
        warning:
          "Stub uniquement — ne représente pas la hiérarchie réelle entreprise A",
      },
    });
    return { group, policy };
  }
}
