import type { Prisma } from "@/generated/prisma/client";
import { PaymentRefundStatus, PaymentStatus } from "@/generated/prisma/enums";
import { AppError } from "@/lib/errors";
import { formatStoredMoney } from "@/lib/finance/calculations";
import { syncPaymentRefundLedgerEntries } from "@/lib/finance/ledger";
import {
  getMerchantPaymentOrderByReference,
  syncPaymentOrderFromProvider,
} from "@/lib/orders/service";
import { getPaymentProvider } from "@/lib/payments/registry";
import { getPaymentRuntimeAccountBySelection } from "@/lib/payments/provider-accounts";
import { isRecord } from "@/lib/payments/utils";
import { getPrismaClient } from "@/lib/prisma";
import type { PaymentRefundNotification } from "@/lib/payments/types";
import { resolveRefundStatus } from "@/lib/refunds/status";

const paymentRefundDetailInclude = {
  merchant: true,
  paymentOrder: {
    include: {
      merchant: true,
    },
  },
} satisfies Prisma.PaymentRefundInclude;

export type MerchantPaymentRefund = Prisma.PaymentRefundGetPayload<{
  include: typeof paymentRefundDetailInclude;
}>;

async function requireMerchantRuntimeAccount(refund: {
  id: string;
  merchantChannelAccountId: string | null;
  paymentOrder: {
    merchantChannelAccountId: string | null;
  };
}) {
  const merchantChannelAccountId =
    refund.merchantChannelAccountId ?? refund.paymentOrder.merchantChannelAccountId;

  if (!merchantChannelAccountId) {
    throw new AppError(
      "LEGACY_PLATFORM_ACCOUNT_UNSUPPORTED",
      `Refund ${refund.id} is not linked to a merchant-owned channel instance.`,
      422,
    );
  }

  const account = await getPaymentRuntimeAccountBySelection({
    merchantChannelAccountId,
  });

  if (!account) {
    throw new AppError(
      "CHANNEL_ACCOUNT_NOT_FOUND",
      `Merchant channel account ${merchantChannelAccountId} was not found for refund ${refund.id}.`,
      422,
    );
  }

  return account;
}

function toJsonValue(
  value: Record<string, unknown> | Prisma.InputJsonValue | undefined | null,
) {
  return value as Prisma.InputJsonValue | undefined;
}

function toAmountNumber(value: { toString(): string } | string | number) {
  return Number(typeof value === "string" || typeof value === "number" ? value : value.toString());
}

function assertRefundAmount(inputAmount: string, availableAmount: number) {
  const requestedAmount = Number(inputAmount);

  if (!Number.isFinite(requestedAmount) || requestedAmount <= 0) {
    throw new AppError("INVALID_REFUND_AMOUNT", "Refund amount must be a positive number.", 400);
  }

  if (requestedAmount - availableAmount > 0.01) {
    throw new AppError(
      "REFUND_AMOUNT_EXCEEDED",
      `Refund amount exceeds the available refundable balance of ${availableAmount.toFixed(2)}.`,
      422,
    );
  }
}

function assertExistingRefundMatches(
  refund: MerchantPaymentRefund,
  input: {
    orderId: string;
    amount: string;
    reason?: string | null;
  },
) {
  if (refund.paymentOrderId !== input.orderId) {
    throw new AppError(
      "REFUND_REFERENCE_CONFLICT",
      `Refund ${refund.externalRefundId} already belongs to another payment order.`,
      409,
    );
  }

  if (Math.abs(toAmountNumber(refund.amount) - Number(input.amount)) > 0.01) {
    throw new AppError(
      "REFUND_AMOUNT_CONFLICT",
      `Refund ${refund.externalRefundId} already exists with a different amount.`,
      409,
    );
  }

  if ((refund.reason ?? null) !== (input.reason ?? null)) {
    throw new AppError(
      "REFUND_REASON_CONFLICT",
      `Refund ${refund.externalRefundId} already exists with a different refund reason.`,
      409,
    );
  }
}

async function loadPaymentRefundById(id: string) {
  const prisma = getPrismaClient();
  return prisma.paymentRefund.findUnique({
    where: {
      id,
    },
    include: paymentRefundDetailInclude,
  });
}

