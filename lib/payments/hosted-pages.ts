import { getOptionalUrl } from "@/lib/payments/utils";

const DEFAULT_PUBLIC_BASE_URL = "http://localhost:3000";

export function buildHostedPaymentReturnPath(orderId: string) {
  return `/pay/${orderId}/return`;
}

export function buildHostedPaymentReturnUrl(orderId: string) {
  const baseUrl = getOptionalUrl(process.env.NOVAPAY_PUBLIC_BASE_URL) ?? DEFAULT_PUBLIC_BASE_URL;
  return `${baseUrl}${buildHostedPaymentReturnPath(orderId)}`;
}
