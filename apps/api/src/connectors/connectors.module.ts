import { Module } from "@nestjs/common";
import { ConnectorsService } from "./connectors.service";
import { ConnectorsController } from "./connectors.controller";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { AuthModule } from "../auth/auth.module";
import { DeployModule } from "../deploy/deploy.module";

@Module({
  imports: [AuthModule, DeployModule],
  controllers: [ConnectorsController],
  providers: [ConnectorsService, PrismaService, AuditService],
  exports: [ConnectorsService],
})
export class ConnectorsModule {}
