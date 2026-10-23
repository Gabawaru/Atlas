import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { IsIn, IsOptional, IsString } from "class-validator";
import { AuthGuard } from "../auth/auth.guard";
import { AuthService } from "../auth/auth.service";
import type { AuthUser } from "../auth/auth.types";
import { ApprovalsService } from "./approvals.service";
import { AuditService } from "../audit/audit.service";

class DecideDto {
  @IsIn(["approved", "rejected", "returned"])
  decision!: "approved" | "rejected" | "returned";

  @IsOptional()
  @IsString()
  comment?: string;
}

class StubImportDto {
  @IsString()
  orgId!: string;

  /** Si fourni : débloque ce tenant en démo ; sinon org-wide */
  @IsOptional()
  @IsString()
  tenantId?: string;
}

@Controller("admin")
@UseGuards(AuthGuard)
export class ApprovalsController {
  constructor(
    @Inject(ApprovalsService) private readonly approvals: ApprovalsService,
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  @Get("approvals")
  queue(@Req() req: { user: AuthUser }) {
    this.auth.requireStaff(req.user, [
      "approver",
      "admin",
      "ops",
      "support",
    ]);
    return this.approvals.listQueue();
  }

  @Post("approvals/:id/decide")
  decide(
    @Param("id") id: string,
    @Body() body: DecideDto,
    @Req() req: { user: AuthUser },
  ) {
    this.auth.requireStaff(req.user, ["approver"]);
    return this.approvals.decide(id, req.user, body.decision, body.comment);
  }

  @Get("tenants")
  tenants(@Req() req: { user: AuthUser }) {
    this.auth.requireStaff(req.user, ["admin", "ops", "support", "approver"]);
    return this.approvals.listTenants();
  }

  /**
   * Matrice pédagogique sécu (RoE / jetons) — billing exclu :
   * rôle billing → GET /v1/admin/billing/subscriptions (commercial seul).
   */
  @Get("entitlements")
  entitlements(@Req() req: { user: AuthUser }) {
    this.auth.requireStaff(req.user, [
      "admin",
      "ops",
      "support",
      "approver",
    ]);
    return this.approvals.entitlementMatrix();
  }

  @Get("routing")
  routing(@Req() req: { user: AuthUser }) {
    this.auth.requireStaff(req.user, ["admin", "ops", "approver"]);
    return this.approvals.getRouting();
  }

  @Post("routing/import-stub")
  async importStub(
    @Body() body: StubImportDto,
    @Req() req: { user: AuthUser },
  ) {
    this.auth.requireStaff(req.user, ["admin"]);
    // Inclure tous les staff « approver » + l'admin courant (groupe stub démo)
    const approvers = await this.approvals.listApproverUserIds(body.orgId);
    const memberIds = [...new Set([req.user.userId, ...approvers])];
    return this.approvals.importStubHierarchy(
      body.orgId,
      memberIds,
      body.tenantId,
    );
  }

  @Get("audit/verify")
  async verifyAudit(@Req() req: { user: AuthUser }) {
    this.auth.requireStaff(req.user, ["admin", "ops"]);
    return this.audit.verifyChain();
  }
}
