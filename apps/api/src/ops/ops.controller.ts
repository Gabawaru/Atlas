import {
  Body,
  Controller,
  Get,
  Inject,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import {
  IsBoolean,
  IsOptional,
  IsString,
  MinLength,
} from "class-validator";
import { AuthGuard } from "../auth/auth.guard";
import { AuthService } from "../auth/auth.service";
import type { AuthUser } from "../auth/auth.types";
import { OpsService } from "./ops.service";

class MaintenanceDto {
  @IsBoolean()
  active!: boolean;

  @IsOptional()
  @IsString()
  reason?: string;
}

class PublishVersionDto {
  @IsString()
  @MinLength(1)
  version!: string;

  @IsString()
  @MinLength(1)
  title!: string;

  @IsString()
  @MinLength(1)
  releaseNotes!: string;

  @IsOptional()
  @IsString()
  channel?: string;

  @IsOptional()
  @IsBoolean()
  setCurrent?: boolean;
}

class NoteDto {
  @IsString()
  @MinLength(1)
  message!: string;
}

@Controller("admin/ops")
@UseGuards(AuthGuard)
export class OpsController {
  constructor(
    @Inject(OpsService) private readonly ops: OpsService,
    @Inject(AuthService) private readonly auth: AuthService,
  ) {}

  @Get("status")
  status(@Req() req: { user: AuthUser }) {
    this.auth.requireStaff(req.user, ["ops", "admin", "support"]);
    return this.ops.status();
  }

  @Get("versions")
  versions(@Req() req: { user: AuthUser }) {
    this.auth.requireStaff(req.user, ["ops", "admin", "support"]);
    return this.ops.listVersions();
  }

  @Post("versions")
  publish(@Body() body: PublishVersionDto, @Req() req: { user: AuthUser }) {
    this.auth.requireStaff(req.user, ["ops", "admin"]);
    return this.ops.publishVersion(body, req.user);
  }

  @Post("maintenance")
  maintenance(@Body() body: MaintenanceDto, @Req() req: { user: AuthUser }) {
    this.auth.requireStaff(req.user, ["ops", "admin"]);
    return this.ops.setMaintenance(body, req.user);
  }

  @Get("journal")
  journal(@Req() req: { user: AuthUser }, @Query("limit") limit?: string) {
    this.auth.requireStaff(req.user, ["ops", "admin", "support"]);
    return this.ops.listJournal(limit ? Number(limit) : 40);
  }

  @Post("journal/note")
  note(@Body() body: NoteDto, @Req() req: { user: AuthUser }) {
    this.auth.requireStaff(req.user, ["ops", "admin"]);
    return this.ops.addNote(body.message, req.user);
  }
}
