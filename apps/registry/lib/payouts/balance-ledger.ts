/**
 * Developer balance ledger and payout request lifecycle (Req 4.1, 4.2, 4.3, 4.6).
 *
 * Each license sale credits the developer's balance (after revenue share)
 * within 24 hours. Payout submissions move funds from `available` to `frozen`
 * until an admin approves or rejects. Insufficient available balance triggers
 * INSUFFICIENT_BALANCE.
 *
 * Production uses the Prisma-backed implementation; the in-memory variant is
 * kept for unit tests.
 */

import { randomUUID } from "node:crypto";
import { getSettlementSettings } from "../settlement/settings";

export interface LedgerEntry {
  id: string;
  developerId: string;
  /** Positive cents = credit, negative = debit */
  amountCents: number;
  currency: string;
  reason: string;
  /** External reference (orderId, payoutRequestId, …) for idempotency */
  externalRef: string;
  occurredAt: Date;
}

export interface PayoutRequest {
  id: string;
  developerId: string;
  payoutAccountId: string;
  amountCents: number;
  currency: string;
  state: "PENDING_REVIEW" | "APPROVED" | "REJECTED" | "PROCESSING" | "COMPLETED" | "FAILED";
  adminNote?: string | null;
  createdAt: Date;
  updatedAt: Date;
  processedAt?: Date | null;
}

export interface BalanceSnapshot {
  available: number;
  frozen: number;
  total: number;
  currency: string;
}

export interface BalanceLedger {
  credit(input: {
    developerId: string;
    amountCents: number;
    currency: string;
    reason: string;
    externalRef: string;
  }): Promise<LedgerEntry>;
  getBalance(developerId: string, currency?: string): Promise<BalanceSnapshot>;
  submitPayout(input: {
    developerId: string;
    payoutAccountId: string;
    amountCents: number;
    currency?: string;
  }): Promise<{ success: boolean; errorCode?: "INSUFFICIENT_BALANCE" | "INVALID_AMOUNT"; request?: PayoutRequest }>;
  approvePayout(input: {
    requestId: string;
    adminNote?: string;
  }): Promise<{ success: boolean; errorCode?: "NOT_FOUND" | "INVALID_STATE"; request?: PayoutRequest }>;
  rejectPayout(input: {
    requestId: string;
    adminNote: string;
  }): Promise<{ success: boolean; errorCode?: "NOT_FOUND" | "INVALID_STATE"; request?: PayoutRequest }>;
  listPayouts(developerId?: string): Promise<PayoutRequest[]>;
  listEntries(developerId: string): Promise<LedgerEntry[]>;
}

interface HoldDaysOptions {
  holdDaysResolver?: () => number | Promise<number>;
}

const DEFAULT_CURRENCY = "CNY";

function computeHeldCreditsFromEntries(input: {
  entries: LedgerEntry[];
  developerId: string;
  currency: string;
  holdDays: number;
  now?: Date;
}) {
  if (input.holdDays <= 0) {
    return 0;
  }

  const holdThreshold = (input.now ?? new Date()).getTime() - input.holdDays * 24 * 60 * 60 * 1000;

  return input.entries.reduce((sum, entry) => {
    if (
      entry.developerId === input.developerId &&
      entry.currency === input.currency &&
      entry.amountCents > 0 &&
      entry.reason === "LICENSE_SALE" &&
      entry.occurredAt.getTime() > holdThreshold
    ) {
      return sum + entry.amountCents;
    }
    return sum;
  }, 0);
}

