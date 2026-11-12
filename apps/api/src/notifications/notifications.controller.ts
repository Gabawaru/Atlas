import {
  Body,
  Controller,
  Get,
  Headers,
  Inject,
  Param,
  Post,
  Req,
  UnauthorizedException,
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
import { NotificationsService } from "./notifications.service";

class CreateGabNotificationDto {
  @IsOptional()
  @IsString()
  id?: string;

  @IsOptional()
  @IsString()
  at?: string;

  @IsOptional()
  @IsString()
  title?: string;

  @IsString()
  @MinLength(1)
  verdict!: string;

  @IsString()
  @MinLength(1)
  faits!: string;

  @IsString()
  @MinLength(1)
  bloquants!: string;

  @IsOptional()
  @IsString()
  next?: string;

  @IsOptional()
  @IsBoolean()
  needsBen?: boolean;

  @IsOptional()
  @IsBoolean()
  read?: boolean;
}

/**
 * Dev default when ATLAS_GAB_NOTIFY_TOKEN unset — local Gab smoke only.
 * Production / hosted must set ATLAS_GAB_NOTIFY_TOKEN.
 */
function expectedGabToken(): string {
  const fromEnv = process.env.ATLAS_GAB_NOTIFY_TOKEN?.trim();
  if (fromEnv) return fromEnv;
  const env = (process.env.ATLAS_ENV ?? "").toLowerCase();
  if (env === "development" || env === "test" || env === "ci") {
    return "dev-gab-notify";
  }
  return "";
}

function acceptGabIngest(gabHeader: string | undefined): boolean {
  const expected = expectedGabToken();
  return Boolean(expected) && gabHeader?.trim() === expected;
}

@Controller("notifications")
export class NotificationsController {
  constructor(
    @Inject(NotificationsService)
    private readonly notifications: NotificationsService,
    @Inject(AuthService) private readonly auth: AuthService,
  ) {}

  /** Ben session UI — list latest Gab updates (newest last in store; UI reverses). */
  @Get()
  @UseGuards(AuthGuard)
  async list(@Req() req: { user: AuthUser }) {
    this.auth.requireTenant(req.user);
    const items = await this.notifications.list();
    const unread = items.filter((n) => !n.read).length;
    return {
      items: [...items].reverse(),
      unread,
      bridge: "file" as const,
    };
  }

  @Get(":id")
  @UseGuards(AuthGuard)
  async getOne(
    @Param("id") id: string,
    @Req() req: { user: AuthUser },
  ) {
    this.auth.requireTenant(req.user);
    return this.notifications.get(id);
  }

  /** Mark read when Ben opens detail. */
  @Post(":id/read")
  @UseGuards(AuthGuard)
  async markRead(
    @Param("id") id: string,
    @Req() req: { user: AuthUser },
  ) {
    this.auth.requireTenant(req.user);
    return this.notifications.markRead(id);
  }

  /**
   * Gab ingest — X-Atlas-Gab-Token must match ATLAS_GAB_NOTIFY_TOKEN
   * (dev/ci default: `dev-gab-notify`). No personal email; product UI only.
   */
  @Post()
  async create(
    @Body() body: CreateGabNotificationDto,
    @Headers("x-atlas-gab-token") gabToken?: string,
  ) {
    if (!acceptGabIngest(gabToken)) {
      throw new UnauthorizedException(
        "X-Atlas-Gab-Token requis pour POST /v1/notifications",
      );
    }
    return this.notifications.create(body);
  }
}
