import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  MinLength,
} from "class-validator";
import { AuthGuard } from "../auth/auth.guard";
import { AuthService } from "../auth/auth.service";
import type { AuthUser } from "../auth/auth.types";
import { HierarchyService } from "./hierarchy.service";

class CreateNodeDto {
  @IsString()
  orgId!: string;

  @IsString()
  @MinLength(1)
  title!: string;

  @IsOptional()
  @IsString()
  parentId?: string;

  @IsOptional()
  @IsInt()
  sortOrder?: number;
}

class AssignDto {
  @IsString()
  userId!: string;

  @IsOptional()
  @IsBoolean()
  canApprove?: boolean;
}

class UpdateAssignmentDto {
  @IsBoolean()
  canApprove!: boolean;
}

class PublishRoutingDto {
  @IsString()
  orgId!: string;

  @IsOptional()
  @IsString()
  tenantId?: string;
}

@Controller("admin/hierarchy")
@UseGuards(AuthGuard)
export class HierarchyController {
  constructor(
    @Inject(HierarchyService) private readonly hierarchy: HierarchyService,
    @Inject(AuthService) private readonly auth: AuthService,
  ) {}

  private resolveOrgId(orgId: string | undefined, user: AuthUser): string {
    const id = orgId || user.orgId;
    if (!id) throw new BadRequestException("orgId requis");
    this.hierarchy.assertCallerOrg(user, id);
    return id;
  }

  @Get()
  getTree(@Query("orgId") orgId: string, @Req() req: { user: AuthUser }) {
    this.auth.requireStaff(req.user, ["admin", "ops", "approver"]);
    const id = this.resolveOrgId(orgId, req.user);
    return this.hierarchy.getTree(id);
  }

  @Get("staff")
  listStaff(@Query("orgId") orgId: string, @Req() req: { user: AuthUser }) {
    this.auth.requireStaff(req.user, ["admin", "ops"]);
    const id = this.resolveOrgId(orgId, req.user);
    return this.hierarchy.listStaffForOrg(id);
  }

  @Post("nodes")
  createNode(@Body() body: CreateNodeDto, @Req() req: { user: AuthUser }) {
    this.auth.requireStaff(req.user, ["admin"]);
    this.hierarchy.assertCallerOrg(req.user, body.orgId);
    return this.hierarchy.createNode(body);
  }

  @Delete("nodes/:id")
  async deleteNode(@Param("id") id: string, @Req() req: { user: AuthUser }) {
    this.auth.requireStaff(req.user, ["admin"]);
    await this.hierarchy.assertCallerOwnsNode(req.user, id);
    return this.hierarchy.deleteNode(id);
  }

  @Post("nodes/:id/assignments")
  async assign(
    @Param("id") nodeId: string,
    @Body() body: AssignDto,
    @Req() req: { user: AuthUser },
  ) {
    this.auth.requireStaff(req.user, ["admin"]);
    await this.hierarchy.assertCallerOwnsNode(req.user, nodeId);
    return this.hierarchy.assign({
      nodeId,
      userId: body.userId,
      canApprove: body.canApprove,
    });
  }

  @Patch("assignments/:id")
  async updateAssignment(
    @Param("id") id: string,
    @Body() body: UpdateAssignmentDto,
    @Req() req: { user: AuthUser },
  ) {
    this.auth.requireStaff(req.user, ["admin"]);
    await this.hierarchy.assertCallerOwnsAssignment(req.user, id);
    return this.hierarchy.updateAssignment(id, body.canApprove);
  }

  @Delete("assignments/:id")
  async unassign(@Param("id") id: string, @Req() req: { user: AuthUser }) {
    this.auth.requireStaff(req.user, ["admin"]);
    await this.hierarchy.assertCallerOwnsAssignment(req.user, id);
    return this.hierarchy.unassign(id);
  }

  /** Publie canApprove → StaffGroup stub (réutilise importStubHierarchy). */
  @Post("publish-routing")
  publish(
    @Body() body: PublishRoutingDto,
    @Req() req: { user: AuthUser },
  ) {
    this.auth.requireStaff(req.user, ["admin"]);
    this.hierarchy.assertCallerOrg(req.user, body.orgId);
    return this.hierarchy.publishRouting(body.orgId, body.tenantId);
  }
}
