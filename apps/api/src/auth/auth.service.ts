import {
  Inject,
  Injectable,
  UnauthorizedException,
  ForbiddenException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcryptjs";
import { PrismaService } from "../prisma/prisma.service";
import type { AuthUser } from "./auth.types";
import type { StaffRole, TenantRole } from "@atlas/shared";

@Injectable()
export class AuthService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(JwtService) private readonly jwt: JwtService,
  ) {}

  async validateLocal(email: string, password: string): Promise<AuthUser> {
    const user = await this.prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      include: {
        tenantMemberships: true,
        staffMemberships: true,
      },
    });
    if (!user || user.status !== "active") {
      throw new UnauthorizedException("Identifiants invalides");
    }
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      throw new UnauthorizedException("Identifiants invalides");
    }
    const membership = user.tenantMemberships[0];
    return {
      userId: user.id,
      email: user.email,
      displayName: user.displayName,
      tenantId: membership?.tenantId,
      tenantRole: membership?.role as TenantRole | undefined,
      staffRoles: user.staffMemberships.map((s) => s.staffRole as StaffRole),
      orgId: user.staffMemberships[0]?.orgId,
    };
  }

  async login(email: string, password: string) {
    const user = await this.validateLocal(email, password);
    const accessToken = await this.jwt.signAsync({
      sub: user.userId,
      email: user.email,
      tenantId: user.tenantId,
      tenantRole: user.tenantRole,
      staffRoles: user.staffRoles,
      orgId: user.orgId,
      displayName: user.displayName,
    });
    return { accessToken, user };
  }

  async userFromPayload(payload: Record<string, unknown>): Promise<AuthUser> {
    return {
      userId: String(payload.sub),
      email: String(payload.email),
      displayName: String(payload.displayName ?? ""),
      tenantId: payload.tenantId ? String(payload.tenantId) : undefined,
      tenantRole: payload.tenantRole as TenantRole | undefined,
      staffRoles: (payload.staffRoles as StaffRole[]) ?? [],
      orgId: payload.orgId ? String(payload.orgId) : undefined,
    };
  }

  requireStaff(user: AuthUser, roles: StaffRole[]) {
    if (!roles.some((r) => user.staffRoles.includes(r))) {
      throw new ForbiddenException(
        `Rôle staff requis: ${roles.join("|")} (séparation RBAC)`,
      );
    }
  }

  requireTenant(user: AuthUser, roles?: TenantRole[]) {
    if (!user.tenantId) {
      throw new ForbiddenException("Contexte tenant requis");
    }
    // Rôles demandés + membership absente → refuse (pas de skip silencieux).
    if (roles && roles.length > 0) {
      if (!user.tenantRole || !roles.includes(user.tenantRole)) {
        throw new ForbiddenException(`Rôle tenant requis: ${roles.join("|")}`);
      }
    }
  }
}

