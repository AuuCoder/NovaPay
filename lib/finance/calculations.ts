const SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1000;

export type MoneyLike =
  | { toString(): string }
  | string
  | number
  | null
  | undefined;

export interface FinanceDigestEntry {
  type: string;
  direction: string;
  amount: MoneyLike;
}

export interface DailyBalanceSeed {
  merchantId: string;
  currency: string;
  dayKey: string;
  creditAmount: MoneyLike;
  debitAmount: MoneyLike;
}

function toFiniteNumber(value: MoneyLike) {
  const numeric = Number(
    typeof value === "string" || typeof value === "number" ? value : value?.toString?.() ?? 0,
  );
  return Number.isFinite(numeric) ? numeric : 0;
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function formatStoredMoney(value: MoneyLike) {
  return roundMoney(toFiniteNumber(value)).toFixed(2);
}

export function formatStoredRate(value: MoneyLike) {
  return Math.max(toFiniteNumber(value), 0).toFixed(4);
}

export function toAmountNumber(value: MoneyLike) {
  return roundMoney(toFiniteNumber(value));
}

export function calculatePaymentFeeSnapshot(input: {
  amount: MoneyLike;
  feeRate?: MoneyLike;
}) {
  const amount = Math.max(toAmountNumber(input.amount), 0);
  const feeRate = Math.max(toFiniteNumber(input.feeRate), 0);
  const feeAmount = roundMoney(amount * feeRate);
  const netAmount = roundMoney(amount - feeAmount);

  return {
    feeRate: formatStoredRate(feeRate),
    feeAmount: formatStoredMoney(feeAmount),
    netAmount: formatStoredMoney(netAmount),
  };
}

export function buildSettlementDigest(entries: FinanceDigestEntry[]) {
  let grossAmount = 0;
  let refundAmount = 0;
  let feeAmount = 0;
  let adjustmentAmount = 0;
  let payoutAmount = 0;

  for (const entry of entries) {
    const amount = toAmountNumber(entry.amount);

    switch (entry.type) {
      case "PAYMENT_CAPTURE":
        grossAmount += amount;
        break;
      case "PAYMENT_FEE":
        feeAmount += amount;
        break;
      case "REFUND":
        refundAmount += amount;
        break;
      case "SETTLEMENT_PAYOUT":
        payoutAmount += amount;
        break;
      case "ADJUSTMENT":
        adjustmentAmount += entry.direction === "DEBIT" ? -amount : amount;
        break;
      default:
        break;
    }
  }

  grossAmount = roundMoney(grossAmount);
  refundAmount = roundMoney(refundAmount);
  feeAmount = roundMoney(feeAmount);
  adjustmentAmount = roundMoney(adjustmentAmount);
  payoutAmount = roundMoney(payoutAmount);

  return {
    grossAmount: formatStoredMoney(grossAmount),
    refundAmount: formatStoredMoney(refundAmount),
    feeAmount: formatStoredMoney(feeAmount),
    adjustmentAmount: formatStoredMoney(adjustmentAmount),
    netAmount: formatStoredMoney(grossAmount - refundAmount - feeAmount + adjustmentAmount),
    payoutAmount: formatStoredMoney(payoutAmount),
  };
}

export function toShanghaiDayKey(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new Error("Invalid date value.");
  }

  return new Date(date.getTime() + SHANGHAI_OFFSET_MS).toISOString().slice(0, 10);
}

export function startOfShanghaiDay(dayKey: string) {
  return new Date(`${dayKey}T00:00:00.000+08:00`);
}

export function endOfShanghaiDay(dayKey: string) {
  return new Date(`${dayKey}T23:59:59.999+08:00`);
}

export function addDaysToDayKey(dayKey: string, days: number) {
  const date = startOfShanghaiDay(dayKey);
  date.setUTCDate(date.getUTCDate() + days);
  return toShanghaiDayKey(date);
}

export function buildDailyBalanceSnapshots(rows: DailyBalanceSeed[]) {
  const runningBalance = new Map<string, number>();
  const sorted = [...rows].sort((left, right) => {
    if (left.merchantId !== right.merchantId) {
      return left.merchantId.localeCompare(right.merchantId);
    }

    if (left.currency !== right.currency) {
      return left.currency.localeCompare(right.currency);
    }

    return left.dayKey.localeCompare(right.dayKey);
  });

  return sorted.map((row) => {
    const aggregateKey = `${row.merchantId}:${row.currency}`;
    const openingBalance = runningBalance.get(aggregateKey) ?? 0;
    const totalCredit = toAmountNumber(row.creditAmount);
    const totalDebit = toAmountNumber(row.debitAmount);
    const closingBalance = roundMoney(openingBalance + totalCredit - totalDebit);

    runningBalance.set(aggregateKey, closingBalance);

    return {
      ...row,
      openingBalance: formatStoredMoney(openingBalance),
      closingBalance: formatStoredMoney(closingBalance),
      totalCredit: formatStoredMoney(totalCredit),
      totalDebit: formatStoredMoney(totalDebit),
    };
  });
}
