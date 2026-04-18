import { PaymentStatus } from "@/generated/prisma/enums";
import { getPrismaClient } from "@/lib/prisma";
import { getSystemConfig } from "@/lib/system-config";

export type UsdtRateSource = "coingecko" | "coinpaprika" | "fallback_fixed";
type RemoteUsdtRateSource = Exclude<UsdtRateSource, "fallback_fixed">;

export interface UsdtQuoteResult {
  rate: number;
  source: UsdtRateSource;
  quotedAt: Date;
  expiresAt: Date;
  spreadBps: number;
}

export interface UsdtTailAllocationResult {
  baseQuotedAmount: string;
  payableAmount: string;
  tailOffsetAmount: string;
  tailSlot: number;
  tailStepAmount: string;
  tailMaxAmount: string;
}

const DEFAULT_FIXED_RATE = 7.2;
const DEFAULT_MIN_RATE = 6.0;
const DEFAULT_MAX_RATE = 8.5;
const DEFAULT_QUOTE_TTL_SECONDS = 900;
const DEFAULT_SPREAD_BPS = 150;
const DEFAULT_PRIMARY_SOURCE: RemoteUsdtRateSource = "coingecko";
const DEFAULT_SECONDARY_SOURCE: RemoteUsdtRateSource = "coinpaprika";
const DEFAULT_REQUEST_TIMEOUT_MS = 8_000;
const USDT_AMOUNT_SCALE = 4;
const USDT_AMOUNT_UNITS = 10 ** USDT_AMOUNT_SCALE;
const DEFAULT_TAIL_STEP_USDT = 0.0001;
const DEFAULT_TAIL_MAX_USDT = 0.0099;
const DEFAULT_TAIL_RELATIVE_MAX_BPS = 30;

function parsePositiveNumber(value: string | undefined, fallback: number) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : fallback;
}

function parseNonNegativeInteger(value: string | undefined, fallback: number) {
  const numeric = Number(value);
  return Number.isInteger(numeric) && numeric >= 0 ? numeric : fallback;
}

function toRemoteRateSource(value: string | undefined, fallback: RemoteUsdtRateSource) {
  return value === "coingecko" || value === "coinpaprika" ? value : fallback;
}

function assertReasonableRate(rate: number, minRate: number, maxRate: number, source: string) {
  if (!Number.isFinite(rate) || rate <= 0) {
    throw new Error(`Invalid USDT/CNY rate from ${source}.`);
  }

  if (rate < minRate || rate > maxRate) {
    throw new Error(`USDT/CNY rate from ${source} is out of range: ${rate}.`);
  }
}

async function fetchJson(url: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      cache: "no-store",
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    return (await response.json()) as unknown;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchCoinGeckoRate() {
  const payload = (await fetchJson(
    "https://api.coingecko.com/api/v3/simple/price?ids=tether&vs_currencies=cny&include_last_updated_at=true",
  )) as {
    tether?: {
      cny?: unknown;
    };
  };
  const rate = Number(payload.tether?.cny);

  if (!Number.isFinite(rate) || rate <= 0) {
    throw new Error("CoinGecko returned an invalid tether.cny value.");
  }

  return rate;
}

async function fetchCoinPaprikaRate() {
  const payload = (await fetchJson(
    "https://api.coinpaprika.com/v1/tickers/usdt-tether?quotes=CNY",
  )) as {
    quotes?: {
      CNY?: {
        price?: unknown;
      };
    };
  };
  const rate = Number(payload.quotes?.CNY?.price);

  if (!Number.isFinite(rate) || rate <= 0) {
    throw new Error("CoinPaprika returned an invalid quotes.CNY.price value.");
  }

  return rate;
}

async function fetchRateFromSource(source: RemoteUsdtRateSource) {
  if (source === "coingecko") {
    return fetchCoinGeckoRate();
  }

  return fetchCoinPaprikaRate();
}

export async function getUsdtCnyQuote() {
  const [
    primarySourceRaw,
    secondarySourceRaw,
    fixedRateRaw,
    minRateRaw,
    maxRateRaw,
    quoteTtlRaw,
    spreadBpsRaw,
  ] = await Promise.all([
    getSystemConfig("USDT_RATE_PRIMARY_SOURCE"),
    getSystemConfig("USDT_RATE_SECONDARY_SOURCE"),
    getSystemConfig("USDT_RATE_FIXED_CNY"),
    getSystemConfig("USDT_RATE_MIN_CNY"),
    getSystemConfig("USDT_RATE_MAX_CNY"),
    getSystemConfig("USDT_QUOTE_TTL_SECONDS"),
    getSystemConfig("USDT_QUOTE_SPREAD_BPS"),
  ]);

  const primarySource = toRemoteRateSource(primarySourceRaw, DEFAULT_PRIMARY_SOURCE);
  const secondarySource = toRemoteRateSource(secondarySourceRaw, DEFAULT_SECONDARY_SOURCE);
  const fixedRate = parsePositiveNumber(fixedRateRaw, DEFAULT_FIXED_RATE);
  const minRate = parsePositiveNumber(minRateRaw, DEFAULT_MIN_RATE);
  const maxRate = parsePositiveNumber(maxRateRaw, DEFAULT_MAX_RATE);
  const quoteTtlSeconds = parsePositiveNumber(quoteTtlRaw, DEFAULT_QUOTE_TTL_SECONDS);
  const spreadBps = parseNonNegativeInteger(spreadBpsRaw, DEFAULT_SPREAD_BPS);
  const quotedAt = new Date();
  const expiresAt = new Date(quotedAt.getTime() + quoteTtlSeconds * 1_000);
  const attemptedSources = [...new Set([primarySource, secondarySource])];

  for (const source of attemptedSources) {
    try {
      const rate = await fetchRateFromSource(source);
      assertReasonableRate(rate, minRate, maxRate, source);

      return {
        rate,
        source,
        quotedAt,
        expiresAt,
        spreadBps,
      } satisfies UsdtQuoteResult;
    } catch {
      continue;
    }
  }

  assertReasonableRate(fixedRate, minRate, maxRate, "fallback_fixed");

  return {
    rate: fixedRate,
    source: "fallback_fixed",
    quotedAt,
    expiresAt,
    spreadBps,
  } satisfies UsdtQuoteResult;
}

export function quoteUsdtAmountFromCny(input: {
  cnyAmount: number | string;
  rate: number;
  spreadBps: number;
}) {
  const cnyAmount = Number(input.cnyAmount);

  if (!Number.isFinite(cnyAmount) || cnyAmount <= 0) {
    throw new Error("CNY amount must be a positive number.");
  }

  if (!Number.isFinite(input.rate) || input.rate <= 0) {
    throw new Error("USDT/CNY rate must be a positive number.");
  }

  const rawUsdtAmount = (cnyAmount / input.rate) * (1 + input.spreadBps / 10_000);
  const roundedUsdtAmount =
    Math.floor((rawUsdtAmount + Number.EPSILON) * USDT_AMOUNT_UNITS) / USDT_AMOUNT_UNITS;

  return roundedUsdtAmount.toFixed(USDT_AMOUNT_SCALE);
}

function parseUsdtToUnits(value: string | number) {
  const numeric = typeof value === "number" ? value : Number(value);

  if (!Number.isFinite(numeric) || numeric < 0) {
    throw new Error("USDT amount must be a non-negative number.");
  }

  return Math.floor(numeric * USDT_AMOUNT_UNITS + Number.EPSILON);
}

function formatUnitsToUsdt(units: number) {
  return (units / USDT_AMOUNT_UNITS).toFixed(USDT_AMOUNT_SCALE);
}

function hashString(value: string) {
  let hash = 0;

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }

  return hash;
}

