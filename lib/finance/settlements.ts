import {
  MerchantLedgerDirection,
  MerchantLedgerEntryType,
  MerchantSettlementStatus,
} from "@/generated/prisma/enums";
import { AppError } from "@/lib/errors";
import {
  addDaysToDayKey,
  buildDailyBalanceSnapshots,
  buildSettlementDigest,
  endOfShanghaiDay,
  formatStoredMoney,
  startOfShanghaiDay,
  toAmountNumber,
  toShanghaiDayKey,
} from "@/lib/finance/calculations";
import { backfillMerchantLedgerEntries } from "@/lib/finance/ledger";
import { getPrismaClient } from "@/lib/prisma";
import { getSystemConfig } from "@/lib/system-config";

const DEFAULT_FINANCE_WORKER_INTERVAL_MS = 60_000;
const DEFAULT_SETTLEMENT_HOLD_DAYS = 1;

function parsePositiveInteger(raw: string | undefined, fallback: number) {
  if (!raw) {
    return fallback;
  }

  const numeric = Number(raw);
  return Number.isInteger(numeric) && numeric >= 0 ? numeric : fallback;
}

export async function getFinanceWorkerConfig() {
  const [intervalMsRaw, holdDaysRaw] = await Promise.all([
    getSystemConfig("FINANCE_WORKER_INTERVAL_MS"),
    getSystemConfig("SETTLEMENT_HOLD_DAYS"),
  ]);

  return {
    intervalMs: parsePositiveInteger(intervalMsRaw, DEFAULT_FINANCE_WORKER_INTERVAL_MS),
    settlementHoldDays: parsePositiveInteger(holdDaysRaw, DEFAULT_SETTLEMENT_HOLD_DAYS),
  };
}

async function syncMerchantSettlements(input?: { holdDays?: number }) {
  const prisma = getPrismaClient();
  const holdDays = input?.holdDays ?? (await getFinanceWorkerConfig()).settlementHoldDays;
  const cutoffDayKey = addDaysToDayKey(toShanghaiDayKey(new Date()), -holdDays);
  const cutoffAt = endOfShanghaiDay(cutoffDayKey);
  const entries = await prisma.merchantLedgerEntry.findMany({
    where: {
      occurredAt: {
        lte: cutoffAt,
      },
      type: {
        in: [
          MerchantLedgerEntryType.PAYMENT_CAPTURE,
          MerchantLedgerEntryType.PAYMENT_FEE,
          MerchantLedgerEntryType.REFUND,
          MerchantLedgerEntryType.ADJUSTMENT,
        ],
      },
    },
    select: {
      merchantId: true,
      currency: true,
      occurredAt: true,
      type: true,
      direction: true,
      amount: true,
    },
    orderBy: [{ merchantId: "asc" }, { occurredAt: "asc" }, { createdAt: "asc" }],
  });

  const grouped = new Map<
    string,
    {
      merchantId: string;
      currency: string;
      dayKey: string;
      entries: Array<{
        type: string;
        direction: string;
        amount: { toString(): string };
      }>;
    }
  >();

  for (const entry of entries) {
    const dayKey = toShanghaiDayKey(entry.occurredAt);

    if (dayKey > cutoffDayKey) {
      continue;
    }

    const key = `${entry.merchantId}:${entry.currency}:${dayKey}`;
    const bucket =
      grouped.get(key) ??
      {
        merchantId: entry.merchantId,
        currency: entry.currency,
        dayKey,
        entries: [],
      };

    bucket.entries.push({
      type: entry.type,
      direction: entry.direction,
      amount: entry.amount,
    });
    grouped.set(key, bucket);
  }

  let created = 0;
  let updated = 0;
  let locked = 0;

  for (const bucket of grouped.values()) {
    const settlementDate = startOfShanghaiDay(bucket.dayKey);
    const digest = buildSettlementDigest(bucket.entries);
    const existing = await prisma.merchantSettlement.findUnique({
      where: {
        merchantId_settlementDate_currency: {
          merchantId: bucket.merchantId,
          settlementDate,
          currency: bucket.currency,
        },
      },
    });

    if (existing?.status === MerchantSettlementStatus.PAID) {
      locked += 1;
      continue;
    }

    const payload = {
      merchantId: bucket.merchantId,
      settlementDate,
      eligibleAt: endOfShanghaiDay(addDaysToDayKey(bucket.dayKey, holdDays)),
      currency: bucket.currency,
      grossAmount: digest.grossAmount,
      refundAmount: digest.refundAmount,
      feeAmount: digest.feeAmount,
      adjustmentAmount: digest.adjustmentAmount,
      netAmount: digest.netAmount,
    };

    await prisma.merchantSettlement.upsert({
      where: {
        merchantId_settlementDate_currency: {
          merchantId: bucket.merchantId,
          settlementDate,
          currency: bucket.currency,
        },
      },
      update: {
        ...payload,
        status: existing?.status ?? MerchantSettlementStatus.PENDING,
        note: existing?.note ?? null,
      },
      create: {
        ...payload,
        status: MerchantSettlementStatus.PENDING,
      },
    });

    if (existing) {
      updated += 1;
    } else {
      created += 1;
    }
  }

  return {
    created,
    updated,
    locked,
    settlementDays: grouped.size,
    cutoffDayKey,
    holdDays,
  };
}

