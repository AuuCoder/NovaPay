import {
  createDecipheriv,
  createPrivateKey,
  createPublicKey,
  createSign,
  createVerify,
  randomBytes,
} from "node:crypto";
import { buildMerchantChannelCallbackUrl } from "@/lib/merchant-channel-accounts";
import { isRecord, normalizePem } from "@/lib/payments/utils";
import type {
  CreatePaymentInput,
  CreatePaymentResult,
  CreateRefundInput,
  PaymentNotification,
  PaymentProvider,
  PaymentRefundNotification,
  ProviderAccountConfig,
  QueryRefundInput,
} from "@/lib/payments/types";

const WXPAY_CODE = "wxpay.native" as const;
const WXPAY_PROVIDER = "wxpay" as const;
const DEFAULT_API_BASE_URL = "https://api.mch.weixin.qq.com";
const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_SIGNATURE_MAX_AGE_SECONDS = 300;
const DEFAULT_PAYER_CLIENT_IP = "127.0.0.1";

interface WxpayConfig {
  appId: string;
  mchId: string;
  mchSerialNo: string;
  privateKey: string;
  apiV3Key: string;
  notifyUrl: string;
  platformPublicKey: string;
  platformSerial?: string;
  apiBaseUrl: string;
  requestTimeoutMs: number;
  signatureMaxAgeSeconds: number;
  defaultPayerClientIp: string;
}

interface WxpayCallbackEnvelope {
  rawBody: string;
  body: Record<string, unknown>;
  headers: Record<string, string>;
}

interface WxpayEncryptedResource {
  algorithm?: unknown;
  ciphertext?: unknown;
  nonce?: unknown;
  associated_data?: unknown;
}

interface WxpayNativeOrderResponse {
  code_url?: unknown;
}

interface WxpayTransactionResponse {
  appid?: unknown;
  mchid?: unknown;
  trade_state?: unknown;
  transaction_id?: unknown;
  success_time?: unknown;
  amount?: unknown;
}

interface WxpayRefundResponse {
  refund_id?: unknown;
  out_refund_no?: unknown;
  status?: unknown;
  success_time?: unknown;
  amount?: unknown;
  refund_fee?: unknown;
  mchid?: unknown;
}

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

function getNumberConfigValue(
  account: ProviderAccountConfig | null | undefined,
  envKey: string,
  aliases: string[],
  fallback: number,
) {
  const raw = getConfigValue(account, envKey, aliases);

  if (!raw) {
    return fallback;
  }

  const numeric = Number(raw);

  return Number.isFinite(numeric) && numeric > 0 ? numeric : fallback;
}

function resolveNotifyUrl(
  account: ProviderAccountConfig | null | undefined,
  inputNotifyUrl?: string | null,
) {
  const notifyUrl =
    inputNotifyUrl ??
    (account?.callbackToken
      ? buildMerchantChannelCallbackUrl(account.channelCode, account.id, account.callbackToken)
      : null);

  if (!notifyUrl) {
    throw new Error("Merchant callback route is missing for WeChat Pay channel instance.");
  }

  return new URL(notifyUrl).toString();
}

