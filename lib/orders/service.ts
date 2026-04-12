import type { Prisma } from "@/generated/prisma/client";
import { CallbackDeliveryStatus, PaymentStatus } from "@/generated/prisma/enums";
import { dispatchMerchantCallback } from "@/lib/callbacks/service";
import { AppError } from "@/lib/errors";
import { calculatePaymentFeeSnapshot } from "@/lib/finance/calculations";
import { syncPaymentOrderLedgerEntries } from "@/lib/finance/ledger";
import { getMerchantProfileMissingFieldsForChannel } from "@/lib/merchant-profile-completion";
import { getPaymentProvider } from "@/lib/payments/registry";
import {
  getPaymentRuntimeAccountBySelection,
  selectProviderAccountForOrder,
} from "@/lib/payments/provider-accounts";
import { getPrismaClient } from "@/lib/prisma";
import type { PaymentNotification } from "@/lib/payments/types";
import {
  getInitialCallbackStatus,
  isTerminalPaymentStatus,
  resolvePaymentStatusFromNotification,
  shouldDispatchMerchantCallback,
  statusFromCreatePayment,
} from "@/lib/orders/status";
import { getSystemConfig } from "@/lib/system-config";
import { isRecord } from "@/lib/payments/utils";

const paymentOrderDetailInclude = {
  merchant: true,
  refunds: {
    orderBy: {
      createdAt: "asc",
    },
  },
} satisfies Prisma.PaymentOrderInclude;

export type MerchantPaymentOrder = Prisma.PaymentOrderGetPayload<{
  include: typeof paymentOrderDetailInclude;
}>;

