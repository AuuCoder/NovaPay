import { NextResponse } from "next/server";
import { getCurrentAdminSession } from "@/lib/admin-session";
import { hasPermission, type AdminPermission } from "@/lib/rbac";

export async function ensureAdminApiPermission(permission: AdminPermission) {
  const session = await getCurrentAdminSession();

  if (!session) {
    return {
      ok: false as const,
      response: NextResponse.json(
        {
          error: "Unauthorized admin request.",
        },
        { status: 401 },
      ),
    };
  }

  if (!hasPermission(session.adminUser.role, permission)) {
    return {
      ok: false as const,
      response: NextResponse.json(
        {
          error: "Forbidden admin request.",
        },
        { status: 403 },
      ),
    };
  }

  return {
    ok: true as const,
    session,
  };
}
