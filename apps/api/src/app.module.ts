import { Module } from "@nestjs/common";
import { AuthModule } from "./auth/auth.module";
import { MissionsModule } from "./missions/missions.module";
import { ApprovalsModule } from "./approvals/approvals.module";
import { AssetsModule } from "./assets/assets.module";
import { QueueModule } from "./queue/queue.module";
import { SignaturesModule } from "./signatures/signatures.module";
import { ConnectorsModule } from "./connectors/connectors.module";
import { TicketsModule } from "./tickets/tickets.module";
import { RemediationModule } from "./remediation/remediation.module";
import { VulnModule } from "./vuln/vuln.module";
import { HealthController } from "./health.controller";
import { PrismaService } from "./prisma/prisma.service";

@Module({
  imports: [
    AuthModule,
    SignaturesModule,
    QueueModule,
    ConnectorsModule,
    MissionsModule,
    ApprovalsModule,
    AssetsModule,
    TicketsModule,
    RemediationModule,
    VulnModule,
  ],
  controllers: [HealthController],
  providers: [PrismaService],
})
export class AppModule {}

