import { Body, Controller, Inject, Post, Req, UseGuards } from "@nestjs/common";
import {
  IsArray,
  IsOptional,
  IsString,
  MinLength,
} from "class-validator";
import { AuthGuard } from "../auth/auth.guard";
import { AuthService } from "../auth/auth.service";
import type { AuthUser } from "../auth/auth.types";
import { TicketsService } from "./tickets.service";

class SupportHandoffDto {
  @IsString()
  @MinLength(20)
  reportMarkdown!: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  fingerprints?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  shortIds?: string[];

  @IsOptional()
  @IsString()
  subject?: string;

  @IsOptional()
  @IsString()
  missionId?: string;
}

/**
 * Egress volontaire client → Pragma.
 * Historique vuln reste local ; cet endpoint est le seul envoi findings client.
 */
@Controller("support")
@UseGuards(AuthGuard)
export class SupportHandoffController {
  constructor(
    @Inject(TicketsService) private readonly tickets: TicketsService,
    @Inject(AuthService) private readonly auth: AuthService,
  ) {}

  @Post("handoff")
  handoff(@Body() body: SupportHandoffDto, @Req() req: { user: AuthUser }) {
    this.auth.requireTenant(req.user, ["owner", "operator"]);
    return this.tickets.requestPragmaHandoff(req.user, body);
  }
}
