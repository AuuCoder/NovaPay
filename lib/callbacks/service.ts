import {
  CallbackAttemptStatus,
  CallbackDeliveryStatus,
  PaymentStatus,
} from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";
import { AppError } from "@/lib/errors";
import { createMerchantCallbackSignature } from "@/lib/merchants/signature";
import { getPrismaClient } from "@/lib/prisma";
import { revealStoredSecret } from "@/lib/secret-box";
import { getSystemConfig } from "@/lib/system-config";

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_RETRY_INTERVAL_SECONDS = 60;
const DEFAULT_MAX_ATTEMPTS = 6;
const DEFAULT_WORKER_BATCH_SIZE = 20;
const DEFAULT_WORKER_INTERVAL_MS = 5_000;
const PROCESSING_LEASE_BUFFER_MS = 5_000;

function parsePositiveInteger(raw: string | undefined, fallback: number) {
  if (!raw) {
    return fallback;
  }

  const numeric = Number(raw);
  return Number.isInteger(numeric) && numeric > 0 ? numeric : fallback;
}

function getProcessingLeaseMs(timeoutMs: number) {
  return Math.max(timeoutMs + PROCESSING_LEASE_BUFFER_MS, 15_000);
}

async function getCallbackRuntimeConfig() {
  const [timeoutMsRaw, retryIntervalSecondsRaw, maxAttemptsRaw] = await Promise.all([
    getSystemConfig("CALLBACK_TIMEOUT_MS"),
    getSystemConfig("CALLBACK_RETRY_INTERVAL_SECONDS"),
    getSystemConfig("CALLBACK_MAX_ATTEMPTS"),
  ]);

  const timeoutMs = parsePositiveInteger(timeoutMsRaw, DEFAULT_TIMEOUT_MS);
  const retryIntervalSeconds = parsePositiveInteger(
    retryIntervalSecondsRaw,
    DEFAULT_RETRY_INTERVAL_SECONDS,
  );
  const maxAttempts = parsePositiveInteger(maxAttemptsRaw, DEFAULT_MAX_ATTEMPTS);

  return {
    timeoutMs,
    retryIntervalSeconds,
    maxAttempts,
    processingLeaseMs: getProcessingLeaseMs(timeoutMs),
  };
}

function buildAutomaticClaimWhere(orderId: string, now: Date, maxAttempts: number): Prisma.PaymentOrderWhereInput {
  return {
    id: orderId,
    callbackAttemptsCount: {
      lt: maxAttempts,
    },
    OR: [
      {
        callbackStatus: {
          in: [CallbackDeliveryStatus.PENDING, CallbackDeliveryStatus.FAILED],
        },
        nextCallbackAt: {
          lte: now,
        },
      },
      {
        callbackStatus: CallbackDeliveryStatus.PROCESSING,
        OR: [
          {
            nextCallbackAt: {
              lte: now,
            },
          },
          {
            nextCallbackAt: null,
          },
        ],
      },
    ],
  };
}

function buildForcedClaimWhere(orderId: string, now: Date): Prisma.PaymentOrderWhereInput {
  return {
    id: orderId,
    OR: [
      {
        callbackStatus: {
          not: CallbackDeliveryStatus.PROCESSING,
        },
      },
      {
        callbackStatus: CallbackDeliveryStatus.PROCESSING,
        OR: [
          {
            nextCallbackAt: {
              lte: now,
            },
          },
          {
            nextCallbackAt: null,
          },
        ],
      },
    ],
  };
}

async function claimMerchantCallbackDispatch(input: {
  orderId: string;
  force: boolean;
  now: Date;
  maxAttempts: number;
  leaseExpiresAt: Date;
}) {
  const prisma = getPrismaClient();
  const result = await prisma.paymentOrder.updateMany({
    where: input.force
      ? buildForcedClaimWhere(input.orderId, input.now)
      : buildAutomaticClaimWhere(input.orderId, input.now, input.maxAttempts),
    data: {
      callbackStatus: CallbackDeliveryStatus.PROCESSING,
      nextCallbackAt: input.leaseExpiresAt,
    },
  });

  return result.count === 1;
}

