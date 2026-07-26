import { timingSafeEqual } from "node:crypto";
import { getCurrentAdminSession } from "@/lib/admin-session";

/**
 * Authorization guard for the `/api/internal/*` endpoints.
 *
 * These endpoints must never be reachable by an unauthenticated caller. A
 * request is considered authorized when EITHER:
 *   - it carries a valid `x-internal-token` header matching the configured
 *     `NOVAPAY_INTERNAL_API_TOKEN` (for server-to-server / provisioning use), OR
 *   - it comes from an authenticated SUPER_ADMIN session.
 *
 * The reverse proxy SHOULD additionally block `/api/internal/*` from the public
 * internet as defense in depth, but this module ensures the application does not
 * rely on network topology alone.
 */

function safeStrEqual(a: string, b: string) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

export function getConfiguredInternalToken() {
  return process.env.NOVAPAY_INTERNAL_API_TOKEN?.trim() ?? "";
}

export function hasValidInternalToken(request: Request) {
  const configured = getConfiguredInternalToken();
  if (!configured) {
    return false;
  }
  const provided = request.headers.get("x-internal-token")?.trim() ?? "";
  return provided.length > 0 && safeStrEqual(configured, provided);
}

export async function isAuthorizedInternalRequest(request: Request) {
  if (hasValidInternalToken(request)) {
    return true;
  }

  try {
    const session = await getCurrentAdminSession();
    return Boolean(session && session.adminUser.role === "SUPER_ADMIN");
  } catch {
    return false;
  }
}
