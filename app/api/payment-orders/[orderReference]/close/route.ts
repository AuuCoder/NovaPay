import { NextResponse } from "next/server";
import { AppError, isAppError } from "@/lib/errors";
import { buildCloseOrderIdempotencySummary } from "@/lib/idempotency/fingerprint";
import { buildIdempotencyHeaders } from "@/lib/idempotency/http";
import {
  beginMerchantIdempotencyCommand,
  finishMerchantIdempotencyFinalError,
  finishMerchantIdempotencyRetryableError,
  finishMerchantIdempotencySuccess,
  readIdempotencyKey,
} from "@/lib/idempotency/service";
import { authenticateMerchantApiRequest } from "@/lib/merchants/api-auth";
import { closeMerchantPaymentOrder } from "@/lib/orders/service";
import { badRequest, getRequestOrigin } from "@/lib/payments/api-route";
import { serializePaymentOrder } from "@/lib/payments/response";

export const runtime = "nodejs";

interface CloseOrderByPathRequestBody {
  merchantCode?: unknown;
}

function parseBody(body: CloseOrderByPathRequestBody) {
  if (typeof body.merchantCode !== "string" || !body.merchantCode.trim()) {
    throw new Error("merchantCode is required.");
  }

  return {
    merchantCode: body.merchantCode.trim(),
  };
}

export async function POST(
  request: Request,
  context: { params: Promise<{ orderReference: string }> },
) {
  let parsedBody: ReturnType<typeof parseBody>;
  let rawBody = "";
  let idempotencyRecordId: string | null = null;
  let idempotencyKey: string | null = null;
  let idempotencyResponseStatus: "created" | null = null;

  try {
    rawBody = await request.text();
    parsedBody = parseBody(JSON.parse(rawBody) as CloseOrderByPathRequestBody);
  } catch (error) {
    return badRequest(error instanceof Error ? error.message : "Invalid request body.");
  }

  try {
    const { orderReference } = await context.params;

    const { merchant, auth } = await authenticateMerchantApiRequest({
      request,
      rawBody,
      merchantCode: parsedBody.merchantCode,
    });
    idempotencyKey = readIdempotencyKey(request);

    const idempotency = await beginMerchantIdempotencyCommand({
      merchantId: merchant.id,
      apiCredentialId: auth.credentialId ?? null,
      scope: "payment_order.close",
      idempotencyKey,
      ...buildCloseOrderIdempotencySummary({
        merchantCode: parsedBody.merchantCode,
        orderReference,
      }),
    });

    if (idempotency.kind === "replay") {
      return NextResponse.json(idempotency.responseBody, {
        status: idempotency.httpStatus,
        headers: buildIdempotencyHeaders({
          key: idempotency.key,
          status: "replayed",
        }),
      });
    }

    if (idempotency.kind === "conflict") {
      throw new AppError(
        "IDEMPOTENCY_CONFLICT",
        "Idempotency-Key has already been used with a different request payload.",
        409,
        { idempotencyKey: idempotency.key },
      );
    }

    if (idempotency.kind === "in_progress") {
      throw new AppError(
        "IDEMPOTENCY_IN_PROGRESS",
        "Another request with the same Idempotency-Key is still being processed.",
        409,
        { idempotencyKey: idempotency.key },
      );
    }

    if (idempotency.kind === "started") {
      idempotencyRecordId = idempotency.recordId;
      idempotencyKey = idempotency.key;
      idempotencyResponseStatus = "created";
    }

    const order = await closeMerchantPaymentOrder({
      merchantCode: parsedBody.merchantCode,
      orderReference,
    });
    const hostedCheckoutUrl = new URL(`/pay/${order.id}`, getRequestOrigin(request)).toString();
    const responseBody = {
      order: serializePaymentOrder(order, { hostedCheckoutUrl }),
    };

    await finishMerchantIdempotencySuccess({
      recordId: idempotencyRecordId,
      httpStatus: 200,
      responseBody,
      resourceType: "payment_order",
      resourceId: order.id,
    });

    return NextResponse.json(responseBody, {
      headers: buildIdempotencyHeaders({
        key: idempotencyKey,
        status: idempotencyResponseStatus,
      }),
    });
  } catch (error) {
    if (isAppError(error)) {
      const responseBody = {
        error: error.message,
        code: error.code,
        details: error.details,
      };

      await finishMerchantIdempotencyFinalError({
        recordId: idempotencyRecordId,
        httpStatus: error.status,
        responseBody,
        errorCode: error.code,
        errorMessage: error.message,
      });

      return NextResponse.json(
        responseBody,
        {
          status: error.status,
          headers: buildIdempotencyHeaders({
            key: idempotencyKey,
            status:
              error.code === "IDEMPOTENCY_CONFLICT"
                ? "conflict"
                : error.code === "IDEMPOTENCY_IN_PROGRESS"
                  ? "in_progress"
                  : idempotencyRecordId
                    ? "failed_final"
                    : null,
          }),
        },
      );
    }

    const responseBody = {
      error: error instanceof Error ? error.message : "Failed to close payment order.",
    };

    await finishMerchantIdempotencyRetryableError({
      recordId: idempotencyRecordId,
      httpStatus: 500,
      responseBody,
      errorCode: "IDEMPOTENCY_RETRYABLE_ERROR",
      errorMessage: responseBody.error,
    });

    return NextResponse.json(
      responseBody,
      {
        status: 500,
        headers: buildIdempotencyHeaders({
          key: idempotencyKey,
        }),
      },
    );
  }
}