function resolveWxpayConfig(
  account: ProviderAccountConfig | null | undefined,
  inputNotifyUrl?: string | null,
): WxpayConfig {
  const apiV3Key = getRequiredConfigValue(account, "WXPAY_API_V3_KEY", [
    "apiV3Key",
    "apiV3Secret",
    "WXPAY_API_V3_KEY",
  ]);

  if (Buffer.byteLength(apiV3Key, "utf8") !== 32) {
    throw new Error("WXPAY_API_V3_KEY must be exactly 32 bytes.");
  }

  return {
    appId: getRequiredConfigValue(account, "WXPAY_APP_ID", ["appId", "WXPAY_APP_ID"]),
    mchId: getRequiredConfigValue(account, "WXPAY_MCH_ID", [
      "merchantId",
      "mchId",
      "WXPAY_MCH_ID",
    ]),
    mchSerialNo: getRequiredConfigValue(account, "WXPAY_MCH_SERIAL_NO", [
      "merchantSerialNumber",
      "serialNo",
      "mchSerialNo",
      "WXPAY_MCH_SERIAL_NO",
    ]),
    privateKey: getRequiredConfigValue(account, "WXPAY_PRIVATE_KEY", [
      "privateKey",
      "merchantPrivateKey",
      "WXPAY_PRIVATE_KEY",
    ]),
    apiV3Key,
    notifyUrl: resolveNotifyUrl(account, inputNotifyUrl),
    platformPublicKey: getRequiredConfigValue(account, "WXPAY_PLATFORM_PUBLIC_KEY", [
      "platformPublicKey",
      "wechatpayPublicKey",
      "WXPAY_PLATFORM_PUBLIC_KEY",
    ]),
    platformSerial: getConfigValue(account, "WXPAY_PLATFORM_SERIAL", [
      "platformSerial",
      "wechatpaySerial",
      "publicKeyId",
      "WXPAY_PLATFORM_SERIAL",
    ]),
    apiBaseUrl:
      getConfigValue(account, "WXPAY_API_BASE_URL", ["apiBaseUrl", "WXPAY_API_BASE_URL"]) ??
      DEFAULT_API_BASE_URL,
    requestTimeoutMs: getNumberConfigValue(
      account,
      "WXPAY_REQUEST_TIMEOUT_MS",
      ["requestTimeoutMs", "WXPAY_REQUEST_TIMEOUT_MS"],
      DEFAULT_TIMEOUT_MS,
    ),
    signatureMaxAgeSeconds: getNumberConfigValue(
      account,
      "WXPAY_SIGNATURE_MAX_AGE_SECONDS",
      ["signatureMaxAgeSeconds", "WXPAY_SIGNATURE_MAX_AGE_SECONDS"],
      DEFAULT_SIGNATURE_MAX_AGE_SECONDS,
    ),
    defaultPayerClientIp:
      getConfigValue(account, "WXPAY_DEFAULT_PAYER_CLIENT_IP", [
        "defaultPayerClientIp",
        "WXPAY_DEFAULT_PAYER_CLIENT_IP",
      ]) ?? DEFAULT_PAYER_CLIENT_IP,
  };
}

function normalizeCanonicalUrl(url: URL) {
  return `${url.pathname}${url.search}`;
}

function signMessage(message: string, privateKey: string) {
  const signer = createSign("RSA-SHA256");
  signer.update(message, "utf8");
  signer.end();

  return signer.sign(createPrivateKey(normalizePem(privateKey, "private")), "base64");
}

function verifyMessage(message: string, signature: string, publicKey: string) {
  const verifier = createVerify("RSA-SHA256");
  verifier.update(message, "utf8");
  verifier.end();

  return verifier.verify(createPublicKey(normalizePem(publicKey, "public")), signature, "base64");
}

function buildSignedMessage(timestamp: string, nonce: string, body: string) {
  return `${timestamp}\n${nonce}\n${body}\n`;
}

function buildAuthorization(
  config: WxpayConfig,
  method: string,
  canonicalUrl: string,
  body: string,
) {
  const timestamp = `${Math.floor(Date.now() / 1000)}`;
  const nonce = randomBytes(16).toString("hex");
  const message = `${method.toUpperCase()}\n${canonicalUrl}\n${timestamp}\n${nonce}\n${body}\n`;
  const signature = signMessage(message, config.privateKey);

  return `WECHATPAY2-SHA256-RSA2048 mchid="${config.mchId}",nonce_str="${nonce}",signature="${signature}",timestamp="${timestamp}",serial_no="${config.mchSerialNo}"`;
}

function assertFreshTimestamp(timestamp: string, maxAgeSeconds: number) {
  const seconds = Number(timestamp);

  if (!Number.isFinite(seconds)) {
    throw new Error("WeChat Pay signature timestamp is invalid.");
  }

  if (Math.abs(Math.floor(Date.now() / 1000) - seconds) > maxAgeSeconds) {
    throw new Error("WeChat Pay signature timestamp has expired.");
  }
}

