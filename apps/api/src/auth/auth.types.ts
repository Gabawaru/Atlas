import type { StaffRole, TenantRole } from "@atlas/shared";

export interface AuthUser {
  userId: string;
  email: string;
  displayName: string;
  tenantId?: string;
  tenantRole?: TenantRole;
  staffRoles: StaffRole[];
  orgId?: string;
}
