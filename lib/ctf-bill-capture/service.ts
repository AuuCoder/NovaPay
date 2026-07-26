import { createHash, timingSafeEqual } from "node:crypto";
import type { Prisma } from "@/generated/prisma/client";
import { CtfBillCaptureStatus, PaymentStatus } from "@/generated/prisma/enums";
import { AppError } from "@/lib/errors";
import { applyPaymentNotification } from "@/lib/orders/service";
import {
  CTF_BILL_CAPTURE_PROVIDER_KEY,
  isCtfBillCaptureChannelCode,
  normalizePaymentChannelCode,
} from "@/lib/payments/channel-codes";
import type { ProviderAccountConfig } from "@/lib/payments/types";
import { formatAmount, isRecord } from "@/lib/payments/utils";
import { getPrismaClient } from "@/lib/prisma";

const DEFAULT_CTF_BILL_MATCH_WINDOW_MINUTES = 30;
const DEFAULT_CTF_BILL_MATCH_BATCH_SIZE = 50;
const DEFAULT_CTF_BILL_MAX_ATTEMPTS = 5;
const DEFAULT_CTF_BILL_RETRY_BASE_SECONDS = 60;
const CTF_BILL_CLAIM_LEASE_MS = 60_000;
const CNY = "CNY";

export interface CtfBillCapturePayload {
  channelCode?: string;
  source?: string | null;
  externalBillId?: string | null;
  payerAccount?: string | null;
  amount: string;
  currency?: string;
  paidAt: Date;
  remark?: string | null;
  rawPayload: Record<string, unknown>;
}

export interface CtfBillCaptureIngestResult {
  eventId: string;
  duplicate: boolean;
  matched: boolean;
  matchedPaymentOrderId: string | null;
  status: CtfBillCaptureStatus;
}

function firstString(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
    if (typeof value === "number" && Number.isFinite(value)) {
      return String(value);
    }
  }
  return null;
}

function firstDate(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key];

    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      return value;
    }

    if (typeof value === "number" && Number.isFinite(value)) {
      const milliseconds = value > 10_000_000_000 ? value : value * 1_000;
      const date = new Date(milliseconds);
      if (!Number.isNaN(date.getTime())) {
        return date;
      }
    }

    if (typeof value === "string" && value.trim()) {
      const normalized = value.trim().replace(/^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})$/, "$1T$2+08:00");
      const date = new Date(normalized);
      if (!Number.isNaN(date.getTime())) {
        return date;
      }
    }
  }

  return null;
}

function normalizeCurrency(value: string | null) {
  const currency = (value ?? CNY).trim().toUpperCase();
  return currency || CNY;
}

function stableJson(value: unknown): string {
  if (!isRecord(value)) {
    return JSON.stringify(value);
  }

  return JSON.stringify(
    Object.keys(value)
      .sort()
      .reduce<Record<string, unknown>>((result, key) => {
        result[key] = value[key];
        return result;
      }, {}),
  );
}

