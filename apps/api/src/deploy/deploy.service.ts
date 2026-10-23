import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import {
  canExecuteOffline,
  DEPLOY_COMPONENT_MAP,
  getDeployRuntime,
  remoteRevokeWhileOffline,
  type DeployRuntime,
} from "./deploy.config";

export type RevokeKind = "revoke_connector" | "revoke_token" | "revoke_scope";

@Injectable()
export class DeployService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  runtime(): DeployRuntime & {
    componentMap: typeof DEPLOY_COMPONENT_MAP;
    disclaimer: string;
  } {
    const r = getDeployRuntime();
    return {
      ...r,
      componentMap: DEPLOY_COMPONENT_MAP,
      disclaimer:
        "Offline : pas de fausse révocation distante instantanée ; les journaux se synchronisent au retour online.",
    };
  }

  /**
   * Garde exécution selon mode + offlineité.
   * `hasValidLocalToken` = jeton déjà présent et non révoqué côté nœud local.
   */
  assertExecutionAllowed(hasValidLocalToken: boolean) {
    const r = getDeployRuntime();
    const gate = canExecuteOffline(r, hasValidLocalToken);
    if (!gate.allow) {
      throw new BadRequestException({
        code: gate.code,
        message: gate.reason,
        deploy: { mode: r.mode, connectivity: r.connectivity },
      });
    }
    return { runtime: r, gate };
  }

  /**
   * Après une révocation locale éventuelle : si offline, enfile pour sync distante.
   * Ne revendique jamais remoteConfirmed=true offline.
   */
  async recordRevokeIntent(
    tenantId: string,
    kind: RevokeKind,
    payload: Record<string, unknown>,
    actorId?: string,
  ) {
    const r = getDeployRuntime();
    const remote = remoteRevokeWhileOffline(r);

    if (!remote.mustQueue) {
      await this.audit.append({
        tenantId,
        actorId,
        action: `${kind}.applied`,
        objectType: "deploy",
        payload: {
          ...payload,
          remoteConfirmed: true,
          connectivity: r.connectivity,
          mode: r.mode,
        },
      });
      return {
        localApplied: true,
        remoteConfirmed: true as const,
        syncStatus: "n/a" as const,
        message: remote.message,
        mode: r.mode,
        connectivity: r.connectivity,
      };
    }

    const entry = await this.prisma.syncJournalEntry.create({
      data: {
        tenantId,
        kind,
        payload: {
          ...payload,
          queuedAt: new Date().toISOString(),
          note: remote.message,
        },
        status: "pending",
      },
    });

    await this.audit.append({
      tenantId,
      actorId,
      action: `${kind}.queued_offline`,
      objectType: "sync_journal",
      objectId: entry.id,
      payload: {
        kind,
        remoteConfirmed: false,
        syncStatus: "pending",
        mode: r.mode,
        // pas de secret
      },
    });

    return {
      localApplied: Boolean(payload.localApplied),
      remoteConfirmed: false as const,
      syncStatus: "pending" as const,
      journalId: entry.id,
      message: remote.message,
      mode: r.mode,
      connectivity: r.connectivity,
    };
  }

  listPending(tenantId: string) {
    return this.prisma.syncJournalEntry.findMany({
      where: { tenantId, status: "pending" },
      orderBy: { createdAt: "asc" },
      take: 100,
    });
  }

  /**
   * Drain du journal au retour online — simule sync contrôle plane.
   * Refuse si toujours offline.
   */
  async syncNow(tenantId: string, actorId?: string) {
    const r = getDeployRuntime();
    if (r.offline) {
      throw new BadRequestException({
        code: "STILL_OFFLINE",
        message:
          "Toujours offline (ATLAS_OFFLINE=true) — impossible de synchroniser les journaux maintenant.",
      });
    }

    const pending = await this.listPending(tenantId);
    let synced = 0;
    for (const row of pending) {
      await this.prisma.syncJournalEntry.update({
        where: { id: row.id },
        data: { status: "synced", syncedAt: new Date(), error: null },
      });
      synced += 1;
    }

    await this.audit.append({
      tenantId,
      actorId,
      action: "deploy.sync",
      objectType: "sync_journal",
      payload: { synced, mode: r.mode, connectivity: r.connectivity },
    });

    return {
      synced,
      remaining: 0,
      mode: r.mode,
      connectivity: r.connectivity,
      message:
        synced > 0
          ? `${synced} entrée(s) de journal synchronisée(s) vers le contrôle plane.`
          : "Rien à synchroniser.",
    };
  }
}
