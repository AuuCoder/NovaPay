import { PaymentStatus } from "@/generated/prisma/enums";
import { getMerchantPaymentOrder } from "@/lib/orders/service";
import { getPrismaClient } from "@/lib/prisma";
import { getSystemConfig } from "@/lib/system-config";

const DEFAULT_PAYMENT_MONITOR_INTERVAL_MS = 15_000;
const DEFAULT_PAYMENT_MONITOR_BATCH_SIZE = 50;

function parsePositiveInteger(raw: string | undefined, fallback: number) {
  if (!raw) {
    return fallback;
  }

  const numeric = Number(raw);
  return Number.isInteger(numeric) && numeric > 0 ? numeric : fallback;
}

export async function getPaymentMonitorWorkerConfig() {
  const [intervalMsRaw, batchSizeRaw] = await Promise.all([
    getSystemConfig("PAYMENT_MONITOR_INTERVAL_MS"),
    getSystemConfig("PAYMENT_MONITOR_BATCH_SIZE"),
  ]);

  return {
    intervalMs: parsePositiveInteger(intervalMsRaw, DEFAULT_PAYMENT_MONITOR_INTERVAL_MS),
    batchSize: parsePositiveInteger(batchSizeRaw, DEFAULT_PAYMENT_MONITOR_BATCH_SIZE),
  };
}

async function listDuePaymentOrderRefs(limit = DEFAULT_PAYMENT_MONITOR_BATCH_SIZE) {
  const prisma = getPrismaClient();
  const now = new Date();
  const orders = await prisma.paymentOrder.findMany({
    where: {
      status: {
        in: [PaymentStatus.PENDING, PaymentStatus.PROCESSING],
      },
      merchantChannelAccountId: {
        not: null,
      },
      OR: [
        {
          expireAt: null,
        },
        {
          expireAt: {
            gt: now,
          },
        },
      ],
    },
    orderBy: [{ expireAt: "asc" }, { updatedAt: "asc" }, { createdAt: "asc" }],
    take: limit,
    select: {
      id: true,
      merchant: {
        select: {
          code: true,
        },
      },
    },
  });

  return orders;
}

/**
 * Periodically polls upstream payment providers for active orders so missed
 * official notifications can still be reconciled.
 */
export async function runDuePaymentOrderMonitorDispatches(limit?: number) {
  const orderRefs = await listDuePaymentOrderRefs(limit);
  let checkedCount = 0;
  let succeededCount = 0;
  let stillOpenCount = 0;
  let errorCount = 0;

  for (const orderRef of orderRefs) {
    try {
      checkedCount += 1;
      const updatedOrder = await getMerchantPaymentOrder({
        merchantCode: orderRef.merchant.code,
        orderReference: orderRef.id,
        syncWithProvider: true,
      });

      if (updatedOrder.status === PaymentStatus.SUCCEEDED) {
        succeededCount += 1;
      } else {
        stillOpenCount += 1;
      }
    } catch (error) {
      errorCount += 1;
      console.error(
        `[payment-monitor] failed to sync order ${orderRef.id}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  return {
    selectedCount: orderRefs.length,
    checkedCount,
    succeededCount,
    stillOpenCount,
    errorCount,
  };
}