export function createInMemoryBalanceLedger(
  options: HoldDaysOptions = {},
): BalanceLedger {
  const entries: LedgerEntry[] = [];
  const payouts = new Map<string, PayoutRequest>();
  const seenRefs = new Set<string>();

  async function resolveHoldDays() {
    return Math.max(0, Math.trunc((await options.holdDaysResolver?.()) ?? 0));
  }

  async function computeBalance(developerId: string, currency: string): Promise<BalanceSnapshot> {
    let total = 0;
    for (const entry of entries) {
      if (entry.developerId === developerId && entry.currency === currency) {
        total += entry.amountCents;
      }
    }
    let frozen = 0;
    for (const payout of payouts.values()) {
      if (
        payout.developerId === developerId &&
        payout.currency === currency &&
        payout.state === "PENDING_REVIEW"
      ) {
        frozen += payout.amountCents;
      }
    }
    const heldCredits = computeHeldCreditsFromEntries({
      entries,
      developerId,
      currency,
      holdDays: await resolveHoldDays(),
    });
    return {
      total,
      frozen: frozen + heldCredits,
      available: total - frozen - heldCredits,
      currency,
    };
  }

  return {
    async credit(input) {
      if (seenRefs.has(input.externalRef)) {
        const existing = entries.find((e) => e.externalRef === input.externalRef);
        if (existing) return { ...existing };
      }
      const entry: LedgerEntry = {
        id: `led_${randomUUID()}`,
        developerId: input.developerId,
        amountCents: input.amountCents,
        currency: input.currency,
        reason: input.reason,
        externalRef: input.externalRef,
        occurredAt: new Date(),
      };
      entries.push(entry);
      seenRefs.add(input.externalRef);
      return { ...entry };
    },

    async getBalance(developerId, currency = DEFAULT_CURRENCY) {
      return computeBalance(developerId, currency);
    },

    async submitPayout({ developerId, payoutAccountId, amountCents, currency = DEFAULT_CURRENCY }) {
      if (amountCents <= 0) {
        return { success: false, errorCode: "INVALID_AMOUNT" };
      }
      const balance = await computeBalance(developerId, currency);
      if (balance.available < amountCents) {
        return { success: false, errorCode: "INSUFFICIENT_BALANCE" };
      }
      const now = new Date();
      const request: PayoutRequest = {
        id: `pyo_${randomUUID()}`,
        developerId,
        payoutAccountId,
        amountCents,
        currency,
        state: "PENDING_REVIEW",
        createdAt: now,
        updatedAt: now,
      };
      payouts.set(request.id, request);
      return { success: true, request: { ...request } };
    },

    async approvePayout({ requestId, adminNote }) {
      const req = payouts.get(requestId);
      if (!req) return { success: false, errorCode: "NOT_FOUND" };
      if (req.state !== "PENDING_REVIEW") {
        return { success: false, errorCode: "INVALID_STATE" };
      }
      req.state = "APPROVED";
      req.adminNote = adminNote ?? null;
      req.updatedAt = new Date();
      entries.push({
        id: `led_${randomUUID()}`,
        developerId: req.developerId,
        amountCents: -req.amountCents,
        currency: req.currency,
        reason: "PAYOUT_APPROVED",
        externalRef: req.id,
        occurredAt: new Date(),
      });
      seenRefs.add(req.id);
      return { success: true, request: { ...req } };
    },

    async rejectPayout({ requestId, adminNote }) {
      const req = payouts.get(requestId);
      if (!req) return { success: false, errorCode: "NOT_FOUND" };
      if (req.state !== "PENDING_REVIEW") {
        return { success: false, errorCode: "INVALID_STATE" };
      }
      req.state = "REJECTED";
      req.adminNote = adminNote;
      req.updatedAt = new Date();
      return { success: true, request: { ...req } };
    },

    async listPayouts(developerId) {
      return [...payouts.values()]
        .filter((p) => !developerId || p.developerId === developerId)
        .map((p) => ({ ...p }));
    },

    async listEntries(developerId) {
      return entries
        .filter((e) => e.developerId === developerId)
        .map((e) => ({ ...e }));
    },
  };
}

interface PrismaLedgerLike {
  registryLedgerEntry: {
    findMany(args: unknown): Promise<unknown[]>;
    findFirst(args: unknown): Promise<unknown>;
    create(args: unknown): Promise<unknown>;
  };
  payoutRequest: {
    findMany(args: unknown): Promise<unknown[]>;
    findUnique(args: unknown): Promise<unknown>;
    create(args: unknown): Promise<unknown>;
    update(args: unknown): Promise<unknown>;
  };
}

interface LedgerEntryRow {
  id: string;
  developerId: string;
  amountCents: number;
  currency: string;
  reason: string;
  externalRef: string;
  occurredAt: Date;
}

interface PayoutRequestRow {
  id: string;
  developerId: string;
  payoutAccountId: string;
  amountCents: number;
  currency: string;
  state: PayoutRequest["state"];
  adminNote: string | null;
  createdAt: Date;
  updatedAt: Date;
  processedAt: Date | null;
}

function fromLedgerRow(row: LedgerEntryRow): LedgerEntry {
  return {
    id: row.id,
    developerId: row.developerId,
    amountCents: row.amountCents,
    currency: row.currency,
    reason: row.reason,
    externalRef: row.externalRef,
    occurredAt: row.occurredAt,
  };
}

function fromPayoutRow(row: PayoutRequestRow): PayoutRequest {
  return {
    id: row.id,
    developerId: row.developerId,
    payoutAccountId: row.payoutAccountId,
    amountCents: row.amountCents,
    currency: row.currency,
    state: row.state,
    adminNote: row.adminNote,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    processedAt: row.processedAt,
  };
}

