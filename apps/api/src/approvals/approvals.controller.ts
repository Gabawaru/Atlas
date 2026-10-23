import { Body, Controller, Get, Inject, Param, Post, Req, UseGuards } from "@nestjs/common";
import { IsIn, IsOptional, IsString } from "class-validator";
import { AuthGuard } from "../auth/auth.guard";
import { AuthService } from "../auth/auth.service";
import type { AuthUser } from "../auth/auth.types";
import { ApprovalsService } from "./approvals.service";

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
}

@Controller("admin")
@UseGuards(AuthGuard)
export class ApprovalsController {
  constructor(
    @Inject(ApprovalsService) private readonly approvals: ApprovalsService,
    @Inject(AuthService) private readonly auth: AuthService,
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

  @Get("routing")
  routing(@Req() req: { user: AuthUser }) {
    this.auth.requireStaff(req.user, ["admin", "ops", "approver"]);
    return this.approvals.getRouting();
  }

  @Post("routing/import-stub")
  importStub(@Body() body: StubImportDto, @Req() req: { user: AuthUser }) {
    this.auth.requireStaff(req.user, ["admin"]);
    return this.approvals.importStubHierarchy(body.orgId, [req.user.userId]);
  }
}
