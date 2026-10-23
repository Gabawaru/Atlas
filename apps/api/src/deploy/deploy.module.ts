import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { AuditService } from "../audit/audit.service";
import { PrismaService } from "../prisma/prisma.service";
import { DeployController } from "./deploy.controller";
import { DeployService } from "./deploy.service";

@Module({
  imports: [AuthModule],
  controllers: [DeployController],
  providers: [DeployService, PrismaService, AuditService],
  exports: [DeployService],
})
export class DeployModule {}
