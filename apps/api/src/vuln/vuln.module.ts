import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { AuditService } from "../audit/audit.service";
import { PrismaService } from "../prisma/prisma.service";
import { VulnController } from "./vuln.controller";
import { VulnService } from "./vuln.service";

@Module({
  imports: [AuthModule],
  controllers: [VulnController],
  providers: [VulnService, PrismaService, AuditService],
  exports: [VulnService],
})
export class VulnModule {}
