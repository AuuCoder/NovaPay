import { NextResponse } from "next/server";
import { isAppError } from "@/lib/errors";
import { authenticateMerchantApiRequest } from "@/lib/merchants/api-auth";
import { getMerchantPaymentOrder } from "@/lib/orders/service";
import { badRequest, getRequestOrigin } from "@/lib/payments/api-route";
import { serializePaymentOrder } from "@/lib/payments/response";

export const runtime = "nodejs";

interface QueryOrderByPathRequestBody {
  merchantCode?: unknown;
  sync?: unknown;
}

function parseBody(body: QueryOrderByPathRequestBody) {
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
  context: { params: Promise<{ orderReference: string }> },
) {
  let parsedBody: ReturnType<typeof parseBody>;
  let rawBody = "";

  try {
    rawBody = await request.text();
    parsedBody = parseBody(JSON.parse(rawBody) as QueryOrderByPathRequestBody);
  } catch (error) {
    return badRequest(error instanceof Error ? error.message : "Invalid request body.");
  }

  try {
    const { orderReference } = await context.params;

    await authenticateMerchantApiRequest({
      request,
      rawBody,
      merchantCode: parsedBody.merchantCode,
    });

    const order = await getMerchantPaymentOrder({
      merchantCode: parsedBody.merchantCode,
      orderReference,
      syncWithProvider: parsedBody.syncWithProvider,
    });
    const hostedCheckoutUrl = new URL(`/pay/${order.id}`, getRequestOrigin(request)).toString();

    return NextResponse.json({
      order: serializePaymentOrder(order, { hostedCheckoutUrl }),
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
        error: error instanceof Error ? error.message : "Failed to query payment order.",
      },
      { status: 500 },
    );
  }
}
