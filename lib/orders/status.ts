import { CallbackDeliveryStatus, PaymentStatus } from "@/generated/prisma/enums";

export function isTerminalPaymentStatus(status: PaymentStatus) {
  return (
    status === PaymentStatus.SUCCEEDED ||
    status === PaymentStatus.FAILED ||
    status === PaymentStatus.CANCELLED
  );
}

export function statusFromCreatePayment(resultStatus: "requires_action" | "processing") {
  return resultStatus === "processing" ? PaymentStatus.PROCESSING : PaymentStatus.PENDING;
}

function isFailureProviderStatus(providerStatus: string) {
  return /(FAIL|ERROR|CLOSE|CANCEL)/i.test(providerStatus);
}

function isPendingProviderStatus(providerStatus: string) {
  return /(WAIT|PEND|BUYER_PAY|USERPAYING|PROCESS|NOTPAY)/i.test(providerStatus);
}

export function resolvePaymentStatusFromNotification(
  currentStatus: PaymentStatus,
  providerStatus: string,
  succeeds: boolean,
) {
  if (succeeds) {
    return PaymentStatus.SUCCEEDED;
  }

  if (/CLOSE|CANCEL|EXPIRE/i.test(providerStatus)) {
    return currentStatus === PaymentStatus.SUCCEEDED ? currentStatus : PaymentStatus.CANCELLED;
  }

  if (isFailureProviderStatus(providerStatus)) {
    return isTerminalPaymentStatus(currentStatus) ? currentStatus : PaymentStatus.FAILED;
  }

  if (isPendingProviderStatus(providerStatus)) {
    return isTerminalPaymentStatus(currentStatus) ? currentStatus : PaymentStatus.PROCESSING;
  }

  return isTerminalPaymentStatus(currentStatus) ? currentStatus : PaymentStatus.PROCESSING;
}

export function shouldDispatchMerchantCallback(status: PaymentStatus) {
  return (
    status === PaymentStatus.SUCCEEDED ||
    status === PaymentStatus.FAILED ||
    status === PaymentStatus.CANCELLED
  );
}

export function getInitialCallbackStatus(hasCallbackTarget: boolean) {
  return hasCallbackTarget ? CallbackDeliveryStatus.PENDING : CallbackDeliveryStatus.NOT_REQUIRED;
}
