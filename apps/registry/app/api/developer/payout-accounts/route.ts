import { NextResponse, type NextRequest } from "next/server";
import { requireRegistryDeveloperSessionRequest } from "../../../../lib/auth/session";
import {
  createPayoutAccount,
  listPayoutAccountsByDeveloper,
} from "../../../../lib/payouts/payout-accounts";
import { apiError } from "../../../../lib/api/response";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const auth = await requireRegistryDeveloperSessionRequest(request);
  if (auth.response) {
    return auth.response;
  }

  const accounts = await listPayoutAccountsByDeveloper(auth.session.actorId);
  return NextResponse.json({ accounts });
}

export async function POST(request: NextRequest) {
  const auth = await requireRegistryDeveloperSessionRequest(request);
  if (auth.response) {
    return auth.response;
  }

  const body = (await request.json().catch(() => null)) as
    | {
        accountType?: "bank_transfer" | "paypal";
        accountHolder?: string;
        accountNumber?: string;
        routingNumber?: string;
        bankName?: string;
        paypalEmail?: string;
      }
    | null;

  const accountType = body?.accountType === "paypal" ? "paypal" : "bank_transfer";
  const accountHolder = typeof body?.accountHolder === "string" ? body.accountHolder.trim() : "";

  if (!accountHolder) {
    return apiError(request, "ACCOUNT_HOLDER_REQUIRED", 400);
  }

  if (accountType === "paypal") {
    const paypalEmail = typeof body?.paypalEmail === "string" ? body.paypalEmail.trim() : "";
    if (!paypalEmail) {
      return apiError(request, "PAYPAL_EMAIL_REQUIRED", 400);
    }
  } else {
    const accountNumber = typeof body?.accountNumber === "string" ? body.accountNumber.trim() : "";
    if (!accountNumber) {
      return apiError(request, "ACCOUNT_NUMBER_REQUIRED", 400);
    }
  }

  const account = await createPayoutAccount({
    developerId: auth.session.actorId,
    accountType,
    accountHolder,
    accountNumber: body?.accountNumber ?? null,
    routingNumber: body?.routingNumber ?? null,
    bankName: body?.bankName ?? null,
    paypalEmail: body?.paypalEmail ?? null,
  });

  return NextResponse.json({ account });
}
