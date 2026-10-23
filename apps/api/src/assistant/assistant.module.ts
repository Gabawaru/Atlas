import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { AuditService } from "../audit/audit.service";
import { PrismaService } from "../prisma/prisma.service";
import { AssistantController } from "./assistant.controller";
import { AssistantService } from "./assistant.service";

@Module({
  imports: [AuthModule],
  controllers: [AssistantController],
  providers: [AssistantService, PrismaService, AuditService],
  exports: [AssistantService],
})
export class AssistantModule {}
