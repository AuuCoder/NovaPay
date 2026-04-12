import { createSign, createVerify } from "node:crypto";
import type {
  CreateRefundInput,
  PaymentNotification,
  PaymentProvider,
  PaymentRefundNotification,
  ProviderAccountConfig,
  QueryRefundInput,
} from "@/lib/payments/types";
import { buildHostedPaymentReturnUrl } from "@/lib/payments/hosted-pages";
import {
  buildSortedParamString,
  formatAmount,
  formatTimestamp,
  normalizePem,
} from "@/lib/payments/utils";

const ALIPAY_CODE = "alipay.page" as const;
const ALIPAY_PROVIDER = "alipay" as const;
const DEFAULT_GATEWAY_URL = "https://openapi.alipay.com/gateway.do";
const DEFAULT_PRODUCT_CODE = "FAST_INSTANT_TRADE_PAY";
const DEFAULT_REQUEST_TIMEOUT_MS = 10_000;

function getAccountValue(account: ProviderAccountConfig | null | undefined, keys: string[]) {
  if (!account) {
    return undefined;
  }

  for (const key of keys) {
    const value = account.config[key];

    if (value) {
      return value;
    }
  }

  return undefined;
}

function getConfigValue(
  account: ProviderAccountConfig | null | undefined,
  envKey: string,
  aliases: string[],
) {
  void envKey;
  return getAccountValue(account, aliases);
}

function getRequiredConfigValue(
  account: ProviderAccountConfig | null | undefined,
  envKey: string,
  aliases: string[],
) {
  const value = getConfigValue(account, envKey, aliases);

  if (!value) {
    throw new Error(`${envKey} is not configured in the merchant channel instance.`);
  }

  return value;
}

function getGatewayUrl(account?: ProviderAccountConfig | null) {
  return (
    getConfigValue(account, "ALIPAY_GATEWAY_URL", ["gatewayUrl", "ALIPAY_GATEWAY_URL"]) ??
    DEFAULT_GATEWAY_URL
  );
}

function getRequestTimeoutMs(account?: ProviderAccountConfig | null) {
  const rawValue = getConfigValue(account, "ALIPAY_REQUEST_TIMEOUT_MS", [
    "requestTimeoutMs",
    "ALIPAY_REQUEST_TIMEOUT_MS",
  ]);
  const numeric = Number(rawValue);

  return Number.isFinite(numeric) && numeric > 0 ? numeric : DEFAULT_REQUEST_TIMEOUT_MS;
}

function getNotifyUrl(account?: ProviderAccountConfig | null, inputNotifyUrl?: string | null) {
  void account;

  if (!inputNotifyUrl) {
    throw new Error("Merchant callback route is missing for Alipay channel instance.");
  }

  return inputNotifyUrl;
}

function signParameters(params: Record<string, string>, account?: ProviderAccountConfig | null) {
  const signer = createSign("RSA-SHA256");
  signer.update(buildSortedParamString(params), "utf8");
  signer.end();

  return signer.sign(
    normalizePem(
      getRequiredConfigValue(account, "ALIPAY_PRIVATE_KEY", [
        "privateKey",
        "ALIPAY_PRIVATE_KEY",
      ]),
      "private",
    ),
    "base64",
  );
}

function verifyParameters(
  params: Record<string, string>,
  signature: string,
  account?: ProviderAccountConfig | null,
) {
  const publicKey = getConfigValue(account, "ALIPAY_PUBLIC_KEY", [
    "publicKey",
    "ALIPAY_PUBLIC_KEY",
  ]);

  if (!publicKey) {
    throw new Error("ALIPAY_PUBLIC_KEY is not configured.");
  }

  const verifier = createVerify("RSA-SHA256");
  verifier.update(buildSortedParamString(params), "utf8");
  verifier.end();

  return verifier.verify(normalizePem(publicKey, "public"), signature, "base64");
}

function buildResponseKey(method: string) {
  return `${method.replace(/\./g, "_")}_response`;
}

