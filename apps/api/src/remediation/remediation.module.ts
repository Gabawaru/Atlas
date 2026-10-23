import { Module } from "@nestjs/common";
import { RemediationController } from "./remediation.controller";
import { RemediationService } from "./remediation.service";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { AuthModule } from "../auth/auth.module";

@Module({
  imports: [AuthModule],
  controllers: [RemediationController],
  providers: [RemediationService, PrismaService, AuditService],
})
export class RemediationModule {}
