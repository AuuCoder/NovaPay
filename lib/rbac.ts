import type { AdminRole } from "@/generated/prisma/enums";

export type AdminPermission =
  | "dashboard:view"
  | "finance:read"
  | "finance:write"
  | "merchant:read"
  | "merchant:write"
  | "merchant_credential:read"
  | "merchant_credential:write"
  | "binding:read"
  | "binding:write"
  | "system_config:read"
  | "system_config:write"
  | "order:read"
  | "order:write"
  | "callback:read"
  | "callback:write"
  | "audit:read"
  | "admin_user:read"
  | "admin_user:write";

const ALL_PERMISSIONS: AdminPermission[] = [
  "dashboard:view",
  "finance:read",
  "finance:write",
  "merchant:read",
  "merchant:write",
  "merchant_credential:read",
  "merchant_credential:write",
  "binding:read",
  "binding:write",
  "system_config:read",
  "system_config:write",
  "order:read",
  "order:write",
  "callback:read",
  "callback:write",
  "audit:read",
  "admin_user:read",
  "admin_user:write",
];

const ROLE_PERMISSIONS: Record<AdminRole, AdminPermission[]> = {
  SUPER_ADMIN: ALL_PERMISSIONS,
  OPS_ADMIN: [
    "dashboard:view",
    "finance:read",
    "finance:write",
    "merchant:read",
    "merchant:write",
    "merchant_credential:read",
    "merchant_credential:write",
    "binding:read",
    "binding:write",
    "order:read",
    "order:write",
    "callback:read",
    "callback:write",
    "audit:read",
  ],
  FINANCE_ADMIN: [
    "dashboard:view",
    "finance:read",
    "finance:write",
    "merchant:read",
    "binding:read",
    "order:read",
    "callback:read",
    "audit:read",
  ],
  VIEWER: [
    "dashboard:view",
    "merchant:read",
    "binding:read",
    "order:read",
    "callback:read",
  ],
};

function getRolePermissions(role: AdminRole) {
  return ROLE_PERMISSIONS[role] ?? [];
}

export function hasPermission(role: AdminRole, permission: AdminPermission) {
  return getRolePermissions(role).includes(permission);
}
