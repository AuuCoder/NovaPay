import { NextResponse } from "next/server";
import { clearRegistrySession, getCurrentRegistrySession } from "../../../../../lib/auth/session";
import { getNovaPayMainAppUrl } from "../../../../../lib/auth/novapay-admin-sso";

export const runtime = "nodejs";

function getRedirectBase(request: Request): string {
  const configured = process.env.REGISTRY_APP_URL?.trim();
  if (configured) return configured;

  const forwardedHost = request.headers.get("x-forwarded-host");
  const forwardedProto = request.headers.get("x-forwarded-proto");
  if (forwardedHost) {
    return `${forwardedProto ?? "https"}://${forwardedHost}`;
  }

  return request.url;
}

function resolveReturnUrl(request: Request): string {
  const url = new URL(request.url);
  const explicit = url.searchParams.get("return")?.trim();
  if (explicit) {
    try {
      const parsed = new URL(explicit, getNovaPayMainAppUrl());
      const main = new URL(getNovaPayMainAppUrl());
      if (parsed.host === main.host) {
        return parsed.toString();
      }
    } catch {
      // fall through
    }
  }
  return new URL("/admin/login", getNovaPayMainAppUrl()).toString();
}

async function performLogout(request: Request) {
  const session = await getCurrentRegistrySession();
  if (session && session.actorKind === "ADMIN_SSO") {
    await clearRegistrySession();
  }
  return NextResponse.redirect(resolveReturnUrl(request));
}

export async function GET(request: Request) {
  return performLogout(request);
}

export async function POST(request: Request) {
  return performLogout(request);
}
