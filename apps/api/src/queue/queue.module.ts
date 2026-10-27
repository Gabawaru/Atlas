import { Module } from "@nestjs/common";
import { ControlQueueService } from "./control-queue.service";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { VulnModule } from "../vuln/vuln.module";
import { OpsModule } from "../ops/ops.module";
import { ConnectorsModule } from "../connectors/connectors.module";

@Module({
  imports: [VulnModule, OpsModule, ConnectorsModule],
  providers: [ControlQueueService, PrismaService, AuditService],
  exports: [ControlQueueService],
})
export class QueueModule {}
