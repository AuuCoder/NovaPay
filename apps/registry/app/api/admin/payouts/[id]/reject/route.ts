/**
 * POST /admin/payouts/:id/reject (Req 4.5)
 *
 * Admin rejects a pending payout request. Releases the frozen balance.
 */

import { NextResponse, type NextRequest } from "next/server";
import { createInMemoryBalanceLedger } from "../../../../../../lib/payouts/balance-ledger";

export const runtime = "nodejs";

const ledger = createInMemoryBalanceLedger();

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
  const adminNote = typeof body.adminNote === "string" ? body.adminNote : "";
  if (!adminNote.trim()) {
    return NextResponse.json(
      { success: false, errorCode: "ADMIN_NOTE_REQUIRED" },
      { status: 400 },
    );
  }

  const result = await ledger.rejectPayout({ requestId: id, adminNote });

  if (!result.success) {
    const status = result.errorCode === "NOT_FOUND" ? 404 : 409;
    return NextResponse.json(
      { success: false, errorCode: result.errorCode },
      { status },
    );
  }

  return NextResponse.json({ success: true, request: result.request });
}
