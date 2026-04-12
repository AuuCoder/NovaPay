import { NextResponse } from "next/server";
import { AppError, isAppError } from "@/lib/errors";
import { buildCreateOrderIdempotencySummary } from "@/lib/idempotency/fingerprint";
import { buildIdempotencyHeaders } from "@/lib/idempotency/http";
import {
  beginMerchantIdempotencyCommand,
  finishMerchantIdempotencyFinalError,
  finishMerchantIdempotencyRetryableError,
  finishMerchantIdempotencySuccess,
  readIdempotencyKey,
} from "@/lib/idempotency/service";
import { authenticateMerchantApiRequest } from "@/lib/merchants/api-auth";
import { createPaymentOrder, getMerchantPaymentOrder } from "@/lib/orders/service";
import {
  badRequest,
  getRequestClientIp,
  getRequestOrigin,
} from "@/lib/payments/api-route";
import { serializePaymentOrder } from "@/lib/payments/response";
import { formatAmount, isRecord } from "@/lib/payments/utils";

export const runtime = "nodejs";

interface CreateOrderRequestBody {
  merchantCode?: unknown;
  channelCode?: unknown;
  externalOrderId?: unknown;
  amount?: unknown;
  currency?: unknown;
  subject?: unknown;
  description?: unknown;
  notifyUrl?: unknown;
  returnUrl?: unknown;
  callbackUrl?: unknown;
  metadata?: unknown;
}

function parseCreateOrderBody(body: CreateOrderRequestBody) {
  if (typeof body.merchantCode !== "string" || !body.merchantCode.trim()) {
    throw new Error("merchantCode is required.");
  }

  if (typeof body.channelCode !== "string" || !body.channelCode.trim()) {
    throw new Error("channelCode is required.");
  }

  if (typeof body.externalOrderId !== "string" || !body.externalOrderId.trim()) {
    throw new Error("externalOrderId is required.");
  }

  if (typeof body.subject !== "string" || !body.subject.trim()) {
    throw new Error("subject is required.");
  }

  if (body.currency !== undefined && body.currency !== "CNY") {
    throw new Error("Current payment channels support CNY only.");
  }

  if (typeof body.notifyUrl === "string" && body.notifyUrl.trim()) {
    throw new Error(
      "notifyUrl is not supported. NovaPay assigns the upstream payment callback URL automatically. Use callbackUrl for merchant business notifications, and use returnUrl only for browser redirects.",
    );
  }

  return {
    merchantCode: body.merchantCode.trim(),
    channelCode: body.channelCode.trim(),
    externalOrderId: body.externalOrderId.trim(),
    amount: formatAmount(
      typeof body.amount === "string" || typeof body.amount === "number" ? body.amount : NaN,
    ),
    currency: "CNY",
    subject: body.subject.trim(),
    description:
      typeof body.description === "string" && body.description.trim()
        ? body.description.trim()
        : null,
    returnUrl:
      typeof body.returnUrl === "string" && body.returnUrl.trim() ? body.returnUrl.trim() : null,
    callbackUrl:
      typeof body.callbackUrl === "string" && body.callbackUrl.trim()
        ? body.callbackUrl.trim()
        : null,
    metadata: isRecord(body.metadata) ? body.metadata : undefined,
  };
}

export async function POST(request: Request) {
  let parsedBody: ReturnType<typeof parseCreateOrderBody>;
  let rawBody = "";
  let idempotencyRecordId: string | null = null;
  let idempotencyKey: string | null = null;
  let idempotencyResponseStatus: "created" | null = null;

  try {
    rawBody = await request.text();
    const body = JSON.parse(rawBody) as CreateOrderRequestBody;
    parsedBody = parseCreateOrderBody(body);
  } catch (error) {
    return badRequest(error instanceof Error ? error.message : "Invalid request body.");
  }

  try {
    const { merchant, auth } = await authenticateMerchantApiRequest({
      request,
      rawBody,
      merchantCode: parsedBody.merchantCode,
    });
    idempotencyKey = readIdempotencyKey(request);

    const idempotency = await beginMerchantIdempotencyCommand({
      merchantId: merchant.id,
      apiCredentialId: auth.credentialId ?? null,
      scope: "payment_order.create",
      idempotencyKey,
      ...buildCreateOrderIdempotencySummary(parsedBody),
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

    const result = await createPaymentOrder({
      ...parsedBody,
      apiCredentialId: auth.credentialId ?? null,
      clientIp: getRequestClientIp(request),
    });
    const order = await getMerchantPaymentOrder({
      merchantCode: parsedBody.merchantCode,
      orderReference: result.order.externalOrderId,
      syncWithProvider: false,
    });
    const hostedCheckoutUrl = new URL(`/pay/${result.order.id}`, getRequestOrigin(request)).toString();
    const responseBody = {
      created: result.created,
      order: serializePaymentOrder(order, { hostedCheckoutUrl }),
    };

    await finishMerchantIdempotencySuccess({
      recordId: idempotencyRecordId,
      httpStatus: 200,
      responseBody,
      resourceType: "payment_order",
      resourceId: result.order.id,
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
      error: error instanceof Error ? error.message : "Failed to create payment order.",
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
