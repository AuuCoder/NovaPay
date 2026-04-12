import type { MerchantPaymentOrder } from "@/lib/orders/service";
import type { MerchantPaymentRefund } from "@/lib/refunds/service";
import { PaymentRefundStatus } from "@/generated/prisma/enums";
import { formatStoredRate } from "@/lib/finance/calculations";
import { isRecord } from "@/lib/payments/utils";

function sanitizeProviderPayload(value: unknown) {
  if (!isRecord(value)) {
    return null;
  }

  const safePayload = { ...value };
  delete safePayload.notify;
  return safePayload;
}

function sumRefundAmount(
  refunds: Array<{
    amount: { toString(): string };
    status: PaymentRefundStatus;
  }>,
  statuses: PaymentRefundStatus[],
) {
  return refunds
    .filter((refund) => statuses.includes(refund.status))
    .reduce((total, refund) => total + Number(refund.amount.toString()), 0);
}

function formatStoredAmount(value: { toString(): string }) {
  return Number(value.toString()).toFixed(2);
}

export function serializePaymentOrder(
  order: MerchantPaymentOrder,
  options?: {
    hostedCheckoutUrl?: string | null;
  },
) {
  const providerPayload = sanitizeProviderPayload(order.channelPayload);
  const totalRequestedRefundAmount = sumRefundAmount(order.refunds, [
    PaymentRefundStatus.PENDING,
    PaymentRefundStatus.PROCESSING,
    PaymentRefundStatus.SUCCEEDED,
  ]);
  const totalRefundedAmount = sumRefundAmount(order.refunds, [PaymentRefundStatus.SUCCEEDED]);
  const refundableAmount = Math.max(Number(order.amount.toString()) - totalRequestedRefundAmount, 0);
  const paymentMode =
    providerPayload && typeof providerPayload.mode === "string" ? providerPayload.mode : null;
  const channelAccountSource = order.merchantChannelAccountId ? "merchant" : null;

  return {
    id: order.id,
    merchantCode: order.merchant.code,
    externalOrderId: order.externalOrderId,
    channelCode: order.channelCode,
    amount: formatStoredAmount(order.amount),
    feeRate: formatStoredRate(order.feeRateSnapshot),
    feeAmount: formatStoredAmount(order.feeAmount),
    netAmount: formatStoredAmount(order.netAmount),
    currency: order.currency,
    subject: order.subject,
    description: order.description,
    status: order.status,
    providerStatus: order.providerStatus,
    gatewayOrderId: order.gatewayOrderId,
    checkoutUrl: order.checkoutUrl,
    hostedCheckoutUrl: options?.hostedCheckoutUrl ?? null,
    paymentMode,
    callbackStatus: order.callbackStatus,
    merchantChannelAccountId: order.merchantChannelAccountId,
    channelAccountSource,
    providerPayload,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
    expireAt: order.expireAt,
    paidAt: order.paidAt,
    completedAt: order.completedAt,
    refundSummary: {
      totalRequestedAmount: totalRequestedRefundAmount.toFixed(2),
      totalRefundedAmount: totalRefundedAmount.toFixed(2),
      refundableAmount: refundableAmount.toFixed(2),
    },
  };
}

export function serializePaymentRefund(refund: MerchantPaymentRefund) {
  const channelAccountSource =
    refund.merchantChannelAccountId ?? refund.paymentOrder.merchantChannelAccountId
      ? "merchant"
      : null;

  return {
    id: refund.id,
    merchantCode: refund.merchant.code,
    paymentOrderId: refund.paymentOrderId,
    externalOrderId: refund.paymentOrder.externalOrderId,
    channelCode: refund.paymentOrder.channelCode,
    externalRefundId: refund.externalRefundId,
    amount: formatStoredAmount(refund.amount),
    feeAmount: formatStoredAmount(refund.feeAmount),
    netAmountImpact: formatStoredAmount(refund.netAmountImpact),
    currency: refund.currency,
    status: refund.status,
    providerStatus: refund.providerStatus,
    providerRefundId: refund.providerRefundId,
    gatewayOrderId: refund.paymentOrder.gatewayOrderId,
    merchantChannelAccountId:
      refund.merchantChannelAccountId ?? refund.paymentOrder.merchantChannelAccountId,
    channelAccountSource,
    reason: refund.reason,
    failureCode: refund.failureCode,
    failureMessage: refund.failureMessage,
    metadata: isRecord(refund.metadata) ? refund.metadata : refund.metadata ?? null,
    createdAt: refund.createdAt,
    updatedAt: refund.updatedAt,
    refundedAt: refund.refundedAt,
  };
}