function verifyWechatpaySignature(input: {
  source: "response" | "notification";
  config: WxpayConfig;
  timestamp: string | null;
  nonce: string | null;
  signature: string | null;
  serial: string | null;
  body: string;
}) {
  if (!input.timestamp || !input.nonce || !input.signature || !input.serial) {
    throw new Error(`WeChat Pay ${input.source} signature headers are incomplete.`);
  }

  if (input.signature.startsWith("WECHATPAY/SIGNTEST/")) {
    throw new Error("WeChat Pay sign-test traffic was received and rejected.");
  }

  assertFreshTimestamp(input.timestamp, input.config.signatureMaxAgeSeconds);

  if (input.config.platformSerial && input.serial !== input.config.platformSerial) {
    throw new Error(
      `WeChat Pay ${input.source} serial mismatch. Expected ${input.config.platformSerial}, received ${input.serial}.`,
    );
  }

  const message = buildSignedMessage(input.timestamp, input.nonce, input.body);

  if (!verifyMessage(message, input.signature, input.config.platformPublicKey)) {
    throw new Error(`WeChat Pay ${input.source} signature verification failed.`);
  }
}

function decryptWechatpayResource(resource: WxpayEncryptedResource, apiV3Key: string) {
  if (resource.algorithm !== "AEAD_AES_256_GCM") {
    throw new Error("Unsupported WeChat Pay encryption algorithm.");
  }

  if (
    typeof resource.ciphertext !== "string" ||
    typeof resource.nonce !== "string" ||
    resource.ciphertext.length === 0 ||
    resource.nonce.length === 0
  ) {
    throw new Error("WeChat Pay encrypted resource is incomplete.");
  }

  const encrypted = Buffer.from(resource.ciphertext, "base64");

  if (encrypted.length <= 16) {
    throw new Error("WeChat Pay encrypted resource is invalid.");
  }

  const authTag = encrypted.subarray(encrypted.length - 16);
  const cipherText = encrypted.subarray(0, encrypted.length - 16);
  const decipher = createDecipheriv(
    "aes-256-gcm",
    Buffer.from(apiV3Key, "utf8"),
    Buffer.from(resource.nonce, "utf8"),
  );

  if (typeof resource.associated_data === "string" && resource.associated_data.length > 0) {
    decipher.setAAD(Buffer.from(resource.associated_data, "utf8"));
  }

  decipher.setAuthTag(authTag);

  return Buffer.concat([decipher.update(cipherText), decipher.final()]).toString("utf8");
}

function toStringRecord(value: unknown): Record<string, string> {
  if (!isRecord(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value)
      .filter(([, item]) => typeof item === "string" && item.length > 0)
      .map(([key, item]) => [key.toLowerCase(), item]),
  ) as Record<string, string>;
}

function toAmountFen(amount: string) {
  const numeric = Number(amount);

  if (!Number.isFinite(numeric) || numeric <= 0) {
    throw new Error("amount must be a positive number.");
  }

  return Math.round(numeric * 100);
}

function fromAmountFen(amount: unknown) {
  return typeof amount === "number" && Number.isFinite(amount)
    ? (amount / 100).toFixed(2)
    : undefined;
}

function formatRfc3339(date: Date) {
  return date.toISOString().replace(/\.\d{3}Z$/, "Z");
}

function trimDescription(subject: string, description?: string | null) {
  const base = (description?.trim() || subject).trim();

  return base.length > 127 ? base.slice(0, 127) : base;
}

function assertOutTradeNo(orderId: string) {
  if (!/^[0-9A-Za-z_\-*]{6,32}$/.test(orderId)) {
    throw new Error(
      "WeChat Pay requires orderId to be 6-32 characters using letters, numbers, underscore, hyphen, or asterisk.",
    );
  }
}

function assertOutRefundNo(refundId: string) {
  if (!/^[0-9A-Za-z_|\-*@]{1,64}$/.test(refundId)) {
    throw new Error(
      "WeChat Pay requires refundId to be 1-64 characters using letters, numbers, underscore, vertical bar, hyphen, asterisk, or at sign.",
    );
  }
}

function resolveClientIp(input: CreatePaymentInput, config: WxpayConfig) {
  return input.clientIp?.trim() || config.defaultPayerClientIp;
}

function parseJsonResponse<T>(rawBody: string, fallback: T) {
  if (!rawBody.trim()) {
    return fallback;
  }

  return JSON.parse(rawBody) as T;
}

