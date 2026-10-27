import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { AuthService } from "./auth.service";
import { AuthController } from "./auth.controller";
import { AuthGuard } from "./auth.guard";
import { PrismaService } from "../prisma/prisma.service";
import { resolveJwtSecret } from "./jwt-secret";

@Module({
  imports: [
    JwtModule.register({
      global: true,
      secret: resolveJwtSecret(),
      // Access court : rôles rechargés à chaque requête via userFromPayload (DB).
      // Sans refresh OIDC, 1h borne le blast si DB reload échoue.
      signOptions: { expiresIn: "1h" },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, AuthGuard, PrismaService],
  exports: [AuthService, AuthGuard],
})
export class AuthModule {}
