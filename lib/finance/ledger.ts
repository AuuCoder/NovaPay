import type { Prisma } from "@/generated/prisma/client";
import {
  MerchantLedgerDirection,
  MerchantLedgerEntryType,
  PaymentRefundStatus,
  PaymentStatus,
} from "@/generated/prisma/enums";
import { toAmountNumber } from "@/lib/finance/calculations";
import { getPrismaClient } from "@/lib/prisma";

function toJsonValue(value: Record<string, unknown> | Prisma.InputJsonValue | undefined | null) {
  return value as Prisma.InputJsonValue | undefined;
}

export async function syncPaymentOrderLedgerEntries(orderId: string) {
  const prisma = getPrismaClient();
  const order = await prisma.paymentOrder.findUnique({
    where: {
      id: orderId,
    },
    include: {
      merchant: {
        select: {
          code: true,
          name: true,
        },
      },
    },
  });

  if (!order || order.status !== PaymentStatus.SUCCEEDED) {
    return;
  }

  await prisma.merchantLedgerEntry.upsert({
    where: {
      externalKey: `payment:capture:${order.id}`,
    },
    update: {
      merchantId: order.merchantId,
      paymentOrderId: order.id,
      paymentRefundId: null,
      type: MerchantLedgerEntryType.PAYMENT_CAPTURE,
      direction: MerchantLedgerDirection.CREDIT,
      amount: order.amount,
      currency: order.currency,
      description: `支付入账 ${order.externalOrderId}`,
      metadata: toJsonValue({
        merchantCode: order.merchant.code,
        externalOrderId: order.externalOrderId,
        channelCode: order.channelCode,
        gatewayOrderId: order.gatewayOrderId,
        feeRate: order.feeRateSnapshot.toString(),
        feeAmount: order.feeAmount.toString(),
        netAmount: order.netAmount.toString(),
      }),
      occurredAt: order.paidAt ?? order.completedAt ?? order.updatedAt,
    },
    create: {
      merchantId: order.merchantId,
      paymentOrderId: order.id,
      type: MerchantLedgerEntryType.PAYMENT_CAPTURE,
      direction: MerchantLedgerDirection.CREDIT,
      amount: order.amount,
      currency: order.currency,
      description: `支付入账 ${order.externalOrderId}`,
      externalKey: `payment:capture:${order.id}`,
      metadata: toJsonValue({
        merchantCode: order.merchant.code,
        externalOrderId: order.externalOrderId,
        channelCode: order.channelCode,
        gatewayOrderId: order.gatewayOrderId,
        feeRate: order.feeRateSnapshot.toString(),
        feeAmount: order.feeAmount.toString(),
        netAmount: order.netAmount.toString(),
      }),
      occurredAt: order.paidAt ?? order.completedAt ?? order.updatedAt,
    },
  });

  const feeAmount = toAmountNumber(order.feeAmount);

  if (feeAmount > 0) {
    await prisma.merchantLedgerEntry.upsert({
      where: {
        externalKey: `payment:fee:${order.id}`,
      },
      update: {
        merchantId: order.merchantId,
        paymentOrderId: order.id,
        paymentRefundId: null,
        settlementId: null,
        type: MerchantLedgerEntryType.PAYMENT_FEE,
        direction: MerchantLedgerDirection.DEBIT,
        amount: order.feeAmount,
        currency: order.currency,
        description: `支付手续费 ${order.externalOrderId}`,
        metadata: toJsonValue({
          merchantCode: order.merchant.code,
          externalOrderId: order.externalOrderId,
          channelCode: order.channelCode,
          gatewayOrderId: order.gatewayOrderId,
          feeRate: order.feeRateSnapshot.toString(),
          netAmount: order.netAmount.toString(),
        }),
        occurredAt: order.paidAt ?? order.completedAt ?? order.updatedAt,
      },
      create: {
        merchantId: order.merchantId,
        paymentOrderId: order.id,
        type: MerchantLedgerEntryType.PAYMENT_FEE,
        direction: MerchantLedgerDirection.DEBIT,
        amount: order.feeAmount,
        currency: order.currency,
        description: `支付手续费 ${order.externalOrderId}`,
        externalKey: `payment:fee:${order.id}`,
        metadata: toJsonValue({
          merchantCode: order.merchant.code,
          externalOrderId: order.externalOrderId,
          channelCode: order.channelCode,
          gatewayOrderId: order.gatewayOrderId,
          feeRate: order.feeRateSnapshot.toString(),
          netAmount: order.netAmount.toString(),
        }),
        occurredAt: order.paidAt ?? order.completedAt ?? order.updatedAt,
      },
    });
  } else {
    await prisma.merchantLedgerEntry.deleteMany({
      where: {
        externalKey: `payment:fee:${order.id}`,
      },
    });
  }
}

