/**
 * POST /admin/payouts/:id/approve (Req 4.4)
 */

import { NextResponse, type NextRequest } from "next/server";
import { getRegistryRuntime } from "../../../../../../lib/runtime/state";

export const runtime = "nodejs";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }
  const adminNote = typeof body.adminNote === "string" ? body.adminNote : undefined;
  const state = await getRegistryRuntime();
  const result = await state.ledger.approvePayout({ requestId: id, adminNote });
  if (!result.success) {
    const status = result.errorCode === "NOT_FOUND" ? 404 : 409;
    return NextResponse.json(
      { success: false, errorCode: result.errorCode },
      { status },
    );
  }
  return NextResponse.json({ success: true, request: result.request });
}
