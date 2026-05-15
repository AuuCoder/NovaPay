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

import { randomUUID } from "node:crypto";

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

const DEFAULT_CURRENCY = "CNY";

export function createInMemoryBalanceLedger(): BalanceLedger {
  const entries: LedgerEntry[] = [];
  const payouts = new Map<string, PayoutRequest>();
  const seenRefs = new Set<string>();

  function computeBalance(developerId: string, currency: string): BalanceSnapshot {
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
    return {
      total,
      frozen,
      available: total - frozen,
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
      const balance = computeBalance(developerId, currency);
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