export async function syncPaymentRefundLedgerEntries(refundId: string) {
  const prisma = getPrismaClient();
  const refund = await prisma.paymentRefund.findUnique({
    where: {
      id: refundId,
    },
    include: {
      paymentOrder: {
        select: {
          externalOrderId: true,
          gatewayOrderId: true,
          channelCode: true,
        },
      },
      merchant: {
        select: {
          code: true,
          name: true,
        },
      },
    },
  });

  if (!refund || refund.status !== PaymentRefundStatus.SUCCEEDED) {
    return;
  }

  await prisma.merchantLedgerEntry.upsert({
    where: {
      externalKey: `refund:${refund.id}`,
    },
    update: {
      merchantId: refund.merchantId,
      paymentOrderId: refund.paymentOrderId,
      paymentRefundId: refund.id,
      type: MerchantLedgerEntryType.REFUND,
      direction: MerchantLedgerDirection.DEBIT,
      amount: refund.amount,
      currency: refund.currency,
      description: `退款支出 ${refund.externalRefundId}`,
      metadata: toJsonValue({
        merchantCode: refund.merchant.code,
        externalOrderId: refund.paymentOrder.externalOrderId,
        externalRefundId: refund.externalRefundId,
        channelCode: refund.paymentOrder.channelCode,
        providerRefundId: refund.providerRefundId,
        netAmountImpact: refund.netAmountImpact.toString(),
      }),
      occurredAt: refund.refundedAt ?? refund.updatedAt,
    },
    create: {
      merchantId: refund.merchantId,
      paymentOrderId: refund.paymentOrderId,
      paymentRefundId: refund.id,
      type: MerchantLedgerEntryType.REFUND,
      direction: MerchantLedgerDirection.DEBIT,
      amount: refund.amount,
      currency: refund.currency,
      description: `退款支出 ${refund.externalRefundId}`,
      externalKey: `refund:${refund.id}`,
      metadata: toJsonValue({
        merchantCode: refund.merchant.code,
        externalOrderId: refund.paymentOrder.externalOrderId,
        externalRefundId: refund.externalRefundId,
        channelCode: refund.paymentOrder.channelCode,
        providerRefundId: refund.providerRefundId,
        netAmountImpact: refund.netAmountImpact.toString(),
      }),
      occurredAt: refund.refundedAt ?? refund.updatedAt,
    },
  });
}

export async function backfillMerchantLedgerEntries() {
  const prisma = getPrismaClient();
  const [orders, refunds] = await Promise.all([
    prisma.paymentOrder.findMany({
      where: {
        status: PaymentStatus.SUCCEEDED,
      },
      select: {
        id: true,
      },
    }),
    prisma.paymentRefund.findMany({
      where: {
        status: PaymentRefundStatus.SUCCEEDED,
      },
      select: {
        id: true,
      },
    }),
  ]);

  for (const order of orders) {
    await syncPaymentOrderLedgerEntries(order.id);
  }

  for (const refund of refunds) {
    await syncPaymentRefundLedgerEntries(refund.id);
  }

  return {
    paymentOrders: orders.length,
    paymentRefunds: refunds.length,
  };
}
