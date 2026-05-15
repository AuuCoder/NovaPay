/**
 * GET /admin/payouts — list payout requests (admin view, optional ?developerId=).
 */

import { NextResponse, type NextRequest } from "next/server";
import { getRegistryRuntime } from "../../../../../lib/runtime/state";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const developerId = searchParams.get("developerId") ?? undefined;
  const state = await getRegistryRuntime();
  const requests = await state.ledger.listPayouts(developerId);
  return NextResponse.json({ requests });
}
