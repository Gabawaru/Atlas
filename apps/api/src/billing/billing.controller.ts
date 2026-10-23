import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Min,
} from "class-validator";
import { AuthGuard } from "../auth/auth.guard";
import { AuthService } from "../auth/auth.service";
import type { AuthUser } from "../auth/auth.types";
import { BillingService } from "./billing.service";

class ActivateDto {
  @IsString()
  tenantId!: string;

  @IsString()
  planCode!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  durationDays?: number;

  @IsOptional()
  @IsIn(["trialing", "active"])
  status?: "trialing" | "active";
}

class PaymentStubDto {
  @IsInt()
  @Min(0)
  amountCents!: number;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsIn(["recorded", "simulated_success", "simulated_failure"])
  outcome?: "recorded" | "simulated_success" | "simulated_failure";

  @IsOptional()
  @IsString()
  note?: string;
}

@Controller("admin/billing")
@UseGuards(AuthGuard)
export class BillingController {
  constructor(
    @Inject(BillingService) private readonly billing: BillingService,
    @Inject(AuthService) private readonly auth: AuthService,
  ) {}

  @Get("principle")
  principle(@Req() req: { user: AuthUser }) {
    this.auth.requireStaff(req.user, ["billing", "admin", "ops"]);
    return this.billing.principle();
  }

  @Get("plans")
  plans(@Req() req: { user: AuthUser }) {
    this.auth.requireStaff(req.user, ["billing", "admin", "ops"]);
    return this.billing.listPlans();
  }

  @Get("tenants")
  tenants(@Req() req: { user: AuthUser }) {
    this.auth.requireStaff(req.user, ["billing", "admin", "ops"]);
    return this.billing.listTenantsCommercial();
  }

  /** Données commerciales uniquement — pas de RoE / jetons / findings. */
  @Get("subscriptions")
  subscriptions(@Req() req: { user: AuthUser }) {
    this.auth.requireStaff(req.user, ["billing", "admin", "ops"]);
    return this.billing.listSubscriptionsCommercial();
  }

  @Post("subscriptions/activate")
  activate(@Body() body: ActivateDto, @Req() req: { user: AuthUser }) {
    this.auth.requireStaff(req.user, ["billing", "admin"]);
    return this.billing.activate(body, req.user);
  }

  @Post("subscriptions/:id/expire")
  expire(@Param("id") id: string, @Req() req: { user: AuthUser }) {
    this.auth.requireStaff(req.user, ["billing", "admin"]);
    return this.billing.expire(id, req.user);
  }

  @Post("subscriptions/:id/payment-stub")
  paymentStub(
    @Param("id") id: string,
    @Body() body: PaymentStubDto,
    @Req() req: { user: AuthUser },
  ) {
    this.auth.requireStaff(req.user, ["billing", "admin"]);
    return this.billing.recordPaymentStub(id, body, req.user);
  }
}
