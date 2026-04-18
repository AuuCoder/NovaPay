import type { Locale } from "@/lib/i18n";

export function getPaymentChannelOptions(locale: Locale = "zh") {
  return locale === "en"
    ? [
        {
          code: "alipay.page",
          providerKey: "alipay",
          title: "Alipay Web Payment",
          detail: "Redirects the shopper to the Alipay cashier for desktop payment flows.",
        },
        {
          code: "wxpay.native",
          providerKey: "wxpay",
          title: "WeChat Native QR",
          detail: "Returns a `code_url` for the frontend to render as a QR code.",
        },
        {
          code: "usdt.bsc",
          providerKey: "crypto",
          title: "USDT on BSC",
          detail: "Merchant-owned BSC USDT receiving address with hosted checkout, quote lock, and on-chain matching.",
        },
        {
          code: "usdt.base",
          providerKey: "crypto",
          title: "USDT on Base",
          detail: "Merchant-owned Base USDT receiving address with hosted checkout, quote lock, and on-chain matching.",
        },
        {
          code: "usdt.sol",
          providerKey: "crypto",
          title: "USDT on Solana",
          detail: "Merchant-owned Solana USDT receiving address with hosted checkout, quote lock, and on-chain matching.",
        },
      ]
    : [
        {
          code: "alipay.page",
          providerKey: "alipay",
          title: "支付宝网页支付",
          detail: "跳转支付宝收银台，适合桌面端支付流程。",
        },
        {
          code: "wxpay.native",
          providerKey: "wxpay",
          title: "微信 Native 扫码",
          detail: "返回 code_url，前端需渲染二维码供扫码支付。",
        },
        {
          code: "usdt.bsc",
          providerKey: "crypto",
          title: "USDT · BSC",
          detail: "商户自有 BSC 链 USDT 收款地址，已支持托管收银页、锁价和链上到账匹配。",
        },
        {
          code: "usdt.base",
          providerKey: "crypto",
          title: "USDT · Base",
          detail: "商户自有 Base 链 USDT 收款地址，已支持托管收银页、锁价和链上到账匹配。",
        },
        {
          code: "usdt.sol",
          providerKey: "crypto",
          title: "USDT · Solana",
          detail: "商户自有 Solana 链 USDT 收款地址，已支持托管收银页、锁价和链上到账匹配。",
        },
      ];
}

export type SearchParamsInput =
  | Promise<Record<string, string | string[] | undefined>>
  | Record<string, string | string[] | undefined>
  | undefined;

export type BadgeTone = "neutral" | "success" | "warning" | "danger" | "info";

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export function parsePageParam(value: string | null | undefined) {
  const numeric = Number(value);

  if (!Number.isInteger(numeric) || numeric < 1) {
    return 1;
  }

  return numeric;
}

export function getPaginationState(totalCount: number, requestedPage: number, pageSize: number) {
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const currentPage = Math.min(Math.max(requestedPage, 1), totalPages);
  const offset = (currentPage - 1) * pageSize;
  const pageStart = totalCount === 0 ? 0 : offset + 1;
  const pageEnd = totalCount === 0 ? 0 : Math.min(offset + pageSize, totalCount);

  return {
    totalPages,
    currentPage,
    offset,
    pageStart,
    pageEnd,
  };
}

export function buildPageHref(
  basePath: string,
  filters: Record<string, string | number | null | undefined>,
  page: number,
) {
  const params = new URLSearchParams();

  for (const [key, rawValue] of Object.entries(filters)) {
    if (rawValue === null || rawValue === undefined) {
      continue;
    }

    if (typeof rawValue === "number") {
      if (Number.isFinite(rawValue) && rawValue > 0) {
        params.set(key, String(rawValue));
      }
      continue;
    }

    const value = rawValue.trim();

    if (value) {
      params.set(key, value);
    }
  }

  if (page > 1) {
    params.set("page", String(page));
  }

  const query = params.toString();
  return query ? `${basePath}?${query}` : basePath;
}

