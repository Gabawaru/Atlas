import { Inject, Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import {
  AUDIT_GENESIS,
  hashAuditEvent,
  verifyAuditChain,
} from "./audit-chain";

@Injectable()
export class AuditService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /**
   * Append-only : aucune méthode update/delete exposée.
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
    const tip = await this.prisma.auditEvent.findFirst({
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: { hash: true },
    });
    const prevHash = tip?.hash ?? AUDIT_GENESIS;
    const hash = hashAuditEvent({
      prevHash,
      tenantId: event.tenantId ?? null,
      actorId: event.actorId ?? null,
      action: event.action,
      objectType: event.objectType ?? null,
      objectId: event.objectId ?? null,
      payload: event.payload ?? null,
      requestId: event.requestId ?? null,
    });
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

  async verifyChain() {
    const events = await this.prisma.auditEvent.findMany({
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    return verifyAuditChain(events);
  }
}
