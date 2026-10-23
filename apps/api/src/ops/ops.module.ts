import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { AuditService } from "../audit/audit.service";
import { PrismaService } from "../prisma/prisma.service";
import { OpsController } from "./ops.controller";
import { OpsService } from "./ops.service";

@Module({
  imports: [AuthModule],
  controllers: [OpsController],
  providers: [OpsService, PrismaService, AuditService],
  exports: [OpsService],
})
export class OpsModule {}
