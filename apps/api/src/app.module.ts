import { Module } from "@nestjs/common";
import { AuthModule } from "./auth/auth.module";
import { MissionsModule } from "./missions/missions.module";
import { ApprovalsModule } from "./approvals/approvals.module";
import { HierarchyModule } from "./hierarchy/hierarchy.module";
import { AssetsModule } from "./assets/assets.module";
import { QueueModule } from "./queue/queue.module";
import { SignaturesModule } from "./signatures/signatures.module";
import { MailModule } from "./mail/mail.module";
import { ConnectorsModule } from "./connectors/connectors.module";
import { TicketsModule } from "./tickets/tickets.module";
import { SupportTrackingModule } from "./support-tracking/support-tracking.module";
import { RemediationModule } from "./remediation/remediation.module";
import { VulnModule } from "./vuln/vuln.module";
import { AssistantModule } from "./assistant/assistant.module";
import { DeployModule } from "./deploy/deploy.module";
import { RetentionModule } from "./retention/retention.module";
import { BillingModule } from "./billing/billing.module";
import { OpsModule } from "./ops/ops.module";
import { SessionTraceModule } from "./session-trace/session-trace.module";
import { HealthController } from "./health.controller";
import { PrismaService } from "./prisma/prisma.service";

@Module({
  imports: [
    AuthModule,
    SignaturesModule,
    MailModule,
    QueueModule,
    ConnectorsModule,
    MissionsModule,
    ApprovalsModule,
    HierarchyModule,
    AssetsModule,
    TicketsModule,
    SupportTrackingModule,
    RemediationModule,
    VulnModule,
    AssistantModule,
    DeployModule,
    RetentionModule,
    BillingModule,
    OpsModule,
    SessionTraceModule,
  ],
  controllers: [HealthController],
  providers: [PrismaService],
})
export class AppModule {}

