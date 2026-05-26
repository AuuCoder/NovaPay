import type { PaymentCapability } from "@/lib/payments/types";

export function getCapabilityLabel(
  capability: PaymentCapability,
  locale: "zh" | "en",
) {
  const labels: Record<PaymentCapability, { zh: string; en: string }> = {
    page_redirect: { zh: "页面跳转", en: "Page Redirect" },
    native_qr: { zh: "原生二维码", en: "Native QR" },
    notify_callback: { zh: "异步通知", en: "Notify Callback" },
    return_url: { zh: "返回地址", en: "Return URL" },
    quote_lock: { zh: "锁价", en: "Quote Lock" },
    rsa2_signature: { zh: "RSA2 签名", en: "RSA2 Signature" },
    order_query: { zh: "查单", en: "Order Query" },
    order_close: { zh: "关单", en: "Order Close" },
    refund: { zh: "退款", en: "Refund" },
    refund_query: { zh: "退款查询", en: "Refund Query" },
  };

  return labels[capability]?.[locale] ?? capability;
}

export function getProviderKeyLabel(
  providerKey: string,
  locale: "zh" | "en",
) {
  const labels: Record<string, { zh: string; en: string }> = {
    alipay: { zh: "支付宝", en: "Alipay" },
    wxpay: { zh: "微信支付", en: "WeChat Pay" },
    crypto: { zh: "加密支付", en: "Crypto" },
    paypal: { zh: "PayPal", en: "PayPal" },
  };

  if (labels[providerKey]) {
    return labels[providerKey][locale];
  }

  return (
    providerKey
      .replace(/[_-]+/g, " ")
      .replace(/\b\w/g, (segment) => segment.toUpperCase()) || providerKey
  );
}

export function formatMarketplaceDate(value: Date | null, locale: "zh" | "en") {
  if (!value) {
    return "—";
  }

  return new Intl.DateTimeFormat(locale === "en" ? "en-US" : "zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(value);
}
