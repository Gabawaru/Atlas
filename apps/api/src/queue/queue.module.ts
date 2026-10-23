import { Module } from "@nestjs/common";
import { ControlQueueService } from "./control-queue.service";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { VulnModule } from "../vuln/vuln.module";

@Module({
  imports: [VulnModule],
  providers: [ControlQueueService, PrismaService, AuditService],
  exports: [ControlQueueService],
})
export class QueueModule {}
