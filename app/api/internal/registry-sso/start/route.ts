import { NextResponse } from "next/server";
import { getCurrentAdminSession } from "@/lib/admin-session";
import { issueRegistrySsoToken } from "@/lib/registry-sso";

export const runtime = "nodejs";

function getRegistryCallbackUrl() {
  const registryAppUrl = process.env.REGISTRY_APP_URL?.trim() || "http://localhost:3100";
  return new URL("/api/internal/registry-sso/callback", registryAppUrl);
}

export async function GET() {
  const session = await getCurrentAdminSession();

  if (!session) {
    const fallback = new URL("/developer/auth", getRegistryCallbackUrl());
    fallback.searchParams.set(
      "error",
      "Please sign in to the NovaPay main admin on port 3000 first.",
    );
    return NextResponse.redirect(fallback);
  }

  const token = issueRegistrySsoToken({
    id: session.adminUser.id,
    email: session.adminUser.email,
    name: session.adminUser.name,
    role: session.adminUser.role,
  });
  const callbackUrl = getRegistryCallbackUrl();
  callbackUrl.searchParams.set("token", token);

  return NextResponse.redirect(callbackUrl);
}
