import type { MerchantUserRole } from "@/generated/prisma/enums";

export type MerchantPermission =
  | "dashboard:view"
  | "profile:read"
  | "profile:write"
  | "channel:read"
  | "channel:write"
  | "credential:read"
  | "credential:write"
  | "order:read"
  | "order:write"
  | "refund:read"
  | "refund:write";

const ALL_PERMISSIONS: MerchantPermission[] = [
  "dashboard:view",
  "profile:read",
  "profile:write",
  "channel:read",
  "channel:write",
  "credential:read",
  "credential:write",
  "order:read",
  "order:write",
  "refund:read",
  "refund:write",
];

const ROLE_PERMISSIONS: Record<MerchantUserRole, MerchantPermission[]> = {
  OWNER: ALL_PERMISSIONS,
  OPS: ["dashboard:view", "profile:read", "profile:write", "channel:read", "channel:write", "order:read", "order:write", "refund:read", "refund:write"],
  DEVELOPER: ["dashboard:view", "profile:read", "channel:read", "channel:write", "credential:read", "credential:write", "order:read", "refund:read"],
  VIEWER: ["dashboard:view", "profile:read", "channel:read", "credential:read", "order:read", "refund:read"],
};

function getMerchantRolePermissions(role: MerchantUserRole) {
  return ROLE_PERMISSIONS[role] ?? [];
}

export function hasMerchantPermission(role: MerchantUserRole, permission: MerchantPermission) {
  return getMerchantRolePermissions(role).includes(permission);
}
