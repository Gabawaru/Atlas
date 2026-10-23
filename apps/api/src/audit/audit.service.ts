import { Inject, Injectable } from "@nestjs/common";
import { createHash } from "node:crypto";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class AuditService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /**
   * Append-only : aucune mise à jour / suppression exposée.
   */
  async append(event: {
    tenantId?: string | null;
    actorId?: string | null;
    action: string;
    objectType?: string;
    objectId?: string;
    payload?: unknown;
    requestId?: string;
  }) {
    const last = await this.prisma.auditEvent.findFirst({
      orderBy: { createdAt: "desc" },
      select: { hash: true },
    });
    const prevHash = last?.hash ?? "GENESIS";
    const body = JSON.stringify({
      prevHash,
      ...event,
      ts: new Date().toISOString(),
    });
    const hash = createHash("sha256").update(body).digest("hex");
    return this.prisma.auditEvent.create({
      data: {
        tenantId: event.tenantId ?? null,
        actorId: event.actorId ?? null,
        action: event.action,
        objectType: event.objectType,
        objectId: event.objectId,
        payload: event.payload as object | undefined,
        requestId: event.requestId,
        prevHash,
        hash,
      },
    });
  }
}
