import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import type { AuthUser } from "../auth/auth.types";

export const REMEDIATION_STATUSES = [
  "open",
  "in_progress",
  "fixed",
  "accepted_risk",
  "wont_fix",
  "retest_requested",
] as const;

export type RemediationStatus = (typeof REMEDIATION_STATUSES)[number];

@Injectable()
export class RemediationService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async listForTenant(tenantId: string) {
    return this.prisma.finding.findMany({
      where: { mission: { tenantId } },
      orderBy: { createdAt: "desc" },
      include: {
        mission: { select: { id: true, title: true, status: true, synthetic: true } },
      },
      take: 50,
    });
  }

  async update(
    findingId: string,
    user: AuthUser,
    body: { remediationStatus: RemediationStatus; remediationNote?: string },
  ) {
    if (!user.tenantId) throw new BadRequestException("tenant requis");
    if (!REMEDIATION_STATUSES.includes(body.remediationStatus)) {
      throw new BadRequestException("Statut remédiation invalide");
    }
    const finding = await this.prisma.finding.findFirst({
      where: { id: findingId, mission: { tenantId: user.tenantId } },
      include: { mission: true },
    });
    if (!finding) throw new NotFoundException("Finding introuvable");

    const updated = await this.prisma.finding.update({
      where: { id: findingId },
      data: {
        remediationStatus: body.remediationStatus,
        remediationNote: body.remediationNote ?? finding.remediationNote,
        remediatedAt: ["fixed", "accepted_risk", "wont_fix"].includes(
          body.remediationStatus,
        )
          ? new Date()
          : null,
      },
      include: {
        mission: { select: { id: true, title: true } },
      },
    });

    await this.audit.append({
      tenantId: user.tenantId,
      actorId: user.userId,
      action: "finding.remediation",
      objectType: "finding",
      objectId: findingId,
      payload: {
        from: finding.remediationStatus,
        to: body.remediationStatus,
        synthetic: finding.synthetic,
      },
    });

    return updated;
  }
}
