import { Module } from "@nestjs/common";
import { ApprovalsService } from "./approvals.service";
import { ApprovalsController } from "./approvals.controller";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { MissionsModule } from "../missions/missions.module";
import { AuthModule } from "../auth/auth.module";

@Module({
  imports: [AuthModule, MissionsModule],
  controllers: [ApprovalsController],
  providers: [ApprovalsService, PrismaService, AuditService],
  exports: [ApprovalsService],
})
export class ApprovalsModule {}
