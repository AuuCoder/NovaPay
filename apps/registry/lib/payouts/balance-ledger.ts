/**
 * Developer balance ledger and payout request lifecycle (Req 4.1, 4.2, 4.3, 4.6).
 *
 * Each license sale credits the developer's balance (after revenue share)
 * within 24 hours. Payout submissions move funds from `available` to `frozen`
 * until an admin approves or rejects. Insufficient available balance triggers
 * INSUFFICIENT_BALANCE.
 *
 * Phase 3 keeps the ledger in memory. Production deployments swap it for a
 * Prisma-backed ledger with append-only entries and idempotent crediting.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import path from "node:path";
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

interface PersistedLedgerEntry extends Omit<LedgerEntry, "occurredAt"> {
  occurredAt: string;
}

interface PersistedPayoutRequest
  extends Omit<PayoutRequest, "createdAt" | "updatedAt" | "processedAt"> {
  createdAt: string;
  updatedAt: string;
  processedAt?: string | null;
}

interface LedgerSnapshot {
  entries: PersistedLedgerEntry[];
  payouts: PersistedPayoutRequest[];
}

function toPersistedEntry(entry: LedgerEntry): PersistedLedgerEntry {
  return {
    ...entry,
    occurredAt: entry.occurredAt.toISOString(),
  };
}

function toPersistedPayout(request: PayoutRequest): PersistedPayoutRequest {
  return {
    ...request,
    createdAt: request.createdAt.toISOString(),
    updatedAt: request.updatedAt.toISOString(),
    processedAt: request.processedAt?.toISOString() ?? null,
  };
}

function toLedgerEntry(entry: PersistedLedgerEntry): LedgerEntry {
  return {
    ...entry,
    occurredAt: new Date(entry.occurredAt),
  };
}

function toPayoutRequest(request: PersistedPayoutRequest): PayoutRequest {
  return {
    ...request,
    createdAt: new Date(request.createdAt),
    updatedAt: new Date(request.updatedAt),
    processedAt: request.processedAt ? new Date(request.processedAt) : null,
  };
}

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
        // Only PENDING_REVIEW freezes funds; once APPROVED a debit ledger entry
        // is recorded so we no longer need to count the request as frozen.
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
      // Debit the developer balance immediately on approval (Req 4.4).
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
      // Frozen amount is released because state is no longer PENDING_REVIEW
      // (computeBalance only freezes pending/approved/processing).
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

export function createPersistentBalanceLedger(
  filePath: string,
  options: HoldDaysOptions = {},
): BalanceLedger {
  function loadSnapshot(): LedgerSnapshot {
    if (!existsSync(filePath)) {
      return { entries: [], payouts: [] };
    }

    try {
      return JSON.parse(readFileSync(filePath, "utf8")) as LedgerSnapshot;
    } catch {
      return { entries: [], payouts: [] };
    }
  }

  function saveSnapshot(entries: LedgerEntry[], payouts: Map<string, PayoutRequest>) {
    mkdirSync(path.dirname(filePath), { recursive: true });
    const snapshot: LedgerSnapshot = {
      entries: entries.map(toPersistedEntry),
      payouts: [...payouts.values()].map(toPersistedPayout),
    };
    writeFileSync(filePath, JSON.stringify(snapshot, null, 2), "utf8");
  }

  const snapshot = loadSnapshot();
  const entries: LedgerEntry[] = snapshot.entries.map(toLedgerEntry);
  const payouts = new Map<string, PayoutRequest>(
    snapshot.payouts.map((item) => [item.id, toPayoutRequest(item)]),
  );
  const seenRefs = new Set(entries.map((entry) => entry.externalRef));

  async function resolveHoldDays() {
    if (options.holdDaysResolver) {
      return Math.max(0, Math.trunc(await options.holdDaysResolver()));
    }

    const settings = await getSettlementSettings();
    return Math.max(0, Math.trunc(settings.payoutHoldDays));
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
        const existing = entries.find((entry) => entry.externalRef === input.externalRef);
        if (existing) {
          return { ...existing };
        }
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
      saveSnapshot(entries, payouts);
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
      saveSnapshot(entries, payouts);
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
      req.processedAt = new Date();
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
      saveSnapshot(entries, payouts);
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
      req.processedAt = new Date();
      saveSnapshot(entries, payouts);
      return { success: true, request: { ...req } };
    },

    async listPayouts(developerId) {
      return [...payouts.values()]
        .filter((request) => !developerId || request.developerId === developerId)
        .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
        .map((request) => ({ ...request }));
    },

    async listEntries(developerId) {
      return entries
        .filter((entry) => entry.developerId === developerId)
        .sort((left, right) => right.occurredAt.getTime() - left.occurredAt.getTime())
        .map((entry) => ({ ...entry }));
    },
  };
}
