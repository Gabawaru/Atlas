import {
  Body,
  Controller,
  Get,
  Inject,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import {
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  MinLength,
} from "class-validator";
import { AuthGuard } from "../auth/auth.guard";
import { AuthService } from "../auth/auth.service";
import type { AuthUser } from "../auth/auth.types";
import { SessionTraceService } from "./session-trace.service";

class AppendSessionTraceDto {
  @IsString()
  @MinLength(1)
  id!: string;

  @IsIn(["prompt", "agent"])
  role!: "prompt" | "agent";

  @IsString()
  @MinLength(1)
  text!: string;

  @IsString()
  @MinLength(1)
  at!: string;

  @IsOptional()
  @IsObject()
  details?: Record<string, unknown>;
}

@Controller("session/trace")
@UseGuards(AuthGuard)
export class SessionTraceController {
  constructor(
    @Inject(SessionTraceService) private readonly traces: SessionTraceService,
    @Inject(AuthService) private readonly auth: AuthService,
  ) {}

  /** Gabriel journal — durable pull (file-backed per tenant). */
  @Get()
  async list(@Req() req: { user: AuthUser }) {
    this.auth.requireTenant(req.user);
    const messages = await this.traces.list(req.user.tenantId!);
    return { messages, bridge: "file" as const };
  }

  /** Append one bubble (dedupe by id). */
  @Post()
  async append(
    @Body() body: AppendSessionTraceDto,
    @Req() req: { user: AuthUser },
  ) {
    this.auth.requireTenant(req.user);
    return this.traces.append(req.user.tenantId!, {
      id: body.id,
      role: body.role,
      text: body.text,
      at: body.at,
      details: body.details ?? {},
    });
  }
}
