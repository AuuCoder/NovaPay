/**
 * POST /admin/payouts/:id/reject (Req 4.5)
 */

import { NextResponse, type NextRequest } from "next/server";
import { requireRegistryAdminRequest } from "../../../../../../lib/auth/session";
import { getRegistryRuntime } from "../../../../../../lib/runtime/state";

export const runtime = "nodejs";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireRegistryAdminRequest(request);
  if (auth.response) {
    return auth.response;
  }

  const { id } = await params;
  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }
  const adminNote = typeof body.adminNote === "string" ? body.adminNote : "";
  if (!adminNote.trim()) {
    return NextResponse.json(
      { success: false, errorCode: "ADMIN_NOTE_REQUIRED" },
      { status: 400 },
    );
  }
  const state = await getRegistryRuntime();
  const result = await state.ledger.rejectPayout({ requestId: id, adminNote });
  if (!result.success) {
    const status = result.errorCode === "NOT_FOUND" ? 404 : 409;
    return NextResponse.json(
      { success: false, errorCode: result.errorCode },
      { status },
    );
  }
  return NextResponse.json({ success: true, request: result.request });
}
