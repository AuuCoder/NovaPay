import { PaymentRefundStatus } from "@/generated/prisma/enums";

export function resolveRefundStatus(
  currentStatus: PaymentRefundStatus,
  providerStatus: string,
  succeeds: boolean,
) {
  if (succeeds) {
    return PaymentRefundStatus.SUCCEEDED;
  }

  if (/SUCCESS|FINISH/i.test(providerStatus)) {
    return PaymentRefundStatus.SUCCEEDED;
  }

  if (/PROCESS|PENDING|WAIT|ACCEPT/i.test(providerStatus)) {
    return currentStatus === PaymentRefundStatus.SUCCEEDED
      ? currentStatus
      : PaymentRefundStatus.PROCESSING;
  }

  if (/FAIL|CLOSE|CANCEL|ABNORMAL|ERROR/i.test(providerStatus)) {
    return currentStatus === PaymentRefundStatus.SUCCEEDED
      ? currentStatus
      : PaymentRefundStatus.FAILED;
  }

  return currentStatus === PaymentRefundStatus.SUCCEEDED
    ? currentStatus
    : PaymentRefundStatus.PROCESSING;
}
