import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { IsIn, IsOptional, IsString, MinLength } from "class-validator";
import { AuthGuard } from "../auth/auth.guard";
import { AuthService } from "../auth/auth.service";
import type { AuthUser } from "../auth/auth.types";
import { TicketsService, type TicketStatus } from "./tickets.service";

class CreateTicketDto {
  @IsString()
  tenantId!: string;

  @IsString()
  @MinLength(3)
  subject!: string;

  @IsString()
  @MinLength(3)
  body!: string;

  @IsOptional()
  @IsString()
  missionId?: string;

  @IsOptional()
  @IsString()
  category?: string;
}

class StatusDto {
  @IsIn(["open", "waiting", "resolved", "closed"])
  status!: TicketStatus;
}

@Controller("admin/tickets")
@UseGuards(AuthGuard)
export class TicketsController {
  constructor(
    @Inject(TicketsService) private readonly tickets: TicketsService,
    @Inject(AuthService) private readonly auth: AuthService,
  ) {}

  @Get()
  list(
    @Req() req: { user: AuthUser },
    @Query("status") status?: string,
  ) {
    // Lecture : support, ops, admin, approver (lecture seule pour contexte)
    this.auth.requireStaff(req.user, [
      "support",
      "ops",
      "admin",
      "approver",
    ]);
    return this.tickets.list(status);
  }

  @Post()
  create(@Body() body: CreateTicketDto, @Req() req: { user: AuthUser }) {
    this.auth.requireStaff(req.user, ["support", "ops", "admin"]);
    return this.tickets.create(req.user, body);
  }

  @Patch(":id/status")
  status(
    @Param("id") id: string,
    @Body() body: StatusDto,
    @Req() req: { user: AuthUser },
  ) {
    this.auth.requireStaff(req.user, ["support", "ops", "admin"]);
    return this.tickets.updateStatus(id, req.user, body.status);
  }
}
