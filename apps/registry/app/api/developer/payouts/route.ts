import { NextResponse, type NextRequest } from "next/server";
import { requireRegistryDeveloperSessionRequest } from "../../../../lib/auth/session";
import { getRegistryRuntime } from "../../../../lib/runtime/state";
import { apiError } from "../../../../lib/api/response";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const auth = await requireRegistryDeveloperSessionRequest(request);
  if (auth.response) {
    return auth.response;
  }

  const state = await getRegistryRuntime();
  const [balance, payouts, entries] = await Promise.all([
    state.ledger.getBalance(auth.session.actorId),
    state.ledger.listPayouts(auth.session.actorId),
    state.ledger.listEntries(auth.session.actorId),
  ]);

  return NextResponse.json({ balance, payouts, entries });
}

export async function POST(request: NextRequest) {
  const auth = await requireRegistryDeveloperSessionRequest(request);
  if (auth.response) {
    return auth.response;
  }

  const body = (await request.json().catch(() => null)) as
    | { payoutAccountId?: string; amountCents?: number; currency?: string }
    | null;

  const payoutAccountId =
    typeof body?.payoutAccountId === "string" ? body.payoutAccountId.trim() : "";
  const amountCents =
    typeof body?.amountCents === "number" && Number.isFinite(body.amountCents)
      ? Math.trunc(body.amountCents)
      : 0;
  const currency =
    typeof body?.currency === "string" && body.currency.trim() ? body.currency.trim() : "CNY";

  if (!payoutAccountId) {
    return apiError(request, "PAYOUT_ACCOUNT_REQUIRED", 400);
  }

  const state = await getRegistryRuntime();
  const result = await state.ledger.submitPayout({
    developerId: auth.session.actorId,
    payoutAccountId,
    amountCents,
    currency,
  });

  if (!result.success) {
    return apiError(
      request,
      result.errorCode ?? "INVALID_AMOUNT",
      409,
    );
  }

  return NextResponse.json({ request: result.request });
}
