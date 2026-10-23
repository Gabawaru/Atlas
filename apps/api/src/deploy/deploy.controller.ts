import { Controller, Get, Inject, Post, Req, UseGuards } from "@nestjs/common";
import { AuthGuard } from "../auth/auth.guard";
import { AuthService } from "../auth/auth.service";
import type { AuthUser } from "../auth/auth.types";
import { DeployService } from "./deploy.service";

@Controller("deploy")
export class DeployController {
  constructor(
    @Inject(DeployService) private readonly deploy: DeployService,
    @Inject(AuthService) private readonly auth: AuthService,
  ) {}

  /** Public (health-like) : mode + matrice — pas de secret */
  @Get("mode")
  mode() {
    return this.deploy.runtime();
  }

  @Get("sync/pending")
  @UseGuards(AuthGuard)
  pending(@Req() req: { user: AuthUser }) {
    this.auth.requireTenant(req.user);
    return this.deploy.listPending(req.user.tenantId!);
  }

  @Post("sync")
  @UseGuards(AuthGuard)
  sync(@Req() req: { user: AuthUser }) {
    this.auth.requireTenant(req.user, ["owner", "operator"]);
    return this.deploy.syncNow(req.user.tenantId!, req.user.userId);
  }
}
