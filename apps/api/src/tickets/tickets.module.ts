import { Module } from "@nestjs/common";
import { TicketsController } from "./tickets.controller";
import { SupportHandoffController } from "./support-handoff.controller";
import { TicketsService } from "./tickets.service";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { AuthModule } from "../auth/auth.module";

@Module({
  imports: [AuthModule],
  controllers: [TicketsController, SupportHandoffController],
  providers: [TicketsService, PrismaService, AuditService],
  exports: [TicketsService],
})
export class TicketsModule {}
