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
import { IsArray, IsBoolean, IsOptional, IsString, MinLength } from "class-validator";
import { AuthGuard } from "../auth/auth.guard";
import { AuthService } from "../auth/auth.service";
import type { AuthUser } from "../auth/auth.types";
import { MissionsService } from "./missions.service";

class CreateMissionDto {
  @IsString()
  @MinLength(3)
  title!: string;

  @IsArray()
  uxNeedIds!: string[];

  @IsArray()
  assetIds!: string[];

  @IsOptional()
  @IsBoolean()
  synthetic?: boolean;
}

class OwnerAuthDto {
  @IsString()
  signerLabel!: string;
}

class ChatDto {
  @IsString()
  message!: string;
}

@Controller()
@UseGuards(AuthGuard)
export class MissionsController {
  constructor(
    @Inject(MissionsService) private readonly missions: MissionsService,
    @Inject(AuthService) private readonly auth: AuthService,
  ) {}

  @Get("missions")
  list(@Req() req: { user: AuthUser }) {
    this.auth.requireTenant(req.user);
    return this.missions.listForTenant(req.user.tenantId!);
  }

  @Get("missions/:id")
  get(@Param("id") id: string, @Req() req: { user: AuthUser }) {
    return this.missions.get(id, req.user.tenantId);
  }

  @Post("missions")
  create(@Body() body: CreateMissionDto, @Req() req: { user: AuthUser }) {
    this.auth.requireTenant(req.user, ["owner", "operator"]);
    return this.missions.create(req.user, body);
  }

  @Post("missions/:id/owner-authorization")
  ownerAuth(
    @Param("id") id: string,
    @Body() body: OwnerAuthDto,
    @Req() req: { user: AuthUser },
  ) {
    this.auth.requireTenant(req.user, ["owner", "operator"]);
    return this.missions.submitOwnerAuth(id, req.user, body.signerLabel);
  }

  @Post("missions/:id/execute")
  execute(@Param("id") id: string, @Req() req: { user: AuthUser }) {
    this.auth.requireTenant(req.user, ["owner", "operator"]);
    return this.missions.queueAndRun(id, req.user);
  }

  @Post("missions/:id/cancel")
  cancel(@Param("id") id: string, @Req() req: { user: AuthUser }) {
    this.auth.requireTenant(req.user);
    return this.missions.requestCancel(id);
  }

  @Post("conversation")
  chat(@Body() body: ChatDto) {
    return this.missions.guidedConversation(body.message);
  }

  @Get("ux-needs")
  uxNeeds() {
    return this.missions.guidedConversation("").suggestions;
  }
}
