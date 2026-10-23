import { Module } from "@nestjs/common";
import { ControlQueueService } from "./control-queue.service";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";

@Module({
  providers: [ControlQueueService, PrismaService, AuditService],
  exports: [ControlQueueService],
})
export class QueueModule {}