async function getReservedRefundAmount(paymentOrderId: string, excludeRefundId?: string) {
  const prisma = getPrismaClient();
  const aggregate = await prisma.paymentRefund.aggregate({
    where: {
      paymentOrderId,
      status: {
        in: [
          PaymentRefundStatus.PENDING,
          PaymentRefundStatus.PROCESSING,
          PaymentRefundStatus.SUCCEEDED,
        ],
      },
      ...(excludeRefundId
        ? {
            id: {
              not: excludeRefundId,
            },
          }
        : {}),
    },
    _sum: {
      amount: true,
    },
  });

  return aggregate._sum.amount ? toAmountNumber(aggregate._sum.amount) : 0;
}

async function applyPaymentRefundNotificationById(
  refundId: string,
  notification: PaymentRefundNotification,
) {
  const prisma = getPrismaClient();
  const refund = await prisma.paymentRefund.findUnique({
    where: {
      id: refundId,
    },
  });

  if (!refund) {
    throw new AppError("REFUND_NOT_FOUND", "refund not found", 404);
  }

  if (notification.orderId !== refund.paymentOrderId) {
    throw new AppError("REFUND_ORDER_MISMATCH", "refund order mismatch", 409);
  }

  const nextStatus = resolveRefundStatus(
    refund.status,
    notification.providerStatus,
    notification.succeeds,
  );
  const updatedRefund = await prisma.paymentRefund.update({
    where: {
      id: refund.id,
    },
    data: {
      status: nextStatus,
      providerStatus: notification.providerStatus,
      providerRefundId: notification.gatewayRefundId ?? refund.providerRefundId,
      failureCode: nextStatus === PaymentRefundStatus.FAILED ? notification.providerStatus : null,
      failureMessage:
        nextStatus === PaymentRefundStatus.FAILED
          ? `Provider status: ${notification.providerStatus}`
          : null,
      refundedAt:
        nextStatus === PaymentRefundStatus.SUCCEEDED
          ? notification.refundedAt ?? refund.refundedAt ?? new Date()
          : refund.refundedAt,
    },
  });

  if (updatedRefund.status === PaymentRefundStatus.SUCCEEDED) {
    await syncPaymentRefundLedgerEntries(updatedRefund.id);
  }

  return (await loadPaymentRefundById(updatedRefund.id)) ?? null;
}

export async function syncPaymentRefundFromProvider(refund: MerchantPaymentRefund) {
  const provider = getPaymentProvider(refund.paymentOrder.channelCode);

  if (!provider?.queryRefund) {
    return refund;
  }

  const providerAccount = await requireMerchantRuntimeAccount(refund);
  const notification = await provider.queryRefund({
    orderId: refund.paymentOrderId,
    gatewayOrderId: refund.paymentOrder.gatewayOrderId,
    refundId: refund.externalRefundId,
    gatewayRefundId: refund.providerRefundId,
    merchant: refund.paymentOrder.merchant,
    amount: refund.paymentOrder.amount.toString(),
    currency: refund.currency,
    subject: refund.paymentOrder.subject,
    description: refund.paymentOrder.description,
    metadata: isRecord(refund.metadata) ? refund.metadata : undefined,
    account: providerAccount,
  });

  return (await applyPaymentRefundNotificationById(refund.id, notification)) ?? refund;
}

export async function getMerchantPaymentRefund(input: {
  merchantCode: string;
  refundReference: string;
  syncWithProvider?: boolean;
}) {
  const prisma = getPrismaClient();
  const merchant = await prisma.merchant.findUnique({
    where: {
      code: input.merchantCode,
    },
    select: {
      id: true,
    },
  });

  if (!merchant) {
    throw new AppError("MERCHANT_NOT_FOUND", `Merchant ${input.merchantCode} was not found.`, 404);
  }

  const refund = await prisma.paymentRefund.findFirst({
    where: {
      merchantId: merchant.id,
      OR: [{ id: input.refundReference }, { externalRefundId: input.refundReference }],
    },
    include: paymentRefundDetailInclude,
  });

  if (!refund) {
    throw new AppError(
      "REFUND_NOT_FOUND",
      `Refund ${input.refundReference} was not found for merchant ${input.merchantCode}.`,
      404,
    );
  }

  if (input.syncWithProvider === false) {
    return refund;
  }

  return syncPaymentRefundFromProvider(refund);
}

export interface CreateMerchantPaymentRefundInput {
  merchantCode: string;
  orderReference: string;
  externalRefundId: string;
  apiCredentialId?: string | null;
  amount: string;
  reason?: string | null;
  metadata?: Record<string, unknown>;
}

