import { Body, Controller, Get, Inject, Post, Req, UseGuards } from "@nestjs/common";
import { IsEmail, IsString, MinLength } from "class-validator";
import { AuthService } from "./auth.service";
import { AuthGuard } from "./auth.guard";
import type { AuthUser } from "./auth.types";

class LoginDto {
  @IsEmail({ require_tld: false })
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;
}

@Controller("auth")
export class AuthController {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}

  @Post("login")
  login(@Body() body: LoginDto) {
    return this.auth.login(body.email, body.password);
  }

  @Get("me")
  @UseGuards(AuthGuard)
  me(@Req() req: { user: AuthUser }) {
    return req.user;
  }
}
