import { NextResponse } from "next/server";
import { isAppError } from "@/lib/errors";
import { authenticateMerchantApiRequest } from "@/lib/merchants/api-auth";
import { badRequest } from "@/lib/payments/api-route";
import { serializePaymentRefund } from "@/lib/payments/response";
import { getMerchantPaymentRefund } from "@/lib/refunds/service";

export const runtime = "nodejs";

interface QueryRefundRequestBody {
  merchantCode?: unknown;
  refundReference?: unknown;
  refundId?: unknown;
  externalRefundId?: unknown;
  sync?: unknown;
}

function resolveRefundReference(body: QueryRefundRequestBody) {
  const candidates = [body.refundReference, body.refundId, body.externalRefundId];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }

  throw new Error("refundReference or externalRefundId is required.");
}

function parseBody(body: QueryRefundRequestBody) {
  if (typeof body.merchantCode !== "string" || !body.merchantCode.trim()) {
    throw new Error("merchantCode is required.");
  }

  return {
    merchantCode: body.merchantCode.trim(),
    refundReference: resolveRefundReference(body),
    syncWithProvider: body.sync === false ? false : true,
  };
}

export async function POST(request: Request) {
  let parsedBody: ReturnType<typeof parseBody>;
  let rawBody = "";

  try {
    rawBody = await request.text();
    parsedBody = parseBody(JSON.parse(rawBody) as QueryRefundRequestBody);
  } catch (error) {
    return badRequest(error instanceof Error ? error.message : "Invalid request body.");
  }

  try {
    await authenticateMerchantApiRequest({
      request,
      rawBody,
      merchantCode: parsedBody.merchantCode,
    });

    const refund = await getMerchantPaymentRefund(parsedBody);

    return NextResponse.json({
      refund: serializePaymentRefund(refund),
    });
  } catch (error) {
    if (isAppError(error)) {
      return NextResponse.json(
        {
          error: error.message,
          code: error.code,
          details: error.details,
        },
        { status: error.status },
      );
    }

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to query refund.",
      },
      { status: 500 },
    );
  }
}
