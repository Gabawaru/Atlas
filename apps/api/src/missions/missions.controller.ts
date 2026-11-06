import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import { IsArray, IsBoolean, IsOptional, IsString, MinLength } from "class-validator";
import type { Response } from "express";
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

  @IsOptional()
  @IsArray()
  exclusions?: string[];

  @IsOptional()
  @IsArray()
  methods?: string[];

  @IsOptional()
  @IsString()
  notes?: string;
}

class UpdateRoeDto {
  @IsArray()
  assetIds!: string[];

  @IsOptional()
  @IsArray()
  methods?: string[];

  @IsOptional()
  @IsArray()
  exclusions?: string[];

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  periodStart?: string;

  @IsOptional()
  @IsString()
  periodEnd?: string;
}

class OwnerAuthDto {
  @IsString()
  signerLabel!: string;
}

/**
 * Bind an already-signed envelope — no createEnvelope / partner /request email.
 * Pass `signatureEnvelopeId` (Pragma Sign) — poll GET status only.
 */
class AttachOwnerAuthDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  signatureEnvelopeId?: string;

  @IsOptional()
  @IsString()
  signerLabel?: string;
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
    this.auth.requireTenant(req.user);
    return this.missions.get(id, req.user.tenantId!);
  }

  @Post("missions")
  create(@Body() body: CreateMissionDto, @Req() req: { user: AuthUser }) {
    this.auth.requireTenant(req.user, ["owner", "operator"]);
    return this.missions.create(req.user, body);
  }

  @Get("missions/:id/roe")
  getRoe(@Param("id") id: string, @Req() req: { user: AuthUser }) {
    this.auth.requireTenant(req.user);
    return this.missions.getRoe(id, req.user.tenantId!);
  }

  @Post("missions/:id/roe")
  updateRoe(
    @Param("id") id: string,
    @Body() body: UpdateRoeDto,
    @Req() req: { user: AuthUser },
  ) {
    this.auth.requireTenant(req.user, ["owner", "operator"]);
    return this.missions.updateRoe(id, req.user, body);
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

  /** Attach existing signed envelope id (poll GET only — never /signatures/request). */
  @Post("missions/:id/owner-authorization/attach")
  attachOwnerAuth(
    @Param("id") id: string,
    @Body() body: AttachOwnerAuthDto,
    @Req() req: { user: AuthUser },
  ) {
    this.auth.requireTenant(req.user, ["owner", "operator"]);
    return this.missions.attachExistingOwnerAuth(id, req.user, {
      signatureEnvelopeId: body.signatureEnvelopeId,
      signerLabel: body.signerLabel,
    });
  }

  @Post("missions/:id/counter-signature")
  counterSign(@Param("id") id: string, @Req() req: { user: AuthUser }) {
    this.auth.requireTenant(req.user, ["owner", "operator"]);
    return this.missions.completeCounterSignature(id, req.user);
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

  @Post("missions/:id/kill")
  kill(@Param("id") id: string, @Req() req: { user: AuthUser }) {
    this.auth.requireTenant(req.user, ["owner", "operator"]);
    return this.missions.kill(id);
  }

  @Get("missions/:id/jobs/:jobId")
  job(
    @Param("id") id: string,
    @Param("jobId") jobId: string,
    @Req() req: { user: AuthUser },
  ) {
    this.auth.requireTenant(req.user);
    return this.missions.getJob(id, jobId, req.user.tenantId!);
  }

  @Get("missions/:id/reports/:reportId/export")
  async exportReport(
    @Param("id") id: string,
    @Param("reportId") reportId: string,
    @Query("format") format: string,
    @Req() req: { user: AuthUser },
    @Res() res: Response,
  ) {
    this.auth.requireTenant(req.user);
    const fmt =
      format === "csv" || format === "pdf" || format === "json"
        ? format
        : "json";
    const file = await this.missions.getReportExport(
      id,
      reportId,
      fmt,
      req.user.tenantId!,
    );
    res.setHeader("Content-Type", file.contentType);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${file.filename}"`,
    );
    if (file.synthetic) {
      res.setHeader("X-Atlas-Synthetic", "true");
    }
    if (Buffer.isBuffer(file.body)) {
      res.send(file.body);
    } else {
      res.send(file.body);
    }
  }

  // conversation + ux-needs → AssistantModule (propose, n'exécute jamais)
}