export async function createMerchantPaymentRefund(input: CreateMerchantPaymentRefundInput) {
  const prisma = getPrismaClient();
  let order = await getMerchantPaymentOrderByReference({
    merchantCode: input.merchantCode,
    orderReference: input.orderReference,
  });

  if (order.status !== PaymentStatus.SUCCEEDED) {
    order = await syncPaymentOrderFromProvider(order);
  }

  if (order.status !== PaymentStatus.SUCCEEDED) {
    throw new AppError(
      "ORDER_NOT_REFUNDABLE",
      `Order ${order.externalOrderId} has not been paid successfully and cannot be refunded.`,
      409,
    );
  }

  let existingRefund = await prisma.paymentRefund.findUnique({
    where: {
      merchantId_externalRefundId: {
        merchantId: order.merchantId,
        externalRefundId: input.externalRefundId,
      },
    },
    include: paymentRefundDetailInclude,
  });

  if (existingRefund) {
    assertExistingRefundMatches(existingRefund, {
      orderId: order.id,
      amount: input.amount,
      reason: input.reason,
    });

    existingRefund = await syncPaymentRefundFromProvider(existingRefund);

    if (existingRefund.status !== PaymentRefundStatus.FAILED) {
      return {
        created: false,
        refund: existingRefund,
        order,
      };
    }
  }

  const reservedAmount = await getReservedRefundAmount(order.id, existingRefund?.id);
  const availableAmount = toAmountNumber(order.amount) - reservedAmount;
  assertRefundAmount(input.amount, availableAmount);

  const provider = getPaymentProvider(order.channelCode);

  if (!provider?.createRefund) {
    throw new AppError(
      "CHANNEL_REFUND_UNSUPPORTED",
      `Channel ${order.channelCode} does not support refunds.`,
      422,
    );
  }

  const providerAccount = await requireMerchantRuntimeAccount({
    id: order.id,
    merchantChannelAccountId: order.merchantChannelAccountId,
    paymentOrder: {
      merchantChannelAccountId: order.merchantChannelAccountId,
    },
  });

  let refund =
    existingRefund ??
    (await prisma.paymentRefund.create({
      data: {
        merchantId: order.merchantId,
        paymentOrderId: order.id,
        providerAccountId: null,
        merchantChannelAccountId: order.merchantChannelAccountId,
        apiCredentialId: input.apiCredentialId ?? null,
        externalRefundId: input.externalRefundId,
        amount: input.amount,
        feeAmount: "0.00",
        netAmountImpact: formatStoredMoney(input.amount),
        currency: order.currency,
        status: PaymentRefundStatus.PENDING,
        reason: input.reason ?? null,
        metadata: toJsonValue(input.metadata),
      },
      include: paymentRefundDetailInclude,
    }));

  if (existingRefund) {
    refund =
      (await prisma.paymentRefund.update({
        where: {
          id: existingRefund.id,
        },
        data: {
          amount: input.amount,
          feeAmount: "0.00",
          netAmountImpact: formatStoredMoney(input.amount),
          currency: order.currency,
          status: PaymentRefundStatus.PENDING,
          providerStatus: null,
          providerRefundId: null,
          reason: input.reason ?? null,
          metadata: toJsonValue(input.metadata),
          failureCode: null,
          failureMessage: null,
          refundedAt: null,
          apiCredentialId: input.apiCredentialId ?? existingRefund.apiCredentialId,
          providerAccountId: null,
          merchantChannelAccountId: order.merchantChannelAccountId,
        },
        include: paymentRefundDetailInclude,
      })) ?? refund;
  }

  try {
    const notification = await provider.createRefund({
      orderId: order.id,
      gatewayOrderId: order.gatewayOrderId,
      refundId: refund.externalRefundId,
      refundAmount: input.amount,
      merchant: order.merchant,
      amount: order.amount.toString(),
      currency: order.currency,
      subject: order.subject,
      description: order.description,
      reason: input.reason,
      metadata: input.metadata,
      account: providerAccount,
    });
    const updatedRefund = await applyPaymentRefundNotificationById(refund.id, notification);

    if (!updatedRefund) {
      throw new AppError("REFUND_NOT_FOUND", "refund not found after provider update", 404);
    }

    return {
      created: !existingRefund,
      refund: updatedRefund,
      order,
    };
  } catch (error) {
    await prisma.paymentRefund.update({
      where: {
        id: refund.id,
      },
      data: {
        status: PaymentRefundStatus.FAILED,
        providerStatus: "REFUND_CREATE_FAILED",
        failureCode: "REFUND_CREATE_FAILED",
        failureMessage: error instanceof Error ? error.message : "Unknown provider error",
      },
    });

    throw error;
  }
}
