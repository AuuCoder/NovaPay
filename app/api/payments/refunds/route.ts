import { NextResponse } from "next/server";
import { AppError, isAppError } from "@/lib/errors";
import { buildCreateRefundIdempotencySummary } from "@/lib/idempotency/fingerprint";
import { buildIdempotencyHeaders } from "@/lib/idempotency/http";
import {
  beginMerchantIdempotencyCommand,
  finishMerchantIdempotencyFinalError,
  finishMerchantIdempotencyRetryableError,
  finishMerchantIdempotencySuccess,
  readIdempotencyKey,
} from "@/lib/idempotency/service";
import { authenticateMerchantApiRequest } from "@/lib/merchants/api-auth";
import { badRequest } from "@/lib/payments/api-route";
import { serializePaymentRefund } from "@/lib/payments/response";
import { formatAmount, isRecord } from "@/lib/payments/utils";
import { createMerchantPaymentRefund } from "@/lib/refunds/service";

export const runtime = "nodejs";

interface CreateRefundRequestBody {
  merchantCode?: unknown;
  orderReference?: unknown;
  orderId?: unknown;
  externalOrderId?: unknown;
  externalRefundId?: unknown;
  amount?: unknown;
  reason?: unknown;
  metadata?: unknown;
}

function resolveOrderReference(body: CreateRefundRequestBody) {
  const candidates = [body.orderReference, body.orderId, body.externalOrderId];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }

  throw new Error("orderReference or externalOrderId is required.");
}

function parseBody(body: CreateRefundRequestBody) {
  if (typeof body.merchantCode !== "string" || !body.merchantCode.trim()) {
    throw new Error("merchantCode is required.");
  }

  if (typeof body.externalRefundId !== "string" || !body.externalRefundId.trim()) {
    throw new Error("externalRefundId is required.");
  }

  return {
    merchantCode: body.merchantCode.trim(),
    orderReference: resolveOrderReference(body),
    externalRefundId: body.externalRefundId.trim(),
    amount: formatAmount(
      typeof body.amount === "string" || typeof body.amount === "number" ? body.amount : NaN,
    ),
    reason:
      typeof body.reason === "string" && body.reason.trim() ? body.reason.trim() : null,
    metadata: isRecord(body.metadata) ? body.metadata : undefined,
  };
}

export async function POST(request: Request) {
  let parsedBody: ReturnType<typeof parseBody>;
  let rawBody = "";
  let idempotencyRecordId: string | null = null;
  let idempotencyKey: string | null = null;
  let idempotencyResponseStatus: "created" | null = null;

  try {
    rawBody = await request.text();
    parsedBody = parseBody(JSON.parse(rawBody) as CreateRefundRequestBody);
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
      scope: "payment_refund.create",
      idempotencyKey,
      ...buildCreateRefundIdempotencySummary(parsedBody),
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

    const result = await createMerchantPaymentRefund({
      ...parsedBody,
      apiCredentialId: auth.credentialId ?? null,
    });
    const responseBody = {
      created: result.created,
      refund: serializePaymentRefund(result.refund),
    };

    await finishMerchantIdempotencySuccess({
      recordId: idempotencyRecordId,
      httpStatus: 200,
      responseBody,
      resourceType: "payment_refund",
      resourceId: result.refund.id,
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
      error: error instanceof Error ? error.message : "Failed to create refund.",
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
