import { Module } from "@nestjs/common";
import { MissionsService } from "./missions.service";
import { MissionsController } from "./missions.controller";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { AuthModule } from "../auth/auth.module";

@Module({
  imports: [AuthModule],
  controllers: [MissionsController],
  providers: [MissionsService, PrismaService, AuditService],
  exports: [MissionsService],
})
export class MissionsModule {}
