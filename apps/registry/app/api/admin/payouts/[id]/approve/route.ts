/**
 * POST /admin/payouts/:id/approve (Req 4.4)
 *
 * Admin approves a pending payout request. Debits the developer balance and
 * advances the request state to APPROVED.
 *
 * Phase 3 placeholder: uses an in-memory ledger. Production wiring will
 * resolve the BalanceLedger from Prisma + audit logging.
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
  const adminNote = typeof body.adminNote === "string" ? body.adminNote : undefined;

  const result = await ledger.approvePayout({ requestId: id, adminNote });

  if (!result.success) {
    const status = result.errorCode === "NOT_FOUND" ? 404 : 409;
    return NextResponse.json(
      { success: false, errorCode: result.errorCode },
      { status },
    );
  }

  return NextResponse.json({ success: true, request: result.request });
}
