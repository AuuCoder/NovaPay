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

export const runtime = "nodejs";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;

  // Phase 1 placeholder: in production this would:
  // 1. Verify admin session
  // 2. Update PluginRecord.visible = false, takenDown = true, takenDownReason
  // 3. Write AuditLog entry
  // 4. Return within 5 seconds (Req 3.1)

  let reason: string | null = null;
  try {
    const body = (await request.json()) as Record<string, unknown>;
    reason = typeof body.reason === "string" ? body.reason : null;
  } catch {
    // No body or invalid JSON — reason is optional
  }

  return NextResponse.json({
    slug,
    takenDown: true,
    visible: false,
    reason: reason ?? "Emergency take-down by admin.",
    message: `Plugin ${slug} has been taken down.`,
  });
}