async function syncMerchantBalanceSnapshots() {
  const prisma = getPrismaClient();
  const entries = await prisma.merchantLedgerEntry.findMany({
    select: {
      merchantId: true,
      currency: true,
      occurredAt: true,
      direction: true,
      amount: true,
    },
    orderBy: [{ merchantId: "asc" }, { occurredAt: "asc" }, { createdAt: "asc" }],
  });

  const grouped = new Map<
    string,
    {
      merchantId: string;
      currency: string;
      dayKey: string;
      creditAmount: number;
      debitAmount: number;
    }
  >();

  for (const entry of entries) {
    const dayKey = toShanghaiDayKey(entry.occurredAt);
    const key = `${entry.merchantId}:${entry.currency}:${dayKey}`;
    const bucket =
      grouped.get(key) ??
      {
        merchantId: entry.merchantId,
        currency: entry.currency,
        dayKey,
        creditAmount: 0,
        debitAmount: 0,
      };

    const amount = toAmountNumber(entry.amount);

    if (entry.direction === MerchantLedgerDirection.CREDIT) {
      bucket.creditAmount += amount;
    } else {
      bucket.debitAmount += amount;
    }

    grouped.set(key, bucket);
  }

  const snapshots = buildDailyBalanceSnapshots(
    Array.from(grouped.values()).map((entry) => ({
      merchantId: entry.merchantId,
      currency: entry.currency,
      dayKey: entry.dayKey,
      creditAmount: entry.creditAmount,
      debitAmount: entry.debitAmount,
    })),
  );

  for (const snapshot of snapshots) {
    await prisma.merchantBalanceSnapshot.upsert({
      where: {
        merchantId_snapshotDate_currency: {
          merchantId: snapshot.merchantId,
          snapshotDate: startOfShanghaiDay(snapshot.dayKey),
          currency: snapshot.currency,
        },
      },
      update: {
        openingBalance: snapshot.openingBalance,
        closingBalance: snapshot.closingBalance,
        totalCredit: snapshot.totalCredit,
        totalDebit: snapshot.totalDebit,
      },
      create: {
        merchantId: snapshot.merchantId,
        snapshotDate: startOfShanghaiDay(snapshot.dayKey),
        currency: snapshot.currency,
        openingBalance: snapshot.openingBalance,
        closingBalance: snapshot.closingBalance,
        totalCredit: snapshot.totalCredit,
        totalDebit: snapshot.totalDebit,
      },
    });
  }

  return {
    snapshots: snapshots.length,
  };
}

export async function runFinanceMaintenance(input?: { holdDays?: number }) {
  const ledger = await backfillMerchantLedgerEntries();
  const settlements = await syncMerchantSettlements({
    holdDays: input?.holdDays,
  });
  const balanceSnapshots = await syncMerchantBalanceSnapshots();

  return {
    ledger,
    settlements,
    balanceSnapshots,
  };
}

export async function markMerchantSettlementPaid(input: { settlementId: string }) {
  const prisma = getPrismaClient();
  const now = new Date();
  const settlement = await prisma.$transaction(async (tx) => {
    const existing = await tx.merchantSettlement.findUnique({
      where: {
        id: input.settlementId,
      },
      include: {
        merchant: {
          select: {
            code: true,
            name: true,
          },
        },
      },
    });

    if (!existing) {
      throw new AppError("SETTLEMENT_NOT_FOUND", "Settlement was not found.", 404);
    }

    if (existing.status === MerchantSettlementStatus.PAID) {
      return existing;
    }

    if (toAmountNumber(existing.netAmount) <= 0) {
      throw new AppError(
        "SETTLEMENT_NOT_PAYABLE",
        "Only positive settlement balances can be marked as paid.",
        409,
      );
    }

    await tx.merchantLedgerEntry.upsert({
      where: {
        externalKey: `settlement:payout:${existing.id}`,
      },
      update: {
        merchantId: existing.merchantId,
        paymentOrderId: null,
        paymentRefundId: null,
        settlementId: existing.id,
        type: MerchantLedgerEntryType.SETTLEMENT_PAYOUT,
        direction: MerchantLedgerDirection.DEBIT,
        amount: existing.netAmount,
        currency: existing.currency,
        description: `结算打款 ${existing.merchant.code} ${toShanghaiDayKey(existing.settlementDate)}`,
        metadata: {
          merchantCode: existing.merchant.code,
          settlementDate: existing.settlementDate.toISOString(),
        },
        occurredAt: now,
      },
      create: {
        merchantId: existing.merchantId,
        settlementId: existing.id,
        type: MerchantLedgerEntryType.SETTLEMENT_PAYOUT,
        direction: MerchantLedgerDirection.DEBIT,
        amount: existing.netAmount,
        currency: existing.currency,
        description: `结算打款 ${existing.merchant.code} ${toShanghaiDayKey(existing.settlementDate)}`,
        externalKey: `settlement:payout:${existing.id}`,
        metadata: {
          merchantCode: existing.merchant.code,
          settlementDate: existing.settlementDate.toISOString(),
        },
        occurredAt: now,
      },
    });

    return tx.merchantSettlement.update({
      where: {
        id: existing.id,
      },
      data: {
        status: MerchantSettlementStatus.PAID,
        paidAt: now,
      },
      include: {
        merchant: {
          select: {
            code: true,
            name: true,
          },
        },
      },
    });
  });

  await syncMerchantBalanceSnapshots();

  return {
    settlement,
    paidAmount: formatStoredMoney(settlement.netAmount),
  };
}