function resolveCallbackTarget(order: {
  callbackUrl: string | null;
  merchant: { callbackBase: string | null; callbackEnabled: boolean };
}) {
  if (!order.merchant.callbackEnabled) {
    return null;
  }

  return order.callbackUrl ?? order.merchant.callbackBase;
}

function buildPayload(order: {
  id: string;
  externalOrderId: string;
  channelCode: string;
  amount: { toString(): string };
  currency: string;
  status: string;
  gatewayOrderId: string | null;
  providerStatus: string | null;
  paidAt: Date | null;
  completedAt: Date | null;
  metadata: unknown;
  merchant: { code: string };
}) {
  return {
    event: "payment.order.updated",
    order: {
      id: order.id,
      merchantCode: order.merchant.code,
      externalOrderId: order.externalOrderId,
      channelCode: order.channelCode,
      amount: order.amount.toString(),
      currency: order.currency,
      status: order.status,
      gatewayOrderId: order.gatewayOrderId,
      providerStatus: order.providerStatus,
      paidAt: order.paidAt?.toISOString() ?? null,
      completedAt: order.completedAt?.toISOString() ?? null,
      metadata: order.metadata ?? null,
    },
  };
}

export async function dispatchMerchantCallback(orderId: string, force = false) {
  const prisma = getPrismaClient();
  const order = await prisma.paymentOrder.findUnique({
    where: {
      id: orderId,
    },
    include: {
      merchant: true,
    },
  });

  if (!order) {
    throw new AppError("ORDER_NOT_FOUND", `Payment order ${orderId} was not found.`, 404);
  }

  const targetUrl = resolveCallbackTarget(order);

  if (!targetUrl) {
    await prisma.paymentOrder.update({
      where: {
        id: order.id,
      },
      data: {
        callbackStatus: CallbackDeliveryStatus.NOT_REQUIRED,
        nextCallbackAt: null,
      },
    });

    return {
      delivered: false,
      skipped: true,
      reason: "callback_target_missing",
    };
  }

  if (!force && order.callbackStatus === CallbackDeliveryStatus.DELIVERED) {
    return {
      delivered: true,
      skipped: true,
      reason: "callback_already_delivered",
    };
  }

  if (
    order.status !== PaymentStatus.SUCCEEDED &&
    order.status !== PaymentStatus.FAILED &&
    order.status !== PaymentStatus.CANCELLED
  ) {
    return {
      delivered: false,
      skipped: true,
      reason: "order_not_terminal",
    };
  }

  const payload = buildPayload(order);
  const requestBody = JSON.stringify(payload);
  const now = new Date();
  const timestamp = now.toISOString();
  const { timeoutMs, retryIntervalSeconds, maxAttempts, processingLeaseMs } =
    await getCallbackRuntimeConfig();

  if (!force && order.callbackAttemptsCount >= maxAttempts) {
    return {
      delivered: false,
      skipped: true,
      reason: "max_attempts_reached",
    };
  }

  if (
    order.callbackStatus === CallbackDeliveryStatus.PROCESSING &&
    order.nextCallbackAt &&
    order.nextCallbackAt > now
  ) {
    return {
      delivered: false,
      skipped: true,
      reason: "callback_already_processing",
    };
  }

  if (
    !force &&
    order.callbackStatus !== CallbackDeliveryStatus.PENDING &&
    order.callbackStatus !== CallbackDeliveryStatus.FAILED &&
    order.callbackStatus !== CallbackDeliveryStatus.PROCESSING
  ) {
    return {
      delivered: false,
      skipped: true,
      reason: "callback_not_retryable",
    };
  }

  const claimed = await claimMerchantCallbackDispatch({
    orderId: order.id,
    force,
    now,
    maxAttempts,
    leaseExpiresAt: new Date(now.getTime() + processingLeaseMs),
  });

  if (!claimed) {
    return {
      delivered: false,
      skipped: true,
      reason: "callback_not_claimed",
    };
  }

  const headers: Record<string, string> = {
    "content-type": "application/json",
    "x-novapay-event": "payment.order.updated",
    "x-novapay-order-id": order.id,
    "x-novapay-merchant-code": order.merchant.code,
    "x-novapay-timestamp": timestamp,
  };

  const notifySecret = revealStoredSecret(order.merchant.notifySecret);

  if (notifySecret) {
    headers["x-novapay-signature"] = createMerchantCallbackSignature(
      notifySecret,
      timestamp,
      requestBody,
    );
  }

  let httpStatus: number | null = null;
  let responseBody: string | null = null;
  let errorMessage: string | null = null;
  let delivered = false;

  try {
    const response = await fetch(targetUrl, {
      method: "POST",
      headers,
      body: requestBody,
      signal: AbortSignal.timeout(timeoutMs),
    });

    httpStatus = response.status;
    responseBody = await response.text();
    delivered = response.ok;
  } catch (error) {
    errorMessage = error instanceof Error ? error.message : "Unknown callback error";
  }

  const completedAt = new Date();

  await prisma.$transaction([
    prisma.paymentCallbackAttempt.create({
      data: {
        paymentOrderId: order.id,
        targetUrl,
        status: delivered ? CallbackAttemptStatus.SUCCEEDED : CallbackAttemptStatus.FAILED,
        httpStatus,
        requestHeaders: headers,
        requestBody: payload,
        responseBody,
        errorMessage,
        completedAt,
      },
    }),
    prisma.paymentOrder.update({
      where: {
        id: order.id,
      },
      data: {
        callbackStatus: delivered
          ? CallbackDeliveryStatus.DELIVERED
          : CallbackDeliveryStatus.FAILED,
        callbackAttemptsCount: {
          increment: 1,
        },
        lastCallbackAt: completedAt,
        callbackDeliveredAt: delivered ? completedAt : null,
        nextCallbackAt: delivered
          ? null
          : order.callbackAttemptsCount + 1 >= maxAttempts
            ? null
          : new Date(completedAt.getTime() + retryIntervalSeconds * 1_000),
      },
    }),
  ]);

  return {
    delivered,
    skipped: false,
    httpStatus,
    errorMessage,
  };
}

