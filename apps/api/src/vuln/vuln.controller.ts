import { Controller, Get, Inject, Post, Query, Req, UseGuards } from "@nestjs/common";
import { AuthGuard } from "../auth/auth.guard";
import { AuthService } from "../auth/auth.service";
import type { AuthUser } from "../auth/auth.types";
import { VulnService } from "./vuln.service";

@Controller()
@UseGuards(AuthGuard)
export class VulnController {
  constructor(
    @Inject(VulnService) private readonly vuln: VulnService,
    @Inject(AuthService) private readonly auth: AuthService,
  ) {}

  @Get("vuln/feeds")
  feeds(@Req() req: { user: AuthUser }) {
    this.auth.requireTenant(req.user);
    return this.vuln.feedsStatus();
  }

  @Get("software-components")
  components(@Req() req: { user: AuthUser }) {
    this.auth.requireTenant(req.user);
    return this.vuln.listComponents(req.user.tenantId!);
  }

  @Post("vuln/match")
  match(
    @Req() req: { user: AuthUser },
    @Query("missionId") missionId?: string,
  ) {
    this.auth.requireTenant(req.user, ["owner", "operator"]);
    return this.vuln.matchTenantInventory(req.user.tenantId!, req.user.userId, {
      missionId,
    });
  }
}
