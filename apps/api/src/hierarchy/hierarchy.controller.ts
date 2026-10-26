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
  ValidateIf,
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

class UpdateNodeDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  title?: string;

  /** null = racine */
  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined)
  @IsString()
  parentId?: string | null;

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

  @Get()
  getTree(@Query("orgId") orgId: string, @Req() req: { user: AuthUser }) {
    this.auth.requireStaff(req.user, ["admin", "ops", "approver"]);
    const id = orgId || req.user.orgId;
    if (!id) throw new BadRequestException("orgId requis");
    return this.hierarchy.getTree(id);
  }

  @Get("staff")
  listStaff(@Query("orgId") orgId: string, @Req() req: { user: AuthUser }) {
    this.auth.requireStaff(req.user, ["admin", "ops"]);
    const id = orgId || req.user.orgId;
    if (!id) throw new BadRequestException("orgId requis");
    return this.hierarchy.listStaffForOrg(id);
  }

  @Post("nodes")
  createNode(@Body() body: CreateNodeDto, @Req() req: { user: AuthUser }) {
    this.auth.requireStaff(req.user, ["admin"]);
    return this.hierarchy.createNode(body);
  }

  @Patch("nodes/:id")
  updateNode(
    @Param("id") id: string,
    @Body() body: UpdateNodeDto,
    @Req() req: { user: AuthUser },
  ) {
    this.auth.requireStaff(req.user, ["admin"]);
    return this.hierarchy.updateNode(id, body);
  }

  @Delete("nodes/:id")
  deleteNode(@Param("id") id: string, @Req() req: { user: AuthUser }) {
    this.auth.requireStaff(req.user, ["admin"]);
    return this.hierarchy.deleteNode(id);
  }

  @Post("nodes/:id/assignments")
  assign(
    @Param("id") nodeId: string,
    @Body() body: AssignDto,
    @Req() req: { user: AuthUser },
  ) {
    this.auth.requireStaff(req.user, ["admin"]);
    return this.hierarchy.assign({
      nodeId,
      userId: body.userId,
      canApprove: body.canApprove,
    });
  }

  @Patch("assignments/:id")
  updateAssignment(
    @Param("id") id: string,
    @Body() body: UpdateAssignmentDto,
    @Req() req: { user: AuthUser },
  ) {
    this.auth.requireStaff(req.user, ["admin"]);
    return this.hierarchy.updateAssignment(id, body.canApprove);
  }

  @Delete("assignments/:id")
  unassign(@Param("id") id: string, @Req() req: { user: AuthUser }) {
    this.auth.requireStaff(req.user, ["admin"]);
    return this.hierarchy.unassign(id);
  }

  /** Publie canApprove → StaffGroup stub (réutilise importStubHierarchy). */
  @Post("publish-routing")
  publish(
    @Body() body: PublishRoutingDto,
    @Req() req: { user: AuthUser },
  ) {
    this.auth.requireStaff(req.user, ["admin"]);
    return this.hierarchy.publishRouting(body.orgId, body.tenantId);
  }
}