async function listDueMerchantCallbackOrderIds(limit = DEFAULT_WORKER_BATCH_SIZE) {
  const prisma = getPrismaClient();
  const { maxAttempts } = await getCallbackRuntimeConfig();
  const now = new Date();
  const orders = await prisma.paymentOrder.findMany({
    where: {
      status: {
        in: [PaymentStatus.SUCCEEDED, PaymentStatus.FAILED, PaymentStatus.CANCELLED],
      },
      callbackAttemptsCount: {
        lt: maxAttempts,
      },
      OR: [
        {
          callbackStatus: {
            in: [CallbackDeliveryStatus.PENDING, CallbackDeliveryStatus.FAILED],
          },
          nextCallbackAt: {
            lte: now,
          },
        },
        {
          callbackStatus: CallbackDeliveryStatus.PROCESSING,
          OR: [
            {
              nextCallbackAt: {
                lte: now,
              },
            },
            {
              nextCallbackAt: null,
            },
          ],
        },
      ],
    },
    orderBy: [{ nextCallbackAt: "asc" }, { createdAt: "asc" }],
    take: limit,
    select: {
      id: true,
    },
  });

  return orders.map((order) => order.id);
}

export async function getCallbackWorkerConfig() {
  const [batchSizeRaw, intervalMsRaw] = await Promise.all([
    getSystemConfig("CALLBACK_WORKER_BATCH_SIZE"),
    getSystemConfig("CALLBACK_WORKER_INTERVAL_MS"),
  ]);

  return {
    batchSize: parsePositiveInteger(batchSizeRaw, DEFAULT_WORKER_BATCH_SIZE),
    intervalMs: parsePositiveInteger(intervalMsRaw, DEFAULT_WORKER_INTERVAL_MS),
  };
}

export async function runDueMerchantCallbackDispatches(limit?: number) {
  const orderIds = await listDueMerchantCallbackOrderIds(limit);
  let deliveredCount = 0;
  let failedCount = 0;
  let skippedCount = 0;
  let errorCount = 0;

  for (const orderId of orderIds) {
    try {
      const result = await dispatchMerchantCallback(orderId);

      if (result.skipped) {
        skippedCount += 1;
        continue;
      }

      if (result.delivered) {
        deliveredCount += 1;
        continue;
      }

      failedCount += 1;
    } catch {
      errorCount += 1;
    }
  }

  return {
    selectedCount: orderIds.length,
    deliveredCount,
    failedCount,
    skippedCount,
    errorCount,
  };
}