function extractSignedResponsePayload(rawBody: string, method: string) {
  const key = `"${buildResponseKey(method)}":`;
  const start = rawBody.indexOf(key);

  if (start < 0) {
    throw new Error(`Alipay response is missing ${buildResponseKey(method)}.`);
  }

  let index = start + key.length;

  while (index < rawBody.length && /\s/.test(rawBody[index] ?? "")) {
    index += 1;
  }

  if (rawBody[index] !== "{") {
    throw new Error("Alipay signed response payload is malformed.");
  }

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let cursor = index; cursor < rawBody.length; cursor += 1) {
    const char = rawBody[cursor];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (char === "\\") {
      escaped = true;
      continue;
    }

    if (char === "\"") {
      inString = !inString;
      continue;
    }

    if (inString) {
      continue;
    }

    if (char === "{") {
      depth += 1;
      continue;
    }

    if (char === "}") {
      depth -= 1;

      if (depth === 0) {
        return rawBody.slice(index, cursor + 1);
      }
    }
  }

  throw new Error("Alipay signed response payload could not be extracted.");
}

function verifyResponseSignature(
  rawBody: string,
  method: string,
  signature: string,
  account?: ProviderAccountConfig | null,
) {
  const publicKey = getConfigValue(account, "ALIPAY_PUBLIC_KEY", [
    "publicKey",
    "ALIPAY_PUBLIC_KEY",
  ]);

  if (!publicKey) {
    throw new Error("ALIPAY_PUBLIC_KEY is not configured.");
  }

  const verifier = createVerify("RSA-SHA256");
  verifier.update(extractSignedResponsePayload(rawBody, method), "utf8");
  verifier.end();

  return verifier.verify(normalizePem(publicKey, "public"), signature, "base64");
}

