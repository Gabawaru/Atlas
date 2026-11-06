import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import type { AuthUser } from "../auth/auth.types";
import {
  CONNECTOR_CATALOG,
  getCatalogEntry,
} from "./connector.types";
import { DeployService } from "../deploy/deploy.service";

@Injectable()
export class ConnectorsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(DeployService) private readonly deploy: DeployService,
  ) {}

  catalog() {
    return CONNECTOR_CATALOG.map((c) => ({
      ...c,
      disclaimer: c.isStub
        ? "STUB / non production — ne pas traiter comme connecteur terminé"
        : undefined,
    }));
  }

  async listGrants(tenantId: string) {
    const grants = await this.prisma.connectorGrant.findMany({
      where: { tenantId },
      orderBy: { connectedAt: "desc" },
    });
    return grants.map((g) => ({
      ...g,
      catalog: getCatalogEntry(g.connectorId) ?? null,
    }));
  }

  /**
   * Connecte un connecteur du catalogue.
   * GitHub = mock OAuth uniquement ; web.passive = grant réel MVP.
   */
  async connect(user: AuthUser, connectorId: string) {
    if (!user.tenantId) throw new BadRequestException("tenant requis");
    const entry = getCatalogEntry(connectorId);
    if (!entry) throw new NotFoundException("Connecteur inconnu");

    const existing = await this.prisma.connectorGrant.findFirst({
      where: {
        tenantId: user.tenantId,
        connectorId,
        status: "active",
      },
    });
    if (existing) {
      return { grant: existing, catalog: entry, alreadyConnected: true };
    }

    let externalRef: string | null = null;
    if (connectorId === "github.read_only") {
      // Mock OAuth — pas de client_id GitHub réel
      externalRef = `mock-github-oauth:${randomUUID()}`;
    } else if (connectorId === "web.passive.presence") {
      externalRef = `web-passive-grant:${randomUUID()}`;
    } else if (
      connectorId === "asm.passive.enrichment" ||
      connectorId === "breach.hibp" ||
      connectorId === "ti.passive.enrichment" ||
      connectorId === "sca.local.analyzers" ||
      connectorId === "cloud.posture.auth"
    ) {
      externalRef = `${connectorId}-grant:${randomUUID()}`;
    }

    const grant = await this.prisma.connectorGrant.create({
      data: {
        tenantId: user.tenantId,
        connectorId,
        status: "active",
        grantedPermissions: entry.permissions,
        grantedScopes: entry.scopes,
        externalRef,
        isStub: entry.isStub,
        productionReady: entry.productionReady,
      },
    });

    await this.audit.append({
      tenantId: user.tenantId,
      actorId: user.userId,
      action: "connector.connected",
      objectType: "connector_grant",
      objectId: grant.id,
      payload: {
        connectorId,
        isStub: entry.isStub,
        productionReady: entry.productionReady,
        permissions: entry.permissions,
        scopes: entry.scopes,
        mockOAuth: connectorId === "github.read_only",
      },
    });

    return {
      grant,
      catalog: entry,
      alreadyConnected: false,
      warning: entry.isStub
        ? "Connecteur stub non production — aucune intégration GitHub réelle"
        : undefined,
    };
  }

  async revoke(user: AuthUser, grantId: string) {
    if (!user.tenantId) throw new BadRequestException("tenant requis");
    const grant = await this.prisma.connectorGrant.findFirst({
      where: { id: grantId, tenantId: user.tenantId },
    });
    if (!grant) throw new NotFoundException("Grant introuvable");
    if (grant.status === "revoked") {
      return { grant, alreadyRevoked: true };
    }

    const updated = await this.prisma.connectorGrant.update({
      where: { id: grantId },
      data: {
        status: "revoked",
        revokedAt: new Date(),
        // Invalide la réf mock OAuth
        externalRef: grant.externalRef
          ? `${grant.externalRef}:revoked`
          : null,
      },
    });

    await this.audit.append({
      tenantId: user.tenantId,
      actorId: user.userId,
      action: "connector.revoked",
      objectType: "connector_grant",
      objectId: grantId,
      payload: {
        connectorId: grant.connectorId,
        permissionsCut: grant.grantedPermissions,
      },
    });

    // Offline : pas de fausse confirmation distante — file de sync
    const sync = await this.deploy.recordRevokeIntent(
      user.tenantId,
      "revoke_connector",
      {
        grantId,
        connectorId: grant.connectorId,
        localApplied: true,
      },
      user.userId,
    );

    return {
      grant: updated,
      alreadyRevoked: false,
      deploySync: sync,
    };
  }

  async findActive(tenantId: string, connectorId: string) {
    return this.prisma.connectorGrant.findFirst({
      where: { tenantId, connectorId, status: "active" },
    });
  }

  /**
   * État pour Policy Guard : connecteur requis pour un module.
   */
  async guardStateForModule(tenantId: string, moduleId: string) {
    const entry = CONNECTOR_CATALOG.find((c) =>
      c.moduleIds.includes(moduleId),
    );
    if (!entry) {
      return {
        connectorRequired: false,
        connectorPresent: true,
        connectorActive: true,
      };
    }
    const grant = await this.findActive(tenantId, entry.id);
    const anyGrant = await this.prisma.connectorGrant.findFirst({
      where: { tenantId, connectorId: entry.id },
      orderBy: { connectedAt: "desc" },
    });
    return {
      connectorRequired: true,
      connectorPresent: !!anyGrant,
      connectorActive: !!grant && grant.status === "active",
      connectorId: entry.id,
      grantId: grant?.id,
    };
  }
}