async function requireMerchantRuntimeAccount(order: {
  id: string;
  channelCode: string;
  merchantChannelAccountId: string | null;
}) {
  if (!order.merchantChannelAccountId) {
    throw new AppError(
      "LEGACY_PLATFORM_ACCOUNT_UNSUPPORTED",
      `Order ${order.id} is not linked to a merchant-owned channel instance.`,
      422,
    );
  }

  const account = await getPaymentRuntimeAccountBySelection({
    merchantChannelAccountId: order.merchantChannelAccountId,
  });

  if (!account) {
    throw new AppError(
      "CHANNEL_ACCOUNT_NOT_FOUND",
      `Merchant channel account ${order.merchantChannelAccountId} was not found for order ${order.id}.`,
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

function getCallbackTarget(order: {
  callbackUrl: string | null;
  merchant: { callbackBase: string | null; callbackEnabled: boolean };
}) {
  if (!order.merchant.callbackEnabled) {
    return null;
  }

  return order.callbackUrl ?? order.merchant.callbackBase;
}

function assertAmountMatches(expected: { toString(): string }, actual?: string) {
  if (!actual) {
    return;
  }

  const expectedAmount = Number(expected.toString());
  const actualAmount = Number(actual);

  if (!Number.isFinite(actualAmount)) {
    throw new AppError("INVALID_AMOUNT", "Notification amount is invalid.", 400);
  }

  if (Math.abs(expectedAmount - actualAmount) > 0.01) {
    throw new AppError("AMOUNT_MISMATCH", "Notification amount does not match the order.", 409);
  }
}

function assertMerchantCanCreateOrders(merchant: { code: string; status: string }) {
  if (merchant.status === "APPROVED") {
    return;
  }

  if (merchant.status === "PENDING") {
    throw new AppError(
      "MERCHANT_PENDING_REVIEW",
      `Merchant ${merchant.code} is pending approval.`,
      403,
    );
  }

  if (merchant.status === "REJECTED") {
    throw new AppError(
      "MERCHANT_REJECTED",
      `Merchant ${merchant.code} has been rejected.`,
      403,
    );
  }

  if (merchant.status === "SUSPENDED") {
    throw new AppError(
      "MERCHANT_SUSPENDED",
      `Merchant ${merchant.code} is suspended.`,
      403,
    );
  }
}

function assertMerchantProfileReadyForOrders(merchant: {
  code: string;
  name: string;
  legalName: string | null;
  contactName: string | null;
  contactPhone: string | null;
  companyRegistrationId: string | null;
}, channelCode: string) {
  const missingFields = getMerchantProfileMissingFieldsForChannel(merchant, channelCode, "en");

  if (missingFields.length === 0) {
    return;
  }

  throw new AppError(
    "MERCHANT_PROFILE_INCOMPLETE",
    `Merchant ${merchant.code} must complete its profile before using regulated channel ${channelCode}. Missing: ${missingFields.join(", ")}.`,
    403,
  );
}

export interface CreatePaymentOrderInput {
  merchantCode: string;
  channelCode: string;
  externalOrderId: string;
  apiCredentialId?: string | null;
  amount: string;
  currency: string;
  subject: string;
  clientIp?: string | null;
  description?: string | null;
  returnUrl?: string | null;
  callbackUrl?: string | null;
  metadata?: Record<string, unknown>;
}

async function loadPaymentOrderById(id: string) {
  const prisma = getPrismaClient();
  return prisma.paymentOrder.findUnique({
    where: {
      id,
    },
    include: paymentOrderDetailInclude,
  });
}

function toPaymentOperationInput(order: MerchantPaymentOrder) {
  return {
    orderId: order.id,
    gatewayOrderId: order.gatewayOrderId,
    merchant: order.merchant,
    amount: order.amount.toString(),
    currency: order.currency,
    subject: order.subject,
    description: order.description,
    metadata: isRecord(order.metadata) ? order.metadata : undefined,
  };
}

export async function getMerchantPaymentOrderByReference(input: {
  merchantCode: string;
  orderReference: string;
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

  const order = await prisma.paymentOrder.findFirst({
    where: {
      merchantId: merchant.id,
      OR: [{ id: input.orderReference }, { externalOrderId: input.orderReference }],
    },
    include: paymentOrderDetailInclude,
  });

  if (!order) {
    throw new AppError(
      "ORDER_NOT_FOUND",
      `Order ${input.orderReference} was not found for merchant ${input.merchantCode}.`,
      404,
    );
  }

  return order;
}

export async function syncPaymentOrderFromProvider(order: MerchantPaymentOrder) {
  const provider = getPaymentProvider(order.channelCode);

  if (!provider?.queryPayment) {
    return order;
  }

  const providerAccount = await requireMerchantRuntimeAccount(order);
  const notification = await provider.queryPayment({
    ...toPaymentOperationInput(order),
    account: providerAccount,
  });

  await applyPaymentNotification(notification);

  return (await loadPaymentOrderById(order.id)) ?? order;
}

export async function getMerchantPaymentOrder(input: {
  merchantCode: string;
  orderReference: string;
  syncWithProvider?: boolean;
}) {
  const order = await getMerchantPaymentOrderByReference(input);

  if (input.syncWithProvider === false) {
    return order;
  }

  return syncPaymentOrderFromProvider(order);
}

export async function closeMerchantPaymentOrder(input: {
  merchantCode: string;
  orderReference: string;
}) {
  let order = await getMerchantPaymentOrderByReference(input);

  if (!isTerminalPaymentStatus(order.status)) {
    order = await syncPaymentOrderFromProvider(order);
  }

  if (order.status === PaymentStatus.SUCCEEDED) {
    throw new AppError(
      "ORDER_ALREADY_PAID",
      `Order ${order.externalOrderId} has already been paid and cannot be closed.`,
      409,
    );
  }

  if (order.status === PaymentStatus.CANCELLED || order.status === PaymentStatus.FAILED) {
    return order;
  }

  const provider = getPaymentProvider(order.channelCode);

  if (!provider?.closePayment) {
    throw new AppError(
      "CHANNEL_CLOSE_UNSUPPORTED",
      `Channel ${order.channelCode} does not support close payment.`,
      422,
    );
  }

  const providerAccount = await requireMerchantRuntimeAccount(order);
  const notification = await provider.closePayment({
    ...toPaymentOperationInput(order),
    account: providerAccount,
  });

  await applyPaymentNotification(notification);

  return (await loadPaymentOrderById(order.id)) ?? order;
}

export async function createPaymentOrder(input: CreatePaymentOrderInput) {
  const prisma = getPrismaClient();
  const provider = getPaymentProvider(input.channelCode);

  if (!provider) {
    throw new AppError(
      "UNSUPPORTED_CHANNEL",
      `Unsupported channelCode: ${input.channelCode}`,
      404,
    );
  }

  const merchant = await prisma.merchant.findUnique({
    where: {
      code: input.merchantCode,
    },
  });

  if (!merchant) {
    throw new AppError(
      "MERCHANT_NOT_FOUND",
      `Merchant ${input.merchantCode} was not found.`,
      404,
    );
  }

  assertMerchantCanCreateOrders(merchant);
  assertMerchantProfileReadyForOrders(merchant, input.channelCode);

  const existingOrder = await prisma.paymentOrder.findUnique({
    where: {
      merchantId_externalOrderId: {
        merchantId: merchant.id,
        externalOrderId: input.externalOrderId,
      },
    },
  });

  if (existingOrder) {
    if (existingOrder.channelCode !== input.channelCode) {
      throw new AppError(
        "ORDER_CHANNEL_CONFLICT",
        `Order ${input.externalOrderId} already exists on channel ${existingOrder.channelCode}.`,
        409,
      );
    }

    return {
      created: false,
      merchant,
      order: existingOrder,
      payment: null,
    };
  }

  const route = await selectProviderAccountForOrder({
    merchantId: merchant.id,
    channelCode: input.channelCode,
    amount: input.amount,
  });
  const providerAccount = route.account;
  const feeSnapshot = calculatePaymentFeeSnapshot({
    amount: input.amount,
    feeRate: route.feeRate,
  });

  if (!provider.isConfigured(providerAccount)) {
    throw new AppError(
      "CHANNEL_NOT_CONFIGURED",
      `Channel ${input.channelCode} is not configured for this merchant. Create and enable a merchant-owned channel instance first.`,
      422,
    );
  }

  const expireMinutes = Number((await getSystemConfig("PAYMENT_EXPIRE_MINUTES")) ?? 30);
  const expireAt = new Date(Date.now() + expireMinutes * 60_000);

  const order = await prisma.paymentOrder.create({
    data: {
      merchantId: merchant.id,
      channelCode: input.channelCode,
      externalOrderId: input.externalOrderId,
      providerAccountId: null,
      merchantChannelAccountId: providerAccount?.id ?? null,
      apiCredentialId: input.apiCredentialId ?? null,
      subject: input.subject,
      description: input.description,
      amount: input.amount,
      feeRateSnapshot: feeSnapshot.feeRate,
      feeAmount: feeSnapshot.feeAmount,
      netAmount: feeSnapshot.netAmount,
      currency: input.currency,
      status: PaymentStatus.PENDING,
      callbackUrl: input.callbackUrl ?? merchant.callbackBase,
      returnUrl: input.returnUrl,
      metadata: toJsonValue(input.metadata),
      callbackStatus: CallbackDeliveryStatus.NOT_REQUIRED,
      expireAt,
    },
  });

  try {
    const payment = await provider.createPayment({
      orderId: order.id,
      merchant,
      amount: input.amount,
      currency: input.currency,
      subject: input.subject,
      clientIp: input.clientIp,
      description: input.description,
      notifyUrl: route.notifyUrl,
      returnUrl: input.returnUrl,
      expireAt,
      metadata: input.metadata,
      account: providerAccount,
    });

    const updatedOrder = await prisma.paymentOrder.update({
      where: {
        id: order.id,
      },
      data: {
        status: statusFromCreatePayment(payment.status),
        gatewayOrderId: payment.gatewayOrderId,
        providerStatus: payment.providerStatus,
        checkoutUrl: payment.checkoutUrl,
        channelPayload: toJsonValue({
          mode: payment.mode,
          ...payment.providerPayload,
        }),
      },
    });

    return {
      created: true,
      merchant,
      order: updatedOrder,
      payment,
    };
  } catch (error) {
    await prisma.paymentOrder.update({
      where: {
        id: order.id,
      },
      data: {
        status: PaymentStatus.FAILED,
        providerStatus: "CREATE_FAILED",
        failureCode: "CREATE_FAILED",
        failureMessage: error instanceof Error ? error.message : "Unknown provider error",
        channelPayload: toJsonValue({
          error: error instanceof Error ? error.message : "Unknown provider error",
        }),
      },
    });

    throw error;
  }
}

export async function applyPaymentNotification(notification: PaymentNotification) {
  const prisma = getPrismaClient();
  const order = await prisma.paymentOrder.findUnique({
    where: {
      id: notification.orderId,
    },
    include: {
      merchant: true,
    },
  });

  if (!order) {
    throw new AppError("ORDER_NOT_FOUND", "order not found", 404);
  }

  assertAmountMatches(order.amount, notification.amount);

  const nextStatus = resolvePaymentStatusFromNotification(
    order.status,
    notification.providerStatus,
    notification.succeeds,
  );
  const callbackTarget = getCallbackTarget(order);
  const nextPayload = isRecord(order.channelPayload) ? order.channelPayload : {};
  const shouldQueueCallback =
    shouldDispatchMerchantCallback(nextStatus) && Boolean(callbackTarget);
  const now = new Date();

  const updatedOrder = await prisma.paymentOrder.update({
    where: {
      id: order.id,
    },
    data: {
      status: nextStatus,
      providerStatus: notification.providerStatus,
      gatewayOrderId: notification.gatewayOrderId ?? order.gatewayOrderId,
      paidAt: notification.succeeds ? notification.paidAt ?? order.paidAt ?? now : order.paidAt,
      completedAt:
        nextStatus === PaymentStatus.SUCCEEDED ||
        nextStatus === PaymentStatus.FAILED ||
        nextStatus === PaymentStatus.CANCELLED
          ? order.completedAt ?? now
          : order.completedAt,
      failureCode:
        nextStatus === PaymentStatus.FAILED || nextStatus === PaymentStatus.CANCELLED
          ? notification.providerStatus
          : null,
      failureMessage:
        nextStatus === PaymentStatus.FAILED || nextStatus === PaymentStatus.CANCELLED
          ? `Provider status: ${notification.providerStatus}`
          : null,
      callbackStatus: shouldQueueCallback
        ? order.callbackStatus === CallbackDeliveryStatus.DELIVERED
          ? CallbackDeliveryStatus.DELIVERED
          : getInitialCallbackStatus(Boolean(callbackTarget))
        : callbackTarget
          ? order.callbackStatus
          : CallbackDeliveryStatus.NOT_REQUIRED,
      nextCallbackAt:
        shouldQueueCallback && order.callbackStatus !== CallbackDeliveryStatus.DELIVERED
          ? now
          : order.nextCallbackAt,
      channelPayload: toJsonValue({
        ...nextPayload,
        notify: notification.rawPayload,
      }),
    },
  });

  if (shouldQueueCallback && updatedOrder.callbackStatus !== CallbackDeliveryStatus.DELIVERED) {
    await dispatchMerchantCallback(updatedOrder.id);
  }

  if (updatedOrder.status === PaymentStatus.SUCCEEDED) {
    await syncPaymentOrderLedgerEntries(updatedOrder.id);
  }

  return updatedOrder;
}