function parseAlipayDate(value: unknown) {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  const normalized = value.trim().replace(" ", "T");
  const date = new Date(`${normalized}+08:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function getStringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function getResponseField(value: Record<string, unknown>, key: string) {
  const field = value[key];
  return typeof field === "string" ? field : null;
}

async function callAlipayApi(
  method: string,
  bizContent: Record<string, unknown>,
  account?: ProviderAccountConfig | null,
) {
  const params: Record<string, string> = {
    app_id: getRequiredConfigValue(account, "ALIPAY_APP_ID", ["appId", "ALIPAY_APP_ID"]),
    method,
    format: "JSON",
    charset: "UTF-8",
    sign_type: "RSA2",
    timestamp: formatTimestamp(),
    version: "1.0",
    biz_content: JSON.stringify(bizContent),
  };
  const gatewayUrl = getGatewayUrl(account);
  const body = new URLSearchParams({
    ...params,
    sign: signParameters(params, account),
  });
  const response = await fetch(gatewayUrl, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
    },
    body,
    signal: AbortSignal.timeout(getRequestTimeoutMs(account)),
  });
  const rawBody = await response.text();

  if (!rawBody.trim()) {
    throw new Error(`Alipay ${method} returned an empty response.`);
  }

  const parsedBody = JSON.parse(rawBody) as Record<string, unknown>;
  const responseKey = buildResponseKey(method);
  const responsePayload = parsedBody[responseKey];
  const signature = getStringValue(parsedBody.sign);

  if (!responsePayload || typeof responsePayload !== "object" || Array.isArray(responsePayload)) {
    throw new Error(`Alipay ${method} response payload is invalid.`);
  }

  if (!signature || !verifyResponseSignature(rawBody, method, signature, account)) {
    throw new Error(`Alipay ${method} response signature verification failed.`);
  }

  const payload = responsePayload as Record<string, unknown>;
  const code = getResponseField(payload, "code");

  if (!response.ok || code !== "10000") {
    const subCode = getResponseField(payload, "sub_code");
    const subMessage = getResponseField(payload, "sub_msg");
    const message = getResponseField(payload, "msg");
    throw new Error(
      `Alipay ${method} failed${subCode ? ` [${subCode}]` : ""}: ${
        subMessage ?? message ?? `HTTP ${response.status}`
      }`,
    );
  }

  return payload;
}

function toPaymentNotification(
  orderId: string,
  response: Record<string, unknown>,
): PaymentNotification {
  const providerStatus = getResponseField(response, "trade_status") ?? "UNKNOWN";

  return {
    orderId,
    gatewayOrderId: getResponseField(response, "trade_no"),
    providerStatus,
    amount: getResponseField(response, "total_amount") ?? undefined,
    paidAt: parseAlipayDate(response.send_pay_date),
    succeeds: providerStatus === "TRADE_SUCCESS" || providerStatus === "TRADE_FINISHED",
    rawPayload: response,
  };
}

function buildTradeLookupBizContent(orderId: string, gatewayOrderId?: string | null) {
  return gatewayOrderId ? { trade_no: gatewayOrderId } : { out_trade_no: orderId };
}

async function queryPayment(
  orderId: string,
  gatewayOrderId?: string | null,
  account?: ProviderAccountConfig | null,
) {
  const response = await callAlipayApi(
    "alipay.trade.query",
    buildTradeLookupBizContent(orderId, gatewayOrderId),
    account,
  );

  return toPaymentNotification(orderId, response);
}

async function closePayment(
  orderId: string,
  gatewayOrderId?: string | null,
  account?: ProviderAccountConfig | null,
) {
  const response = await callAlipayApi(
    "alipay.trade.close",
    buildTradeLookupBizContent(orderId, gatewayOrderId),
    account,
  );

  return {
    orderId,
    gatewayOrderId: getResponseField(response, "trade_no"),
    providerStatus: getResponseField(response, "trade_status") ?? "TRADE_CLOSED",
    amount: getResponseField(response, "total_amount") ?? undefined,
    succeeds: false,
    paidAt: null,
    rawPayload: response,
  } satisfies PaymentNotification;
}

async function createRefund(
  input: CreateRefundInput,
): Promise<PaymentRefundNotification> {
  const response = await callAlipayApi(
    "alipay.trade.refund",
    {
      ...buildTradeLookupBizContent(input.orderId, input.gatewayOrderId),
      refund_amount: formatAmount(input.refundAmount),
      out_request_no: input.refundId,
      ...(input.reason ? { refund_reason: input.reason } : {}),
    },
    input.account,
  );
  const fundChange = getResponseField(response, "fund_change");
  const providerStatus = fundChange === "Y" ? "REFUND_SUCCESS" : "REFUND_PROCESSING";

  return {
    orderId: input.orderId,
    refundId: input.refundId,
    gatewayOrderId: getResponseField(response, "trade_no"),
    gatewayRefundId: null,
    providerStatus,
    amount:
      getResponseField(response, "refund_fee") ??
      getResponseField(response, "refund_amount") ??
      input.refundAmount,
    refundedAt: parseAlipayDate(response.gmt_refund_pay),
    succeeds: providerStatus === "REFUND_SUCCESS",
    rawPayload: response,
  };
}

async function queryRefund(
  input: QueryRefundInput,
): Promise<PaymentRefundNotification> {
  const response = await callAlipayApi(
    "alipay.trade.fastpay.refund.query",
    {
      ...buildTradeLookupBizContent(input.orderId, input.gatewayOrderId),
      out_request_no: input.refundId,
    },
    input.account,
  );
  const providerStatus =
    getResponseField(response, "refund_status") ??
    (getResponseField(response, "refund_amount") ? "REFUND_SUCCESS" : "REFUND_PROCESSING");

  return {
    orderId: input.orderId,
    refundId: input.refundId,
    gatewayOrderId: getResponseField(response, "trade_no"),
    gatewayRefundId: null,
    providerStatus,
    amount:
      getResponseField(response, "refund_amount") ??
      getResponseField(response, "refund_fee") ??
      undefined,
    refundedAt: null,
    succeeds: /SUCCESS/i.test(providerStatus),
    rawPayload: response,
  };
}

export const alipayPageProvider: PaymentProvider = {
  getSummary() {
    return {
      code: ALIPAY_CODE,
      provider: ALIPAY_PROVIDER,
      displayName: "支付宝电脑网站支付",
      description: "商户自助维护支付宝参数，系统生成页面跳转链接并回收到当前商户的专属回调地址。",
      configured: true,
      implementationStatus: "ready",
      capabilities: [
        "page_redirect",
        "notify_callback",
        "return_url",
        "rsa2_signature",
        "order_query",
        "order_close",
        "refund",
        "refund_query",
      ],
    };
  },

  isConfigured(account) {
    return Boolean(
      getConfigValue(account, "ALIPAY_APP_ID", ["appId", "ALIPAY_APP_ID"]) &&
        getConfigValue(account, "ALIPAY_PRIVATE_KEY", ["privateKey", "ALIPAY_PRIVATE_KEY"]),
    );
  },

  async createPayment(input) {
    const params: Record<string, string> = {
      app_id: getRequiredConfigValue(input.account, "ALIPAY_APP_ID", ["appId", "ALIPAY_APP_ID"]),
      method: "alipay.trade.page.pay",
      format: "JSON",
      charset: "UTF-8",
      sign_type: "RSA2",
      timestamp: formatTimestamp(),
      version: "1.0",
      biz_content: JSON.stringify({
        out_trade_no: input.orderId,
        total_amount: formatAmount(input.amount),
        subject: input.subject,
        body: input.description ?? undefined,
        product_code:
          getConfigValue(input.account, "ALIPAY_PRODUCT_CODE", [
            "productCode",
            "ALIPAY_PRODUCT_CODE",
          ]) ?? DEFAULT_PRODUCT_CODE,
      }),
    };

    const notifyUrl = getNotifyUrl(input.account, input.notifyUrl);
    const returnUrl = input.returnUrl ?? buildHostedPaymentReturnUrl(input.orderId);

    if (notifyUrl) {
      params.notify_url = notifyUrl;
    }

    if (returnUrl) {
      params.return_url = returnUrl;
    }

    const sign = signParameters(params, input.account);
    const query = new URLSearchParams({ ...params, sign });
    const gatewayUrl = getGatewayUrl(input.account);

    return {
      status: "requires_action",
      mode: "redirect",
      checkoutUrl: `${gatewayUrl}?${query.toString()}`,
      providerStatus: "WAIT_BUYER_PAY",
      providerPayload: {
        gateway: gatewayUrl,
        method: params.method,
        signType: params.sign_type,
        bizContent: JSON.parse(params.biz_content),
      },
    };
  },

  async queryPayment(input) {
    return queryPayment(input.orderId, input.gatewayOrderId, input.account);
  },

  async closePayment(input) {
    return closePayment(input.orderId, input.gatewayOrderId, input.account);
  },

  async createRefund(input) {
    return createRefund(input);
  },

  async queryRefund(input) {
    return queryRefund(input);
  },

  parseNotification(params, account) {
    const normalized = Object.fromEntries(
      Object.entries(params)
        .filter(([, value]) => typeof value === "string")
        .map(([key, value]) => [key, value]),
    ) as Record<string, string>;
    const signature = normalized.sign;

    if (!signature) {
      throw new Error("Alipay notification is missing sign.");
    }

    const payload = Object.fromEntries(
      Object.entries(normalized).filter(([key]) => key !== "sign" && key !== "sign_type"),
    );

    if (!verifyParameters(payload, signature, account)) {
      throw new Error("Alipay notification signature verification failed.");
    }

    const providerStatus = payload.trade_status ?? "UNKNOWN";
    const paidAt = payload.gmt_payment ? parseAlipayDate(payload.gmt_payment) : null;
    const succeeds = providerStatus === "TRADE_SUCCESS" || providerStatus === "TRADE_FINISHED";

    return {
      orderId: payload.out_trade_no,
      gatewayOrderId: payload.trade_no ?? null,
      providerStatus,
      amount: payload.total_amount,
      paidAt,
      succeeds,
      rawPayload: normalized,
    };
  },
};
