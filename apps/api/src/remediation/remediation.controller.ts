import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Patch,
  Req,
  UseGuards,
} from "@nestjs/common";
import { IsIn, IsOptional, IsString } from "class-validator";
import { AuthGuard } from "../auth/auth.guard";
import { AuthService } from "../auth/auth.service";
import type { AuthUser } from "../auth/auth.types";
import {
  RemediationService,
  REMEDIATION_STATUSES,
  type RemediationStatus,
} from "./remediation.service";

class UpdateRemediationDto {
  @IsIn([...REMEDIATION_STATUSES])
  remediationStatus!: RemediationStatus;

  @IsOptional()
  @IsString()
  remediationNote?: string;
}

@Controller()
@UseGuards(AuthGuard)
export class RemediationController {
  constructor(
    @Inject(RemediationService) private readonly remediation: RemediationService,
    @Inject(AuthService) private readonly auth: AuthService,
  ) {}

  @Get("findings")
  list(@Req() req: { user: AuthUser }) {
    this.auth.requireTenant(req.user);
    return this.remediation.listForTenant(req.user.tenantId!);
  }

  @Patch("findings/:id/remediation")
  update(
    @Param("id") id: string,
    @Body() body: UpdateRemediationDto,
    @Req() req: { user: AuthUser },
  ) {
    this.auth.requireTenant(req.user, ["owner", "operator"]);
    return this.remediation.update(id, req.user, body);
  }
}
