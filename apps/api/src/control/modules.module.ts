import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { ModulesController } from "./modules.controller";

@Module({
  imports: [AuthModule],
  controllers: [ModulesController],
})
export class ModulesModule {}
