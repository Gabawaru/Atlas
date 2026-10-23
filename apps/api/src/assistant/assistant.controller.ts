import { Body, Controller, Get, Inject, Post, Req, UseGuards } from "@nestjs/common";
import { IsString, MinLength } from "class-validator";
import { AuthGuard } from "../auth/auth.guard";
import { AuthService } from "../auth/auth.service";
import type { AuthUser } from "../auth/auth.types";
import { AssistantService } from "./assistant.service";

class ChatDto {
  @IsString()
  @MinLength(1)
  message!: string;
}

@Controller()
@UseGuards(AuthGuard)
export class AssistantController {
  constructor(
    @Inject(AssistantService) private readonly assistant: AssistantService,
    @Inject(AuthService) private readonly auth: AuthService,
  ) {}

  @Post("conversation")
  chat(@Body() body: ChatDto, @Req() req: { user: AuthUser }) {
    this.auth.requireTenant(req.user);
    return this.assistant.chat(req.user, body.message);
  }

  @Get("ux-needs")
  uxNeeds(@Req() req: { user: AuthUser }) {
    this.auth.requireTenant(req.user);
    return this.assistant.suggestionsCatalog();
  }

  @Get("assistant/usage")
  usage(@Req() req: { user: AuthUser }) {
    this.auth.requireTenant(req.user);
    return this.assistant.usageStatus(req.user.tenantId!);
  }
}