export function createPrismaBalanceLedger(
  prisma: PrismaLedgerLike,
  options: HoldDaysOptions = {},
): BalanceLedger {
  async function resolveHoldDays() {
    if (options.holdDaysResolver) {
      return Math.max(0, Math.trunc(await options.holdDaysResolver()));
    }
    const settings = await getSettlementSettings();
    return Math.max(0, Math.trunc(settings.payoutHoldDays));
  }

  async function fetchEntries(developerId: string, currency: string): Promise<LedgerEntry[]> {
    const rows = (await prisma.registryLedgerEntry.findMany({
      where: { developerId, currency },
    })) as LedgerEntryRow[];
    return rows.map(fromLedgerRow);
  }

  async function computeBalance(developerId: string, currency: string): Promise<BalanceSnapshot> {
    const entries = await fetchEntries(developerId, currency);
    const total = entries.reduce((sum, entry) => sum + entry.amountCents, 0);

    const pendingPayouts = (await prisma.payoutRequest.findMany({
      where: { developerId, currency, state: "PENDING_REVIEW" },
    })) as PayoutRequestRow[];
    const frozen = pendingPayouts.reduce((sum, row) => sum + row.amountCents, 0);

    const heldCredits = computeHeldCreditsFromEntries({
      entries,
      developerId,
      currency,
      holdDays: await resolveHoldDays(),
    });

    return {
      total,
      frozen: frozen + heldCredits,
      available: total - frozen - heldCredits,
      currency,
    };
  }

  return {
    async credit(input) {
      const existing = (await prisma.registryLedgerEntry.findFirst({
        where: { externalRef: input.externalRef },
      })) as LedgerEntryRow | null;
      if (existing) {
        return fromLedgerRow(existing);
      }
      const row = (await prisma.registryLedgerEntry.create({
        data: {
          id: `led_${randomUUID()}`,
          developerId: input.developerId,
          amountCents: input.amountCents,
          currency: input.currency,
          reason: input.reason,
          externalRef: input.externalRef,
        },
      })) as LedgerEntryRow;
      return fromLedgerRow(row);
    },

    async getBalance(developerId, currency = DEFAULT_CURRENCY) {
      return computeBalance(developerId, currency);
    },

    async submitPayout({ developerId, payoutAccountId, amountCents, currency = DEFAULT_CURRENCY }) {
      if (amountCents <= 0) {
        return { success: false, errorCode: "INVALID_AMOUNT" };
      }
      const balance = await computeBalance(developerId, currency);
      if (balance.available < amountCents) {
        return { success: false, errorCode: "INSUFFICIENT_BALANCE" };
      }
      const row = (await prisma.payoutRequest.create({
        data: {
          id: `pyo_${randomUUID()}`,
          developerId,
          payoutAccountId,
          amountCents,
          currency,
          state: "PENDING_REVIEW",
        },
      })) as PayoutRequestRow;
      return { success: true, request: fromPayoutRow(row) };
    },

    async approvePayout({ requestId, adminNote }) {
      const existing = (await prisma.payoutRequest.findUnique({
        where: { id: requestId },
      })) as PayoutRequestRow | null;
      if (!existing) return { success: false, errorCode: "NOT_FOUND" };
      if (existing.state !== "PENDING_REVIEW") {
        return { success: false, errorCode: "INVALID_STATE" };
      }

      const updated = (await prisma.payoutRequest.update({
        where: { id: requestId },
        data: {
          state: "APPROVED",
          adminNote: adminNote ?? null,
          processedAt: new Date(),
        },
      })) as PayoutRequestRow;

      // Append a debit ledger entry to deduct the payout immediately.
      await prisma.registryLedgerEntry.create({
        data: {
          id: `led_${randomUUID()}`,
          developerId: existing.developerId,
          amountCents: -existing.amountCents,
          currency: existing.currency,
          reason: "PAYOUT_APPROVED",
          externalRef: existing.id,
        },
      });

      return { success: true, request: fromPayoutRow(updated) };
    },

    async rejectPayout({ requestId, adminNote }) {
      const existing = (await prisma.payoutRequest.findUnique({
        where: { id: requestId },
      })) as PayoutRequestRow | null;
      if (!existing) return { success: false, errorCode: "NOT_FOUND" };
      if (existing.state !== "PENDING_REVIEW") {
        return { success: false, errorCode: "INVALID_STATE" };
      }

      const updated = (await prisma.payoutRequest.update({
        where: { id: requestId },
        data: {
          state: "REJECTED",
          adminNote,
          processedAt: new Date(),
        },
      })) as PayoutRequestRow;

      return { success: true, request: fromPayoutRow(updated) };
    },

    async listPayouts(developerId) {
      const rows = (await prisma.payoutRequest.findMany({
        where: developerId ? { developerId } : undefined,
        orderBy: { createdAt: "desc" },
      })) as PayoutRequestRow[];
      return rows.map(fromPayoutRow);
    },

    async listEntries(developerId) {
      const rows = (await prisma.registryLedgerEntry.findMany({
        where: { developerId },
        orderBy: { occurredAt: "desc" },
      })) as LedgerEntryRow[];
      return rows.map(fromLedgerRow);
    },
  };
}
