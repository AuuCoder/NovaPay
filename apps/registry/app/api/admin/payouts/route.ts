/**
 * GET /admin/payouts
 *
 * Lists all payout requests (admin view). Optional `?developerId=` filter.
 */

import { NextResponse, type NextRequest } from "next/server";
import { createInMemoryBalanceLedger } from "../../../../../lib/payouts/balance-ledger";

export const runtime = "nodejs";

const ledger = createInMemoryBalanceLedger();

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const developerId = searchParams.get("developerId") ?? undefined;
  const requests = await ledger.listPayouts(developerId);
  return NextResponse.json({ requests });
}
