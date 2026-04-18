import { getPublicBaseUrl } from "@/lib/env";

export function buildHostedPaymentReturnPath(orderId: string) {
  return `/pay/${orderId}/return`;
}

export function buildHostedPaymentReturnUrl(orderId: string) {
  return `${getPublicBaseUrl()}${buildHostedPaymentReturnPath(orderId)}`;
}
