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

  /**
   * JWT authentifie l'identité ; rôles / tenant / org / status viennent de la DB.
   * Fail-closed si user absent ou inactif (révocation membership sans attendre l'expiry 12h).
   */
  async userFromPayload(payload: Record<string, unknown>): Promise<AuthUser> {
    const userId = String(payload.sub ?? "");
    if (!userId) {
      throw new UnauthorizedException("Token sans sujet");
    }
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        tenantMemberships: true,
        staffMemberships: true,
      },
    });
    if (!user || user.status !== "active") {
      throw new UnauthorizedException("Utilisateur inactif ou introuvable");
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

