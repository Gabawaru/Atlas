import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { TicketsModule } from "../tickets/tickets.module";
import { SupportTrackingController } from "./support-tracking.controller";
import { SupportTrackingService } from "./support-tracking.service";

@Module({
  imports: [AuthModule, TicketsModule],
  controllers: [SupportTrackingController],
  providers: [SupportTrackingService],
  exports: [SupportTrackingService],
})
export class SupportTrackingModule {}