async function requestWechatpay<T>(input: {
  config: WxpayConfig;
  method: "GET" | "POST";
  path: string;
  query?: Record<string, string | undefined>;
  body?: Record<string, unknown>;
  emptyResponse: T;
}) {
  const endpoint = new URL(input.path, input.config.apiBaseUrl);

  for (const [key, value] of Object.entries(input.query ?? {})) {
    if (value !== undefined) {
      endpoint.searchParams.set(key, value);
    }
  }

  const body = input.body ? JSON.stringify(input.body) : "";
  const response = await fetch(endpoint.toString(), {
    method: input.method,
    headers: {
      Accept: "application/json",
      Authorization: buildAuthorization(
        input.config,
        input.method,
        normalizeCanonicalUrl(endpoint),
        body,
      ),
      "Content-Type": "application/json",
      "User-Agent": "NovaPay/1.0",
    },
    body: body || undefined,
    signal: AbortSignal.timeout(input.config.requestTimeoutMs),
  });
  const rawBody = await response.text();
  const hasSignature = Boolean(response.headers.get("wechatpay-signature"));

  if (hasSignature || rawBody) {
    verifyWechatpaySignature({
      source: "response",
      config: input.config,
      timestamp: response.headers.get("wechatpay-timestamp"),
      nonce: response.headers.get("wechatpay-nonce"),
      signature: response.headers.get("wechatpay-signature"),
      serial: response.headers.get("wechatpay-serial"),
      body: rawBody,
    });
  }

  const parsedBody = parseJsonResponse<T | Record<string, unknown>>(rawBody, input.emptyResponse);

  if (!response.ok) {
    const errorCode =
      isRecord(parsedBody) && typeof parsedBody.code === "string" ? parsedBody.code : null;
    const errorMessage =
      isRecord(parsedBody) && typeof parsedBody.message === "string"
        ? parsedBody.message
        : `HTTP ${response.status}`;

    throw new Error(
      `WeChat Pay request failed${errorCode ? ` [${errorCode}]` : ""}: ${errorMessage}`,
    );
  }

  return {
    body: parsedBody as T,
    rawBody,
    response,
  };
}

async function createNativeOrder(
  input: CreatePaymentInput,
  config: WxpayConfig,
): Promise<CreatePaymentResult> {
  assertOutTradeNo(input.orderId);

  const payload = {
    appid: config.appId,
    mchid: config.mchId,
    description: trimDescription(input.subject, input.description),
    out_trade_no: input.orderId,
    notify_url: config.notifyUrl,
    amount: {
      total: toAmountFen(input.amount),
      currency: input.currency,
    },
    scene_info: {
      payer_client_ip: resolveClientIp(input, config),
    },
    ...(input.expireAt ? { time_expire: formatRfc3339(input.expireAt) } : {}),
  };
  const result = await requestWechatpay<WxpayNativeOrderResponse>({
    config,
    method: "POST",
    path: "/v3/pay/transactions/native",
    body: payload,
    emptyResponse: {},
  });

  if (typeof result.body.code_url !== "string" || !result.body.code_url) {
    throw new Error("WeChat Pay native order response is missing code_url.");
  }

  return {
    status: "requires_action",
    mode: "qr_code",
    checkoutUrl: result.body.code_url,
    providerStatus: "NOTPAY",
    providerPayload: {
      codeUrl: result.body.code_url,
      tradeType: "NATIVE",
      notifyUrl: config.notifyUrl,
      requestId: result.response.headers.get("request-id"),
      timeExpire: payload.time_expire ?? null,
    },
  };
}

function parseCallbackEnvelope(params: Record<string, unknown>): WxpayCallbackEnvelope {
  const rawBody = typeof params.rawBody === "string" ? params.rawBody : null;
  const body = isRecord(params.body) ? params.body : null;

  if (!rawBody || !body) {
    throw new Error("WeChat Pay callback payload is invalid.");
  }

  return {
    rawBody,
    body,
    headers: toStringRecord(params.headers),
  };
}

function parseEncryptedResource(value: unknown) {
  if (!isRecord(value)) {
    throw new Error("WeChat Pay callback resource is missing.");
  }

  return value as WxpayEncryptedResource;
}