function sha256Hex(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

export function parseCtfBillCapturePayload(raw: unknown): CtfBillCapturePayload {
  if (!isRecord(raw)) {
    throw new AppError("CTF_BILL_PAYLOAD_INVALID", "账单捕获载荷必须是 JSON 对象。", 400);
  }

  const amount = firstString(raw, [
    "amount",
    "money",
    "totalAmount",
    "total_amount",
    "receiptAmount",
    "receipt_amount",
  ]);

  if (!amount) {
    throw new AppError("CTF_BILL_AMOUNT_REQUIRED", "账单捕获载荷缺少 amount/money 字段。", 400);
  }

  const paidAt = firstDate(raw, [
    "paidAt",
    "paid_at",
    "payTime",
    "pay_time",
    "gmtPayment",
    "gmt_payment",
    "timestamp",
    "time",
  ]);

  return {
    channelCode: firstString(raw, ["channelCode", "channel", "type"]) ?? undefined,
    source: firstString(raw, ["source", "captureSource", "capture_source", "app"]),
    externalBillId: firstString(raw, [
      "externalBillId",
      "billId",
      "bill_id",
      "tradeNo",
      "trade_no",
      "transactionId",
      "transaction_id",
      "orderNo",
      "order_no",
    ]),
    payerAccount: firstString(raw, [
      "payerAccount",
      "payer_account",
      "buyerLogonId",
      "buyer_logon_id",
      "openid",
      "nickname",
    ]),
    amount: formatAmount(amount),
    currency: normalizeCurrency(firstString(raw, ["currency", "feeType", "fee_type"])),
    paidAt: paidAt ?? new Date(),
    remark: firstString(raw, ["remark", "memo", "note", "body", "subject", "description"]),
    rawPayload: raw,
  };
}

export async function parseCtfBillCapturePayloadForAccount(input: {
  raw: unknown;
  account: ProviderAccountConfig;
}): Promise<CtfBillCapturePayload> {
  return parseCtfBillCapturePayload(input.raw);
}

export function assertCtfCollectorSecret(input: {
  account: ProviderAccountConfig;
  providedSecret: string | null;
}) {
  const expected = input.account.config.collectorSecret?.trim();

  if (!expected) {
    throw new AppError(
      "CTF_COLLECTOR_SECRET_NOT_CONFIGURED",
      "账单采集端密钥未配置，已拒绝接收到账事件。",
      503,
    );
  }

  if (!input.providedSecret || !safeEqual(expected, input.providedSecret.trim())) {
    throw new AppError("CTF_COLLECTOR_SECRET_INVALID", "账单采集端密钥不正确。", 401);
  }
}

export function assertCtfBillCaptureAccount(account: ProviderAccountConfig) {
  if (
    account.providerKey !== CTF_BILL_CAPTURE_PROVIDER_KEY ||
    !isCtfBillCaptureChannelCode(account.channelCode)
  ) {
    throw new AppError(
      "CTF_BILL_ACCOUNT_NOT_ALLOWED",
      "该通道实例不允许接收 CTF 账单事件。",
      404,
    );
  }
}

export function buildCtfBillCaptureFingerprint(input: {
  accountId: string;
  channelCode: string;
  payload: CtfBillCapturePayload;
}) {
  const billIdentity = input.payload.externalBillId
    ? `bill:${input.payload.externalBillId}`
    : `raw:${stableJson(input.payload.rawPayload)}`;

  return sha256Hex(
    [
      "ctf-bill-capture:v1",
      input.accountId,
      normalizePaymentChannelCode(input.channelCode),
      input.payload.amount,
      input.payload.currency ?? CNY,
      input.payload.paidAt.toISOString(),
      billIdentity,
    ].join("|"),
  );
}

function buildOrderRemarkCandidates(order: {
  id: string;
  externalOrderId: string;
  subject: string;
  channelPayload: unknown;
}) {
  const candidates = [order.id, order.externalOrderId, order.subject];

  if (isRecord(order.channelPayload)) {
    for (const key of ["remark", "memo", "qrPayload", "checkoutUrl"]) {
      const value = order.channelPayload[key];
      if (typeof value === "string" && value.trim()) {
        candidates.push(value.trim());
      }
    }
  }

  return candidates.filter((value, index, list) => value && list.indexOf(value) === index);
}

function remarkMatchesOrder(remark: string | null | undefined, order: {
  id: string;
  externalOrderId: string;
  subject: string;
  channelPayload: unknown;
}) {
  if (!remark?.trim()) {
    return true;
  }

  const normalizedRemark = remark.trim().toLowerCase();
  return buildOrderRemarkCandidates(order).some((candidate) =>
    normalizedRemark.includes(candidate.toLowerCase()),
  );
}

function isNotificationListenerSource(source: string | null | undefined) {
  const normalized = (source ?? "").trim().toLowerCase();
  return (
    normalized === "notif-alipay-listener" ||
    normalized === "notif-wechat-listener" ||
    normalized === "notif-alipay-voice-helper"
  );
}

async function findMatchingPaymentOrder(input: {
  eventId: string;
  merchantChannelAccountId: string;
  channelCode: string;
  amount: string;
  currency: string;
  paidAt: Date;
  remark?: string | null;
  captureSource?: string | null;
  matchWindowMinutes: number;
}) {
  const prisma = getPrismaClient();
  const windowMs = input.matchWindowMinutes * 60_000;
  const windowStart = new Date(input.paidAt.getTime() - windowMs);

  const candidates = await prisma.paymentOrder.findMany({
    where: {
      merchantChannelAccountId: input.merchantChannelAccountId,
      channelCode: input.channelCode,
      currency: input.currency,
      createdAt: {
        lte: input.paidAt,
      },
      AND: [
        {
          OR: [
            {
              status: {
                in: [PaymentStatus.PENDING, PaymentStatus.PROCESSING],
              },
            },
            // 监听端可能被系统杀掉，到账通知会在订单超时后才补上报。
            // 只要账单的真实 paidAt 仍落在订单有效期内，就允许从 ORDER_EXPIRED 追回。
            {
              status: PaymentStatus.CANCELLED,
              providerStatus: "ORDER_EXPIRED",
              paidAt: null,
              expireAt: {
                gte: input.paidAt,
              },
            },
          ],
        },
        {
          OR: [{ expireAt: null }, { expireAt: { gte: windowStart } }],
        },
      ],
      ctfBillCaptureEvents: {
        none: {
          status: CtfBillCaptureStatus.MATCHED,
        },
      },
    },
    orderBy: [{ createdAt: "asc" }],
    select: {
      id: true,
      externalOrderId: true,
      subject: true,
      amount: true,
      payableAmount: true,
      currency: true,
      channelPayload: true,
      status: true,
    },
  });

  const amountMatchedCandidates = candidates.filter((order) => {
    const expectedCents = Math.round(Number((order.payableAmount ?? order.amount).toString()) * 100);
    const actualCents = Math.round(Number(input.amount) * 100);
    return Number.isFinite(expectedCents) && Number.isFinite(actualCents) && expectedCents === actualCents;
  });

  const remarkMatchedOrder =
    amountMatchedCandidates.find((order) =>
      remarkMatchesOrder(input.remark, {
        id: order.id,
        externalOrderId: order.externalOrderId,
        subject: order.subject,
        channelPayload: order.channelPayload,
      }),
    ) ?? null;

  if (remarkMatchedOrder) {
    return remarkMatchedOrder;
  }

  if (isNotificationListenerSource(input.captureSource) && amountMatchedCandidates.length === 1) {
    return amountMatchedCandidates[0] ?? null;
  }

  return null;
}

export async function matchCtfBillCaptureEvent(eventId: string, options?: {
  matchWindowMinutes?: number;
}) {
  const prisma = getPrismaClient();
  const event = await prisma.ctfBillCaptureEvent.findUnique({
    where: { id: eventId },
  });

  if (!event || event.status !== CtfBillCaptureStatus.RECEIVED || !event.merchantChannelAccountId) {
    return { matched: false, orderId: null };
  }

  const order = await findMatchingPaymentOrder({
    eventId,
    merchantChannelAccountId: event.merchantChannelAccountId,
    channelCode: event.channelCode,
    amount: event.amount.toString(),
    currency: event.currency,
    paidAt: event.paidAt,
    remark: event.remark,
    captureSource: event.captureSource,
    matchWindowMinutes: options?.matchWindowMinutes ?? DEFAULT_CTF_BILL_MATCH_WINDOW_MINUTES,
  });

  if (!order) {
    return { matched: false, orderId: null };
  }

  await applyPaymentNotification({
    orderId: order.id,
    gatewayOrderId: event.externalBillId ?? event.id,
    providerStatus: "CTF_BILL_CAPTURED",
    amount: event.amount.toString(),
    paidAt: event.paidAt,
    succeeds: true,
    evidenceKind: "ctf-capture",
    rawPayload: {
      source: "ctf_bill_capture",
      eventId: event.id,
      externalBillId: event.externalBillId,
      payerAccount: event.payerAccount,
      remark: event.remark,
      rawPayload: event.rawPayload,
    },
  });

  await prisma.ctfBillCaptureEvent.update({
    where: { id: event.id },
    data: {
      status: CtfBillCaptureStatus.MATCHED,
      matchedPaymentOrderId: order.id,
      matchedAt: new Date(),
      nextAttemptAt: null,
      failureCode: null,
      failureMessage: null,
    },
  });

  return { matched: true, orderId: order.id };
}

export async function ingestCtfBillCaptureEvent(input: {
  account: ProviderAccountConfig;
  payload: CtfBillCapturePayload;
  matchImmediately?: boolean;
  matchWindowMinutes?: number;
}): Promise<CtfBillCaptureIngestResult> {
  assertCtfBillCaptureAccount(input.account);
  const prisma = getPrismaClient();
  const channelCode = normalizePaymentChannelCode(
    input.payload.channelCode && input.payload.channelCode !== "alipay" && input.payload.channelCode !== "wxpay"
      ? input.payload.channelCode
      : input.account.channelCode,
  );

  if (channelCode !== input.account.channelCode) {
    throw new AppError(
      "CTF_BILL_CHANNEL_MISMATCH",
      `账单通道 ${channelCode} 与通道实例 ${input.account.channelCode} 不匹配。`,
      409,
    );
  }

  const fingerprint = buildCtfBillCaptureFingerprint({
    accountId: input.account.id,
    channelCode,
    payload: input.payload,
  });

  let duplicate = false;
  let event = await prisma.ctfBillCaptureEvent.findUnique({ where: { fingerprint } });

  if (event) {
    duplicate = true;
  } else {
    event = await prisma.ctfBillCaptureEvent.create({
      data: {
        merchantChannelAccountId: input.account.id,
        channelCode,
        captureSource: input.payload.source ?? input.account.config.sourceHint ?? null,
        externalBillId: input.payload.externalBillId ?? null,
        payerAccount: input.payload.payerAccount ?? null,
        amount: input.payload.amount,
        currency: input.payload.currency ?? CNY,
        paidAt: input.payload.paidAt,
        remark: input.payload.remark ?? null,
        rawPayload: input.payload.rawPayload as Prisma.InputJsonValue,
        fingerprint,
        status: CtfBillCaptureStatus.RECEIVED,
      },
    });
  }

  if (input.matchImmediately !== false && event.status === CtfBillCaptureStatus.RECEIVED) {
    const result = await matchCtfBillCaptureEvent(event.id, {
      matchWindowMinutes: input.matchWindowMinutes,
    });
    if (result.matched) {
      const matched = await prisma.ctfBillCaptureEvent.findUniqueOrThrow({
        where: { id: event.id },
      });
      return {
        eventId: matched.id,
        duplicate,
        matched: true,
        matchedPaymentOrderId: matched.matchedPaymentOrderId,
        status: matched.status,
      };
    }
  }

  return {
    eventId: event.id,
    duplicate,
    matched: event.status === CtfBillCaptureStatus.MATCHED,
    matchedPaymentOrderId: event.matchedPaymentOrderId,
    status: event.status,
  };
}

export async function getCtfBillCaptureWorkerConfig() {
  const { getSystemConfig } = await import("@/lib/system-config");
  const [intervalMsRaw, batchSizeRaw, matchWindowRaw, maxAttemptsRaw, retryBaseSecondsRaw] = await Promise.all([
    getSystemConfig("CTF_BILL_CAPTURE_INTERVAL_MS"),
    getSystemConfig("CTF_BILL_CAPTURE_BATCH_SIZE"),
    getSystemConfig("CTF_BILL_CAPTURE_MATCH_WINDOW_MINUTES"),
    getSystemConfig("CTF_BILL_CAPTURE_MAX_ATTEMPTS"),
    getSystemConfig("CTF_BILL_CAPTURE_RETRY_BASE_SECONDS"),
  ]);

  return {
    intervalMs: parsePositiveInteger(intervalMsRaw, 10_000),
    batchSize: parsePositiveInteger(batchSizeRaw, DEFAULT_CTF_BILL_MATCH_BATCH_SIZE),
    matchWindowMinutes: parsePositiveInteger(
      matchWindowRaw,
      DEFAULT_CTF_BILL_MATCH_WINDOW_MINUTES,
    ),
    maxAttempts: parsePositiveInteger(maxAttemptsRaw, DEFAULT_CTF_BILL_MAX_ATTEMPTS),
    retryBaseSeconds: parsePositiveInteger(
      retryBaseSecondsRaw,
      DEFAULT_CTF_BILL_RETRY_BASE_SECONDS,
    ),
  };
}

function parsePositiveInteger(raw: string | undefined, fallback: number) {
  if (!raw) {
    return fallback;
  }

  const numeric = Number(raw);
  return Number.isInteger(numeric) && numeric > 0 ? numeric : fallback;
}

export async function runDueCtfBillCaptureMatches(input?: {
  limit?: number;
  matchWindowMinutes?: number;
  maxAttempts?: number;
  retryBaseSeconds?: number;
}) {
  const prisma = getPrismaClient();
  const now = new Date();
  const maxAttempts = input?.maxAttempts ?? DEFAULT_CTF_BILL_MAX_ATTEMPTS;
  const retryBaseSeconds = input?.retryBaseSeconds ?? DEFAULT_CTF_BILL_RETRY_BASE_SECONDS;
  const events = await prisma.ctfBillCaptureEvent.findMany({
    where: {
      status: CtfBillCaptureStatus.RECEIVED,
      merchantChannelAccountId: { not: null },
      OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }],
    },
    orderBy: [{ paidAt: "asc" }, { createdAt: "asc" }],
    take: input?.limit ?? DEFAULT_CTF_BILL_MATCH_BATCH_SIZE,
    select: { id: true, attemptCount: true },
  });

  let matchedCount = 0;
  let stillOpenCount = 0;
  let errorCount = 0;
  let deadLetterCount = 0;

  for (const event of events) {
    const claimed = await prisma.ctfBillCaptureEvent.updateMany({
      where: {
        id: event.id,
        status: CtfBillCaptureStatus.RECEIVED,
        OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }],
      },
      data: {
        nextAttemptAt: new Date(Date.now() + CTF_BILL_CLAIM_LEASE_MS),
      },
    });
    if (claimed.count !== 1) {
      continue;
    }

    const attemptCount = event.attemptCount + 1;
    const deadLetter = attemptCount >= maxAttempts;
    const nextAttemptAt = deadLetter
      ? null
      : new Date(Date.now() + retryBaseSeconds * 1_000 * 2 ** (attemptCount - 1));

    try {
      const result = await matchCtfBillCaptureEvent(event.id, {
        matchWindowMinutes: input?.matchWindowMinutes,
      });
      if (result.matched) {
        matchedCount += 1;
      } else {
        stillOpenCount += 1;
        await prisma.ctfBillCaptureEvent.updateMany({
          where: { id: event.id, status: CtfBillCaptureStatus.RECEIVED },
          data: {
            attemptCount,
            lastAttemptAt: new Date(),
            nextAttemptAt,
            status: deadLetter
              ? CtfBillCaptureStatus.DEAD_LETTER
              : CtfBillCaptureStatus.RECEIVED,
            failureCode: deadLetter ? "MATCH_ATTEMPTS_EXHAUSTED" : "NO_MATCH",
            failureMessage: null,
          },
        });
        if (deadLetter) deadLetterCount += 1;
      }
    } catch (error) {
      errorCount += 1;
      await prisma.ctfBillCaptureEvent.updateMany({
        where: { id: event.id, status: CtfBillCaptureStatus.RECEIVED },
        data: {
          attemptCount,
          lastAttemptAt: new Date(),
          nextAttemptAt,
          status: deadLetter
            ? CtfBillCaptureStatus.DEAD_LETTER
            : CtfBillCaptureStatus.RECEIVED,
          failureCode: deadLetter ? "MATCH_ATTEMPTS_EXHAUSTED" : "MATCH_ERROR",
          failureMessage: error instanceof Error ? error.message.slice(0, 2_000) : String(error).slice(0, 2_000),
        },
      });
      if (deadLetter) deadLetterCount += 1;
      console.error(
        `[ctf-bill-capture] failed to match event ${event.id}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  return {
    selectedCount: events.length,
    matchedCount,
    stillOpenCount,
    errorCount,
    deadLetterCount,
  };
}
