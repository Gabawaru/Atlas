import { Module } from "@nestjs/common";
import { HierarchyController } from "./hierarchy.controller";
import { HierarchyService } from "./hierarchy.service";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { ApprovalsModule } from "../approvals/approvals.module";
import { AuthModule } from "../auth/auth.module";

@Module({
  imports: [AuthModule, ApprovalsModule],
  controllers: [HierarchyController],
  providers: [HierarchyService, PrismaService, AuditService],
  exports: [HierarchyService],
})
export class HierarchyModule {}