function parseTransactionPayload(value: unknown) {
  if (!isRecord(value)) {
    throw new Error("WeChat Pay transaction payload is invalid.");
  }

  return value;
}

function parsePaidAt(value: unknown) {
  if (typeof value !== "string" || !value) {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function assertTransactionBelongsToMerchant(
  transaction: WxpayTransactionResponse | Record<string, unknown>,
  config: WxpayConfig,
) {
  if (typeof transaction.mchid === "string" && transaction.mchid !== config.mchId) {
    throw new Error("WeChat Pay merchant id mismatch.");
  }

  if (typeof transaction.appid === "string" && transaction.appid !== config.appId) {
    throw new Error("WeChat Pay app id mismatch.");
  }
}

function toPaymentNotification(
  orderId: string,
  transaction: WxpayTransactionResponse | Record<string, unknown>,
): PaymentNotification {
  const tradeState =
    typeof transaction.trade_state === "string" && transaction.trade_state
      ? transaction.trade_state
      : "UNKNOWN";
  const amount = isRecord(transaction.amount) ? fromAmountFen(transaction.amount.total) : undefined;

  return {
    orderId,
    gatewayOrderId:
      typeof transaction.transaction_id === "string" ? transaction.transaction_id : null,
    providerStatus: tradeState,
    amount,
    paidAt: parsePaidAt(transaction.success_time),
    succeeds: tradeState === "SUCCESS" || tradeState === "REFUND",
    rawPayload: {
      transaction,
    },
  };
}

async function queryOrder(
  orderId: string,
  config: WxpayConfig,
  gatewayOrderId?: string | null,
): Promise<PaymentNotification> {
  assertOutTradeNo(orderId);

  const result = await requestWechatpay<WxpayTransactionResponse>({
    config,
    method: "GET",
    path: gatewayOrderId
      ? `/v3/pay/transactions/id/${encodeURIComponent(gatewayOrderId)}`
      : `/v3/pay/transactions/out-trade-no/${encodeURIComponent(orderId)}`,
    query: {
      mchid: config.mchId,
    },
    emptyResponse: {},
  });

  assertTransactionBelongsToMerchant(result.body, config);

  return toPaymentNotification(orderId, result.body);
}

async function closeOrder(
  orderId: string,
  config: WxpayConfig,
  gatewayOrderId?: string | null,
): Promise<PaymentNotification> {
  assertOutTradeNo(orderId);

  await requestWechatpay<Record<string, never>>({
    config,
    method: "POST",
    path: `/v3/pay/transactions/out-trade-no/${encodeURIComponent(orderId)}/close`,
    body: {
      mchid: config.mchId,
    },
    emptyResponse: {},
  });

  return {
    orderId,
    gatewayOrderId: gatewayOrderId ?? null,
    providerStatus: "CLOSED",
    succeeds: false,
    paidAt: null,
    rawPayload: {
      closed: true,
    },
  };
}

function getRefundAmount(value: WxpayRefundResponse) {
  if (isRecord(value.amount)) {
    return fromAmountFen(value.amount.refund);
  }

  return fromAmountFen(value.refund_fee);
}

function toRefundNotification(
  orderId: string,
  refundId: string,
  refund: WxpayRefundResponse,
): PaymentRefundNotification {
  const providerStatus = typeof refund.status === "string" && refund.status ? refund.status : "UNKNOWN";

  return {
    orderId,
    refundId,
    gatewayOrderId: null,
    gatewayRefundId: typeof refund.refund_id === "string" ? refund.refund_id : null,
    providerStatus,
    amount: getRefundAmount(refund),
    refundedAt: parsePaidAt(refund.success_time),
    succeeds: providerStatus === "SUCCESS",
    rawPayload: {
      refund,
    },
  };
}

async function createWxpayRefund(
  input: CreateRefundInput,
  config: WxpayConfig,
): Promise<PaymentRefundNotification> {
  assertOutTradeNo(input.orderId);
  assertOutRefundNo(input.refundId);

  const payload = {
    ...(input.gatewayOrderId
      ? { transaction_id: input.gatewayOrderId }
      : { out_trade_no: input.orderId }),
    out_refund_no: input.refundId,
    reason: input.reason ?? undefined,
    notify_url: config.notifyUrl,
    amount: {
      refund: toAmountFen(input.refundAmount),
      total: toAmountFen(input.amount),
      currency: input.currency,
    },
  };
  const result = await requestWechatpay<WxpayRefundResponse>({
    config,
    method: "POST",
    path: "/v3/refund/domestic/refunds",
    body: payload,
    emptyResponse: {},
  });

  if (typeof result.body.mchid === "string" && result.body.mchid !== config.mchId) {
    throw new Error("WeChat Pay refund merchant id mismatch.");
  }

  return toRefundNotification(input.orderId, input.refundId, result.body);
}

async function queryWxpayRefund(
  input: QueryRefundInput,
  config: WxpayConfig,
): Promise<PaymentRefundNotification> {
  assertOutRefundNo(input.refundId);

  const result = await requestWechatpay<WxpayRefundResponse>({
    config,
    method: "GET",
    path: `/v3/refund/domestic/refunds/${encodeURIComponent(input.refundId)}`,
    emptyResponse: {},
  });

  if (typeof result.body.mchid === "string" && result.body.mchid !== config.mchId) {
    throw new Error("WeChat Pay refund merchant id mismatch.");
  }

  return toRefundNotification(input.orderId, input.refundId, result.body);
}

function parseNativeNotification(
  params: Record<string, unknown>,
  account?: ProviderAccountConfig | null,
): PaymentNotification {
  const envelope = parseCallbackEnvelope(params);
  const config = resolveWxpayConfig(account);

  verifyWechatpaySignature({
    source: "notification",
    config,
    timestamp: envelope.headers["wechatpay-timestamp"] ?? null,
    nonce: envelope.headers["wechatpay-nonce"] ?? null,
    signature: envelope.headers["wechatpay-signature"] ?? null,
    serial: envelope.headers["wechatpay-serial"] ?? null,
    body: envelope.rawBody,
  });

  const resource = parseEncryptedResource(envelope.body.resource);
  const decrypted = JSON.parse(
    decryptWechatpayResource(resource, config.apiV3Key),
  ) as Record<string, unknown>;
  const transaction = parseTransactionPayload(decrypted);
  const orderId =
    typeof transaction.out_trade_no === "string" ? transaction.out_trade_no.trim() : "";

  if (!orderId) {
    throw new Error("WeChat Pay callback is missing out_trade_no.");
  }

  assertTransactionBelongsToMerchant(transaction, config);

  return {
    ...toPaymentNotification(orderId, transaction),
    rawPayload: {
      headers: envelope.headers,
      body: envelope.body,
      decrypted: transaction,
    },
  };
}

export const wxpayNativeProvider: PaymentProvider = {
  getSummary() {
    return {
      code: WXPAY_CODE,
      provider: WXPAY_PROVIDER,
      displayName: "微信 Native 扫码支付",
      description:
        "商户自助维护微信支付参数，基于 API v3 发起 Native 扫码下单，并回收到当前商户的专属回调地址。",
      configured: true,
      implementationStatus: "ready",
      capabilities: [
        "native_qr",
        "notify_callback",
        "order_query",
        "order_close",
        "refund",
        "refund_query",
      ],
    };
  },

  isConfigured(account) {
    try {
      resolveWxpayConfig(account);
      return true;
    } catch {
      return false;
    }
  },

  async createPayment(input) {
    const config = resolveWxpayConfig(input.account, input.notifyUrl);
    return createNativeOrder(input, config);
  },

  async queryPayment(input) {
    const config = resolveWxpayConfig(input.account);
    return queryOrder(input.orderId, config, input.gatewayOrderId);
  },

  async closePayment(input) {
    const config = resolveWxpayConfig(input.account);
    return closeOrder(input.orderId, config, input.gatewayOrderId);
  },

  async createRefund(input) {
    const config = resolveWxpayConfig(input.account);
    return createWxpayRefund(input, config);
  },

  async queryRefund(input) {
    const config = resolveWxpayConfig(input.account);
    return queryWxpayRefund(input, config);
  },

  parseNotification(params, account) {
    return parseNativeNotification(params, account);
  },
};
