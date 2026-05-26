/**
 * POST /admin/plugins/:slug/take-down
 *
 * Emergency take-down endpoint (Req 3.1, 3.2, 3.4).
 * Sets `visible=false` and `takenDown=true` on the PluginRecord.
 *
 * Phase 1: operates on in-memory state (placeholder). Once the Prisma store
 * is wired, this will update the database and write an AuditLog entry.
 */

import { NextResponse, type NextRequest } from "next/server";
import { requireRegistryAdminRequest } from "../../../../../../lib/auth/session";
import {
  apiError,
  resolveApiMessage,
  resolveRequestLocale,
} from "../../../../../../lib/api/response";
import { getRegistryRuntime, takeDownPlugin } from "../../../../../../lib/runtime/state";

export const runtime = "nodejs";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const auth = await requireRegistryAdminRequest(request);
  if (auth.response) {
    return auth.response;
  }

  const { slug } = await params;
  const locale = resolveRequestLocale(request);
  const state = await getRegistryRuntime();

  let reason: string | null = null;
  try {
    const body = (await request.json()) as Record<string, unknown>;
    reason = typeof body.reason === "string" ? body.reason : null;
  } catch {
    // No body or invalid JSON — reason is optional
  }

  const result = await takeDownPlugin({
    state,
    slug,
    actorId: auth.session.actorId,
    reason,
    ip: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
  });

  if (!result.success) {
    return apiError(request, "INVALID_TRANSITION", 409);
  }

  return NextResponse.json({
    slug,
    takenDown: true,
    visible: false,
    affectedVersions: result.updatedVersions.map((record) => record.version),
    reason: reason ?? resolveApiMessage(locale, "TAKEDOWN_DEFAULT_REASON"),
    message: resolveApiMessage(locale, "TAKEDOWN_SUCCESS", { slug }),
  });
}
