import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { AuditService } from "../audit/audit.service";
import { PrismaService } from "../prisma/prisma.service";
import { RetentionController } from "./retention.controller";
import { RetentionService } from "./retention.service";

@Module({
  imports: [AuthModule],
  controllers: [RetentionController],
  providers: [RetentionService, PrismaService, AuditService],
  exports: [RetentionService],
})
export class RetentionModule {}
