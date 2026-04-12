import { NextResponse } from "next/server";
import { isAppError } from "@/lib/errors";
import { authenticateMerchantApiRequest } from "@/lib/merchants/api-auth";
import { badRequest } from "@/lib/payments/api-route";
import { serializePaymentRefund } from "@/lib/payments/response";
import { getMerchantPaymentRefund } from "@/lib/refunds/service";

export const runtime = "nodejs";

interface QueryRefundByPathRequestBody {
  merchantCode?: unknown;
  sync?: unknown;
}

function parseBody(body: QueryRefundByPathRequestBody) {
  if (typeof body.merchantCode !== "string" || !body.merchantCode.trim()) {
    throw new Error("merchantCode is required.");
  }

  return {
    merchantCode: body.merchantCode.trim(),
    syncWithProvider: body.sync === false ? false : true,
  };
}

export async function POST(
  request: Request,
  context: { params: Promise<{ refundReference: string }> },
) {
  let parsedBody: ReturnType<typeof parseBody>;
  let rawBody = "";

  try {
    rawBody = await request.text();
    parsedBody = parseBody(JSON.parse(rawBody) as QueryRefundByPathRequestBody);
  } catch (error) {
    return badRequest(error instanceof Error ? error.message : "Invalid request body.");
  }

  try {
    const { refundReference } = await context.params;

    await authenticateMerchantApiRequest({
      request,
      rawBody,
      merchantCode: parsedBody.merchantCode,
    });

    const refund = await getMerchantPaymentRefund({
      merchantCode: parsedBody.merchantCode,
      refundReference,
      syncWithProvider: parsedBody.syncWithProvider,
    });

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
