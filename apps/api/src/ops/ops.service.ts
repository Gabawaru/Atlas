import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import type { AuthUser } from "../auth/auth.types";

const CONFIG_ID = "default";

@Injectable()
export class OpsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async ensureConfig() {
    return this.prisma.opsRuntimeConfig.upsert({
      where: { id: CONFIG_ID },
      create: { id: CONFIG_ID, maintenanceMode: false },
      update: {},
    });
  }

  async status() {
    const config = await this.ensureConfig();
    const current = await this.prisma.productVersion.findFirst({
      where: { current: true },
      orderBy: { releasedAt: "desc" },
    });
    return {
      principle:
        "Mode maintenance = kill-switch ops global. Bloque toute nouvelle exécution via Policy Guard (POLICY_DENY). Ne remplace pas RoE / owner auth.",
      maintenanceMode: config.maintenanceMode,
      maintenanceReason: config.maintenanceReason,
      maintenanceSetAt: config.maintenanceSetAt,
      currentVersion: current
        ? {
            version: current.version,
            title: current.title,
            channel: current.channel,
            releasedAt: current.releasedAt,
          }
        : null,
    };
  }

  /** Lecture rapide pour Policy Guard — true = bloquer exécution. */
  async isMaintenanceOn(): Promise<boolean> {
    const config = await this.prisma.opsRuntimeConfig.findUnique({
      where: { id: CONFIG_ID },
    });
    return config?.maintenanceMode === true;
  }

  async listVersions() {
    return this.prisma.productVersion.findMany({
      orderBy: { releasedAt: "desc" },
    });
  }

  async publishVersion(
    input: {
      version: string;
      title: string;
      releaseNotes: string;
      channel?: string;
      setCurrent?: boolean;
    },
    actor: AuthUser,
  ) {
    const version = input.version.trim();
    if (!version) throw new BadRequestException("version requise");
    const existing = await this.prisma.productVersion.findUnique({
      where: { version },
    });
    if (existing) {
      throw new BadRequestException(`Version déjà publiée: ${version}`);
    }
    const setCurrent = input.setCurrent !== false;
    if (setCurrent) {
      await this.prisma.productVersion.updateMany({
        data: { current: false },
        where: { current: true },
      });
    }
    const created = await this.prisma.productVersion.create({
      data: {
        version,
        title: input.title,
        releaseNotes: input.releaseNotes,
        channel: input.channel ?? "stable",
        current: setCurrent,
      },
    });
    await this.appendJournal({
      kind: "version_published",
      message: `Version ${version} publiée — ${input.title}`,
      actorId: actor.userId,
      payload: { version, current: setCurrent },
    });
    await this.audit.append({
      actorId: actor.userId,
      action: "ops.version.published",
      objectType: "product_version",
      objectId: created.id,
      payload: { version, setCurrent },
    });
    return created;
  }

  async setMaintenance(
    input: { active: boolean; reason?: string },
    actor: AuthUser,
  ) {
    const now = new Date();
    const config = await this.prisma.opsRuntimeConfig.upsert({
      where: { id: CONFIG_ID },
      create: {
        id: CONFIG_ID,
        maintenanceMode: input.active,
        maintenanceReason: input.active
          ? (input.reason ?? "Maintenance ops")
          : null,
        maintenanceSetAt: input.active ? now : null,
        maintenanceSetBy: input.active ? actor.userId : null,
      },
      update: {
        maintenanceMode: input.active,
        maintenanceReason: input.active
          ? (input.reason ?? "Maintenance ops")
          : null,
        maintenanceSetAt: input.active ? now : null,
        maintenanceSetBy: input.active ? actor.userId : null,
      },
    });
    await this.appendJournal({
      kind: input.active ? "maintenance_on" : "maintenance_off",
      message: input.active
        ? `Maintenance ON — ${config.maintenanceReason}`
        : "Maintenance OFF — exécutions à nouveau soumises au Policy Guard habituel",
      actorId: actor.userId,
      payload: {
        reason: config.maintenanceReason,
        blocksExecution: input.active,
      },
    });
    await this.audit.append({
      actorId: actor.userId,
      action: input.active ? "ops.maintenance.on" : "ops.maintenance.off",
      objectType: "ops_runtime_config",
      objectId: CONFIG_ID,
      payload: {
        maintenanceMode: input.active,
        reason: config.maintenanceReason,
        note: "killSwitch Policy Guard — ne crée/retire aucune autorisation pentest",
      },
    });
    return this.status();
  }

  async listJournal(limit = 40) {
    return this.prisma.opsJournalEntry.findMany({
      orderBy: { createdAt: "desc" },
      take: Math.min(100, Math.max(1, limit)),
    });
  }

  async addNote(message: string, actor: AuthUser) {
    if (!message?.trim()) throw new BadRequestException("message requis");
    return this.appendJournal({
      kind: "note",
      message: message.trim(),
      actorId: actor.userId,
    });
  }

  async currentVersionLabel(): Promise<string> {
    const current = await this.prisma.productVersion.findFirst({
      where: { current: true },
    });
    return current?.version ?? "0.1.0-mvp";
  }

  private async appendJournal(input: {
    kind: string;
    message: string;
    actorId?: string;
    payload?: Prisma.InputJsonValue;
  }) {
    return this.prisma.opsJournalEntry.create({
      data: {
        kind: input.kind,
        message: input.message,
        actorId: input.actorId,
        payload: input.payload ?? undefined,
      },
    });
  }
}
