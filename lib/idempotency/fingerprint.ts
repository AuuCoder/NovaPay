import { createHash } from "node:crypto";

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => sortValue(item));
  }

  if (typeof value !== "object" || value === null) {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nestedValue]) => [key, sortValue(nestedValue)]),
  );
}

function hashSummary(summary: unknown) {
  return createHash("sha256").update(JSON.stringify(sortValue(summary))).digest("hex");
}

export function buildCreateOrderIdempotencySummary(input: {
  merchantCode: string;
  channelCode: string;
  externalOrderId: string;
  amount: string;
  currency: string;
  subject: string;
  description?: string | null;
  returnUrl?: string | null;
  callbackUrl?: string | null;
  metadata?: Record<string, unknown>;
}) {
  const summary = {
    merchantCode: input.merchantCode,
    channelCode: input.channelCode,
    externalOrderId: input.externalOrderId,
    amount: input.amount,
    currency: input.currency,
    subject: input.subject,
    description: input.description ?? null,
    returnUrl: input.returnUrl ?? null,
    callbackUrl: input.callbackUrl ?? null,
    metadata: input.metadata ?? null,
  };

  return {
    summary,
    requestHash: hashSummary(summary),
  };
}

export function buildCloseOrderIdempotencySummary(input: {
  merchantCode: string;
  orderReference: string;
}) {
  const summary = {
    merchantCode: input.merchantCode,
    orderReference: input.orderReference,
  };

  return {
    summary,
    requestHash: hashSummary(summary),
  };
}

export function buildCreateRefundIdempotencySummary(input: {
  merchantCode: string;
  orderReference: string;
  externalRefundId: string;
  amount: string;
  reason?: string | null;
  metadata?: Record<string, unknown>;
}) {
  const summary = {
    merchantCode: input.merchantCode,
    orderReference: input.orderReference,
    externalRefundId: input.externalRefundId,
    amount: input.amount,
    reason: input.reason ?? null,
    metadata: input.metadata ?? null,
  };

  return {
    summary,
    requestHash: hashSummary(summary),
  };
}
