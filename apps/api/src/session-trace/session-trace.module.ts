import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { SessionTraceController } from "./session-trace.controller";
import { SessionTraceService } from "./session-trace.service";

@Module({
  imports: [AuthModule],
  controllers: [SessionTraceController],
  providers: [SessionTraceService],
  exports: [SessionTraceService],
})
export class SessionTraceModule {}
