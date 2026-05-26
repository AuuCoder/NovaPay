import { NextResponse } from "next/server";
import { getCurrentAdminSession } from "@/lib/admin-session";
import { verifyRegistrySsoToken } from "@/lib/registry-sso";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token");

  if (token) {
    const identity = verifyRegistrySsoToken(token);

    if (!identity) {
      return NextResponse.json(
        {
          authenticated: false,
          message: "Invalid or expired SSO token.",
        },
        { status: 401 },
      );
    }

    return NextResponse.json({
      authenticated: true,
      adminUser: identity,
    });
  }

  const session = await getCurrentAdminSession();

  if (!session) {
    return NextResponse.json(
      {
        authenticated: false,
        message: "Admin session not found.",
      },
      { status: 401 },
    );
  }

  return NextResponse.json({
    authenticated: true,
    adminUser: {
      id: session.adminUser.id,
      email: session.adminUser.email,
      name: session.adminUser.name,
      role: session.adminUser.role,
    },
  });
}
