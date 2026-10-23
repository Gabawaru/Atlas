import { Module } from "@nestjs/common";
import { AssetsController } from "./assets.controller";
import { PrismaService } from "../prisma/prisma.service";
import { AuthModule } from "../auth/auth.module";

@Module({
  imports: [AuthModule],
  controllers: [AssetsController],
  providers: [PrismaService],
})
export class AssetsModule {}
