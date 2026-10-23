import { Body, Controller, Get, Inject, Post, Req, UseGuards } from "@nestjs/common";
import { IsBoolean, IsIn, IsOptional, IsString, MinLength } from "class-validator";
import { AuthGuard } from "../auth/auth.guard";
import { AuthService } from "../auth/auth.service";
import type { AuthUser } from "../auth/auth.types";
import { PrismaService } from "../prisma/prisma.service";

class CreateAssetDto {
  @IsIn(["domain", "url", "host"])
  type!: "domain" | "url" | "host";

  @IsString()
  @MinLength(3)
  value!: string;

  @IsOptional()
  @IsBoolean()
  synthetic?: boolean;
}

function normalizeAsset(type: string, value: string): string {
  const v = value.trim().toLowerCase();
  if (type === "url") {
    try {
      return new URL(v).hostname;
    } catch {
      return v;
    }
  }
  return v.replace(/^https?:\/\//, "").replace(/\/$/, "");
}

@Controller("assets")
@UseGuards(AuthGuard)
export class AssetsController {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuthService) private readonly auth: AuthService,
  ) {}

  @Get()
  list(@Req() req: { user: AuthUser }) {
    this.auth.requireTenant(req.user);
    return this.prisma.asset.findMany({
      where: { tenantId: req.user.tenantId },
      orderBy: { createdAt: "desc" },
    });
  }

  @Post()
  create(@Body() body: CreateAssetDto, @Req() req: { user: AuthUser }) {
    this.auth.requireTenant(req.user, ["owner", "operator"]);
    const normalized = normalizeAsset(body.type, body.value);
    return this.prisma.asset.create({
      data: {
        tenantId: req.user.tenantId!,
        type: body.type,
        value: body.value,
        normalized,
        verified: false,
        synthetic: body.synthetic ?? true,
      },
    });
  }
}
