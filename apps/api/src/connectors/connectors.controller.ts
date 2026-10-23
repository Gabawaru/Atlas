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
import { IsString } from "class-validator";
import { AuthGuard } from "../auth/auth.guard";
import { AuthService } from "../auth/auth.service";
import type { AuthUser } from "../auth/auth.types";
import { ConnectorsService } from "./connectors.service";

class ConnectDto {
  @IsString()
  connectorId!: string;
}

@Controller("connectors")
@UseGuards(AuthGuard)
export class ConnectorsController {
  constructor(
    @Inject(ConnectorsService) private readonly connectors: ConnectorsService,
    @Inject(AuthService) private readonly auth: AuthService,
  ) {}

  @Get("catalog")
  catalog() {
    return this.connectors.catalog();
  }

  @Get()
  list(@Req() req: { user: AuthUser }) {
    this.auth.requireTenant(req.user);
    return this.connectors.listGrants(req.user.tenantId!);
  }

  @Post("connect")
  connect(@Body() body: ConnectDto, @Req() req: { user: AuthUser }) {
    this.auth.requireTenant(req.user, ["owner", "operator"]);
    return this.connectors.connect(req.user, body.connectorId);
  }

  @Post(":grantId/revoke")
  revoke(@Param("grantId") grantId: string, @Req() req: { user: AuthUser }) {
    this.auth.requireTenant(req.user, ["owner", "operator"]);
    return this.connectors.revoke(req.user, grantId);
  }
}