export async function allocateUsdtTailAmount(input: {
  accountId: string;
  channelCode: string;
  orderId: string;
  baseQuotedAmount: string;
}) {
  const [tailStepRaw, tailMaxRaw, tailRelativeMaxBpsRaw] = await Promise.all([
    getSystemConfig("USDT_TAIL_STEP"),
    getSystemConfig("USDT_TAIL_MAX"),
    getSystemConfig("USDT_TAIL_RELATIVE_MAX_BPS"),
  ]);
  const tailStepUnits = parseUsdtToUnits(
    parsePositiveNumber(tailStepRaw, DEFAULT_TAIL_STEP_USDT),
  );
  const absoluteTailMaxUnits = parseUsdtToUnits(
    parsePositiveNumber(tailMaxRaw, DEFAULT_TAIL_MAX_USDT),
  );
  const relativeTailMaxBps = parseNonNegativeInteger(
    tailRelativeMaxBpsRaw,
    DEFAULT_TAIL_RELATIVE_MAX_BPS,
  );
  const baseQuotedUnits = parseUsdtToUnits(input.baseQuotedAmount);
  const relativeTailMaxUnits = Math.floor(
    (baseQuotedUnits * relativeTailMaxBps) / 10_000,
  );
  const effectiveTailMaxUnits = Math.max(
    0,
    Math.min(
      absoluteTailMaxUnits,
      Math.max(tailStepUnits, relativeTailMaxUnits),
    ),
  );
  const maxSlot = Math.floor(effectiveTailMaxUnits / tailStepUnits);

  if (maxSlot < 0) {
    throw new Error("USDT tail range configuration is invalid.");
  }

  const prisma = getPrismaClient();
  const activeOrders = await prisma.paymentOrder.findMany({
    where: {
      merchantChannelAccountId: input.accountId,
      channelCode: input.channelCode,
      payableCurrency: "USDT",
      payableAmount: {
        not: null,
      },
      status: {
        in: [PaymentStatus.PENDING, PaymentStatus.PROCESSING],
      },
      id: {
        not: input.orderId,
      },
      OR: [
        {
          quoteExpiresAt: null,
        },
        {
          quoteExpiresAt: {
            gte: new Date(),
          },
        },
      ],
    },
    select: {
      payableAmount: true,
    },
  });

  const occupiedUnits = new Set(
    activeOrders
      .map((order) => order.payableAmount?.toString() ?? null)
      .filter(Boolean)
      .map((value) => parseUsdtToUnits(value as string)),
  );
  const preferredStartSlot = hashString(input.orderId) % (maxSlot + 1);

  for (let offset = 0; offset <= maxSlot; offset += 1) {
    const slot = (preferredStartSlot + offset) % (maxSlot + 1);
    const tailOffsetUnits = slot * tailStepUnits;
    const payableUnits = baseQuotedUnits + tailOffsetUnits;

    if (occupiedUnits.has(payableUnits)) {
      continue;
    }

    return {
      baseQuotedAmount: formatUnitsToUsdt(baseQuotedUnits),
      payableAmount: formatUnitsToUsdt(payableUnits),
      tailOffsetAmount: formatUnitsToUsdt(tailOffsetUnits),
      tailSlot: slot,
      tailStepAmount: formatUnitsToUsdt(tailStepUnits),
      tailMaxAmount: formatUnitsToUsdt(maxSlot * tailStepUnits),
    } satisfies UsdtTailAllocationResult;
  }

  throw new Error("当前短时间内同金额订单过多，请稍后重试。");
}
