import { createAccessControl } from "better-auth/plugins/access";
import { adminAc, defaultStatements, userAc } from "better-auth/plugins/admin/access";

/**
 * Rollenmodell: customer (Standard) und staff (Backoffice).
 * Explizite Map ist Pflicht, sobald adminRoles von admin/user abweichen.
 */
export const accessControl = createAccessControl(defaultStatements);

export const customerRole = accessControl.newRole(userAc.statements);
export const staffRole = accessControl.newRole(adminAc.statements);

export const ROLES = {
  customer: customerRole,
  staff: staffRole,
} as const;

export const DEFAULT_ROLE = "customer" as const;
export const ADMIN_ROLES = ["staff"] as const;

export type Role = keyof typeof ROLES;
export type IdentityStatus = "prospect" | "customer" | "disabled";
