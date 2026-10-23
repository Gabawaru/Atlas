import { Module } from "@nestjs/common";
import { AuthModule } from "./auth/auth.module";
import { MissionsModule } from "./missions/missions.module";
import { ApprovalsModule } from "./approvals/approvals.module";
import { AssetsModule } from "./assets/assets.module";
import { HealthController } from "./health.controller";
import { PrismaService } from "./prisma/prisma.service";

@Module({
  imports: [AuthModule, MissionsModule, ApprovalsModule, AssetsModule],
  controllers: [HealthController],
  providers: [PrismaService],
})
export class AppModule {}
