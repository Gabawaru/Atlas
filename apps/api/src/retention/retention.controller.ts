import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { IsArray, IsBoolean, IsOptional, IsString } from "class-validator";
import { AuthGuard } from "../auth/auth.guard";
import { AuthService } from "../auth/auth.service";
import type { AuthUser } from "../auth/auth.types";
import { RetentionService } from "./retention.service";
import type { RetentionCategory } from "./retention.policy";

class LegalHoldDto {
  @IsBoolean()
  active!: boolean;

  @IsOptional()
  @IsString()
  reason?: string;
}

class PurgeDto {
  @IsOptional()
  @IsBoolean()
  dryRun?: boolean;

  @IsOptional()
  @IsArray()
  categories?: RetentionCategory[];

  @IsOptional()
  @IsBoolean()
  forceAuditPurge?: boolean;
}

@Controller("admin/retention")
@UseGuards(AuthGuard)
export class RetentionController {
  constructor(
    @Inject(RetentionService) private readonly retention: RetentionService,
    @Inject(AuthService) private readonly auth: AuthService,
  ) {}

  @Get("policy")
  policy(@Req() req: { user: AuthUser }) {
    this.auth.requireStaff(req.user, ["admin", "ops", "support"]);
    return this.retention.policy();
  }

  @Post("tenants/:tenantId/legal-hold")
  legalHold(
    @Param("tenantId") tenantId: string,
    @Body() body: LegalHoldDto,
    @Req() req: { user: AuthUser },
  ) {
    this.auth.requireStaff(req.user, ["admin", "ops"]);
    return this.retention.setLegalHold(tenantId, req.user, body);
  }

  @Post("tenants/:tenantId/purge")
  purge(
    @Param("tenantId") tenantId: string,
    @Body() body: PurgeDto,
    @Req() req: { user: AuthUser },
  ) {
    this.auth.requireStaff(req.user, ["admin", "ops"]);
    return this.retention.runPurge({
      tenantId,
      dryRun: body.dryRun !== false, // défaut dry-run
      categories: body.categories,
      forceAuditPurge: body.forceAuditPurge === true,
      actorId: req.user.userId,
    });
  }

  @Get("tenants/:tenantId/runs")
  runs(
    @Param("tenantId") tenantId: string,
    @Req() req: { user: AuthUser },
    @Query("limit") _limit?: string,
  ) {
    this.auth.requireStaff(req.user, ["admin", "ops", "support"]);
    return this.retention.listPurgeRuns(tenantId);
  }
}