export async function readPageMessages(searchParams: SearchParamsInput) {
  const resolved = (await searchParams) ?? {};

  return {
    success: firstValue(resolved.success) ?? null,
    error: firstValue(resolved.error) ?? null,
  };
}

export async function readSearchFilters(
  searchParams: SearchParamsInput,
  keys: string[],
) {
  const resolved = (await searchParams) ?? {};

  return Object.fromEntries(
    keys.map((key) => [key, firstValue(resolved[key])?.trim() ?? ""]),
  ) as Record<string, string>;
}

export function formatDateTime(
  value: Date | string | null | undefined,
  locale: Locale = "zh",
) {
  if (!value) {
    return "—";
  }

  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return new Intl.DateTimeFormat(locale === "en" ? "en-US" : "zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function formatMoney(
  value: number | string | null | undefined,
  currency = "CNY",
  locale: Locale = "zh",
) {
  if (value === null || value === undefined || value === "") {
    return "—";
  }

  const numeric = Number(value);

  if (!Number.isFinite(numeric)) {
    return "—";
  }

  return new Intl.NumberFormat(locale === "en" ? "en-US" : "zh-CN", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(numeric);
}

export function prettyJson(value: unknown) {
  if (value === null || value === undefined) {
    return "";
  }

  return JSON.stringify(value, null, 2);
}

export function getPaymentStatusTone(status: string | null | undefined): BadgeTone {
  if (!status) {
    return "neutral";
  }

  if (status === "SUCCEEDED") {
    return "success";
  }

  if (status === "FAILED" || status === "CANCELLED") {
    return "danger";
  }

  if (status === "PROCESSING") {
    return "info";
  }

  return "warning";
}

export function getCallbackStatusTone(status: string | null | undefined): BadgeTone {
  if (!status) {
    return "neutral";
  }

  if (status === "DELIVERED") {
    return "success";
  }

  if (status === "FAILED") {
    return "danger";
  }

  if (status === "PROCESSING") {
    return "info";
  }

  if (status === "PENDING") {
    return "warning";
  }

  return "neutral";
}

export function getAttemptStatusTone(status: string | null | undefined): BadgeTone {
  if (status === "SUCCEEDED") {
    return "success";
  }

  if (status === "FAILED") {
    return "danger";
  }

  return "neutral";
}

export function getRefundStatusTone(status: string | null | undefined): BadgeTone {
  if (!status) {
    return "neutral";
  }

  if (status === "SUCCEEDED") {
    return "success";
  }

  if (status === "FAILED") {
    return "danger";
  }

  if (status === "PENDING" || status === "PROCESSING") {
    return "warning";
  }

  return "neutral";
}

export function getMerchantStatusTone(status: string | null | undefined): BadgeTone {
  if (!status) {
    return "neutral";
  }

  if (status === "APPROVED") {
    return "success";
  }

  if (status === "PENDING") {
    return "warning";
  }

  if (status === "REJECTED") {
    return "danger";
  }

  if (status === "SUSPENDED") {
    return "info";
  }

  return "neutral";
}

export function getPaymentStatusLabel(status: string | null | undefined, locale: Locale = "zh") {
  switch (status) {
    case "PENDING":
      return locale === "en" ? "Pending" : "待支付";
    case "PROCESSING":
      return locale === "en" ? "Processing" : "处理中";
    case "SUCCEEDED":
      return locale === "en" ? "Succeeded" : "已成功";
    case "FAILED":
      return locale === "en" ? "Failed" : "已失败";
    case "CANCELLED":
      return locale === "en" ? "Cancelled" : "已关闭";
    default:
      return locale === "en" ? status || "Unknown" : status || "未知状态";
  }
}

export function getCallbackStatusLabel(status: string | null | undefined, locale: Locale = "zh") {
  switch (status) {
    case "NOT_REQUIRED":
      return locale === "en" ? "Not Required" : "无需回调";
    case "PENDING":
      return locale === "en" ? "Pending" : "待处理";
    case "PROCESSING":
      return locale === "en" ? "Processing" : "处理中";
    case "DELIVERED":
      return locale === "en" ? "Delivered" : "已投递";
    case "FAILED":
      return locale === "en" ? "Failed" : "已失败";
    default:
      return locale === "en" ? status || "Unknown" : status || "未知状态";
  }
}

export function getAttemptStatusLabel(status: string | null | undefined, locale: Locale = "zh") {
  switch (status) {
    case "SUCCEEDED":
      return locale === "en" ? "Succeeded" : "成功";
    case "FAILED":
      return locale === "en" ? "Failed" : "失败";
    default:
      return locale === "en" ? status || "Unknown" : status || "未知状态";
  }
}

export function getRefundStatusLabel(status: string | null | undefined, locale: Locale = "zh") {
  switch (status) {
    case "PENDING":
      return locale === "en" ? "Pending" : "待处理";
    case "PROCESSING":
      return locale === "en" ? "Processing" : "处理中";
    case "SUCCEEDED":
      return locale === "en" ? "Succeeded" : "已成功";
    case "FAILED":
      return locale === "en" ? "Failed" : "已失败";
    default:
      return locale === "en" ? status || "Unknown" : status || "未知状态";
  }
}

export function getIdempotencyStatusTone(status: string | null | undefined): BadgeTone {
  if (!status) {
    return "neutral";
  }

  if (status === "SUCCEEDED") {
    return "success";
  }

  if (status === "PROCESSING") {
    return "info";
  }

  if (status === "FAILED_RETRYABLE") {
    return "warning";
  }

  if (status === "FAILED_FINAL") {
    return "danger";
  }

  return "neutral";
}

export function getIdempotencyStatusLabel(
  status: string | null | undefined,
  locale: Locale = "zh",
) {
  switch (status) {
    case "PROCESSING":
      return locale === "en" ? "Processing" : "处理中";
    case "SUCCEEDED":
      return locale === "en" ? "Succeeded" : "已成功";
    case "FAILED_FINAL":
      return locale === "en" ? "Final Failure" : "最终失败";
    case "FAILED_RETRYABLE":
      return locale === "en" ? "Retryable Failure" : "可重试失败";
    default:
      return locale === "en" ? status || "Unknown" : status || "未知状态";
  }
}

export function getIdempotencyScopeLabel(scope: string | null | undefined, locale: Locale = "zh") {
  switch (scope) {
    case "payment_order.create":
      return locale === "en" ? "Create Payment Order" : "创建支付订单";
    case "payment_order.close":
      return locale === "en" ? "Close Payment Order" : "关闭支付订单";
    case "payment_refund.create":
      return locale === "en" ? "Create Refund" : "创建退款";
    default:
      return locale === "en" ? scope || "Unknown Scope" : scope || "未知作用域";
  }
}

export function getMerchantStatusLabel(
  status: string | null | undefined,
  locale: Locale = "zh",
) {
  switch (status) {
    case "PENDING":
      return locale === "en" ? "Pending Review" : "待审核";
    case "APPROVED":
      return locale === "en" ? "Approved" : "已通过";
    case "REJECTED":
      return locale === "en" ? "Rejected" : "已拒绝";
    case "SUSPENDED":
      return locale === "en" ? "Suspended" : "已暂停";
    default:
      return locale === "en" ? status || "Unknown" : status || "未知状态";
  }
}

export function getSettlementStatusTone(status: string | null | undefined): BadgeTone {
  if (!status) {
    return "neutral";
  }

  if (status === "PAID") {
    return "success";
  }

  if (status === "FAILED") {
    return "danger";
  }

  if (status === "PROCESSING") {
    return "info";
  }

  if (status === "PENDING") {
    return "warning";
  }

  return "neutral";
}

export function getSettlementStatusLabel(
  status: string | null | undefined,
  locale: Locale = "zh",
) {
  switch (status) {
    case "PENDING":
      return locale === "en" ? "Pending" : "待处理";
    case "PROCESSING":
      return locale === "en" ? "Processing" : "处理中";
    case "PAID":
      return locale === "en" ? "Paid" : "已打款";
    case "FAILED":
      return locale === "en" ? "Failed" : "失败";
    default:
      return locale === "en" ? status || "Unknown" : status || "未知状态";
  }
}
