import { NextResponse } from "next/server";
import { isAppError } from "@/lib/errors";
import { authenticateMerchantApiRequest } from "@/lib/merchants/api-auth";
import { getMerchantPaymentOrder } from "@/lib/orders/service";
import { getRequestOrigin, badRequest } from "@/lib/payments/api-route";
import { serializePaymentOrder } from "@/lib/payments/response";

export const runtime = "nodejs";

interface QueryOrderRequestBody {
  merchantCode?: unknown;
  orderReference?: unknown;
  orderId?: unknown;
  externalOrderId?: unknown;
  sync?: unknown;
}

function resolveOrderReference(body: QueryOrderRequestBody) {
  const candidates = [body.orderReference, body.orderId, body.externalOrderId];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }

  throw new Error("orderReference or externalOrderId is required.");
}

function parseBody(body: QueryOrderRequestBody) {
  if (typeof body.merchantCode !== "string" || !body.merchantCode.trim()) {
    throw new Error("merchantCode is required.");
  }

  return {
    merchantCode: body.merchantCode.trim(),
    orderReference: resolveOrderReference(body),
    syncWithProvider: body.sync === false ? false : true,
  };
}

export async function POST(request: Request) {
  let parsedBody: ReturnType<typeof parseBody>;
  let rawBody = "";

  try {
    rawBody = await request.text();
    parsedBody = parseBody(JSON.parse(rawBody) as QueryOrderRequestBody);
  } catch (error) {
    return badRequest(error instanceof Error ? error.message : "Invalid request body.");
  }

  try {
    await authenticateMerchantApiRequest({
      request,
      rawBody,
      merchantCode: parsedBody.merchantCode,
    });

    const order = await getMerchantPaymentOrder(parsedBody);
    const hostedCheckoutUrl = new URL(
      `/pay/${order.id}`,
      getRequestOrigin(request),
    ).toString();

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
