/**
 * Prisma-backed store implementations for the Registry runtime.
 *
 * These replace the in-memory stores when `REGISTRY_STORE_DRIVER=prisma`.
 * Each store wraps the generated Prisma client and implements the same
 * interface used by the in-memory counterparts, so route handlers don't
 * need to branch.
 *
 * Prerequisites:
 *   - `DATABASE_URL` env var pointing to the Registry Postgres instance
 *   - `npx prisma migrate deploy` has been run against the schema
 *   - `npx prisma generate` has produced the client at `../generated/prisma`
 */

import { createHash } from "node:crypto";
import type { SigningKeyStore, SigningKeyRecord, NewSigningKeyInput, RotationResult } from "../signing/key-store";
import { DEFAULT_RETIRED_KEY_GRACE_MS } from "../signing/key-store";
import type { RevocationStore } from "../licensing/revocation";
import type { RevocationRecord } from "../licensing/revocation";
import type { OrderStore } from "../payments/order-service";
import type { OrderRecord } from "../payments/order-service";
import type { BalanceLedger, BalanceSnapshot, LedgerEntry, PayoutRequest } from "../payouts/balance-ledger";
import type { AuditLogger, AuditLogEntry } from "../audit/log";
import type { ConsumerLookup, ConsumerRecord } from "../auth/consumer-app-key";

/**
 * Factory that creates all Prisma-backed stores from a single Prisma client
 * instance. The caller (runtime/state.ts) passes the client after importing
 * from the generated output.
 *
 * Type is kept loose (`any`) for the Prisma client because the generated
 * types live in `../generated/prisma` which may not exist at lint time in
 * fresh checkouts. Runtime callers pass the real typed client.
 */
export function createPrismaStores(prisma: PrismaClientLike) {
  return {
    signingKeyStore: createPrismaSigningKeyStore(prisma),
    revocationStore: createPrismaRevocationStore(prisma),
    orderStore: createPrismaOrderStore(prisma),
    ledger: createPrismaBalanceLedger(prisma),
    auditLogger: createPrismaAuditLogger(prisma),
    consumerLookup: createPrismaConsumerLookup(prisma),
  };
}

// ─── Minimal Prisma client type (avoids importing generated types) ───────────

interface PrismaClientLike {
  signingKey: {
    findFirst(args: unknown): Promise<unknown>;
    findUnique(args: unknown): Promise<unknown>;
    findMany(args: unknown): Promise<unknown[]>;
    create(args: unknown): Promise<unknown>;
    update(args: unknown): Promise<unknown>;
  };
  licenseRevocation: {
    findFirst(args: unknown): Promise<unknown>;
    create(args: unknown): Promise<unknown>;
    findMany(args: unknown): Promise<unknown[]>;
  };
  order: {
    findUnique(args: unknown): Promise<unknown>;
    create(args: unknown): Promise<unknown>;
    update(args: unknown): Promise<unknown>;
  };
  developer: {
    findUnique(args: unknown): Promise<unknown>;
    update(args: unknown): Promise<unknown>;
  };
  payoutRequest: {
    findUnique(args: unknown): Promise<unknown>;
    findMany(args: unknown): Promise<unknown[]>;
    create(args: unknown): Promise<unknown>;
    update(args: unknown): Promise<unknown>;
  };
  auditLog: {
    create(args: unknown): Promise<unknown>;
    findMany(args: unknown): Promise<unknown[]>;
  };
  registryConsumer: {
    findFirst(args: unknown): Promise<unknown>;
  };
  $transaction?(ops: unknown[]): Promise<unknown[]>;
}

// ─── SigningKeyStore ──────────────────────────────────────────────────────────

function createPrismaSigningKeyStore(prisma: PrismaClientLike): SigningKeyStore {
  return {
    async getActive(): Promise<SigningKeyRecord> {
      const row = await prisma.signingKey.findFirst({
        where: { status: "ACTIVE" },
        orderBy: { createdAt: "desc" },
      }) as SigningKeyRecord | null;
      if (!row) throw new Error("No active signing key configured.");
      return row;
    },

    async getByKeyId(keyId: string): Promise<SigningKeyRecord | null> {
      return prisma.signingKey.findUnique({
        where: { keyId },
      }) as Promise<SigningKeyRecord | null>;
    },

    async listTrustAnchors(now: Date = new Date()): Promise<SigningKeyRecord[]> {
      return prisma.signingKey.findMany({
        where: { notAfter: { gt: now } },
        orderBy: { createdAt: "asc" },
      }) as Promise<SigningKeyRecord[]>;
    },

    async rotate(input: { newKey: NewSigningKeyInput; minRetiredGraceMs?: number }): Promise<RotationResult> {
      const { newKey } = input;
      const grace = input.minRetiredGraceMs ?? DEFAULT_RETIRED_KEY_GRACE_MS;
      const now = new Date();
      const minNotAfter = new Date(now.getTime() + grace);

      const existing = await prisma.signingKey.findUnique({ where: { keyId: newKey.keyId } });
      if (existing) throw new Error(`Signing key already exists: ${newKey.keyId}`);

      const currentActive = await prisma.signingKey.findFirst({
        where: { status: "ACTIVE" },
      }) as SigningKeyRecord | null;

      let retired: SigningKeyRecord | null = null;
      if (currentActive) {
        const updatedNotAfter = new Date(Math.max(currentActive.notAfter.getTime(), minNotAfter.getTime()));
        retired = await prisma.signingKey.update({
          where: { keyId: currentActive.keyId },
          data: { status: "RETIRED", notAfter: updatedNotAfter },
        }) as SigningKeyRecord;
      }

      const newActive = await prisma.signingKey.create({
        data: {
          keyId: newKey.keyId,
          alg: newKey.alg,
          publicKey: newKey.publicKey,
          kmsKeyArn: newKey.kmsKeyArn,
          status: "ACTIVE",
          notBefore: newKey.notBefore,
          notAfter: newKey.notAfter,
          createdAt: now,
        },
      }) as SigningKeyRecord;

      return { newActive, retired };
    },
  };
}

// ─── RevocationStore ─────────────────────────────────────────────────────────

function createPrismaRevocationStore(prisma: PrismaClientLike): RevocationStore {
  return {
    async isRevoked(licenseKeyHash: string): Promise<boolean> {
      const row = await prisma.licenseRevocation.findFirst({
        where: { license: { licenseKeyHash } },
      } as unknown);
      return Boolean(row);
    },
    async add(record: RevocationRecord): Promise<void> {
      await prisma.licenseRevocation.create({
        data: {
          licenseId: record.licenseId,
          reason: record.reason,
          revokedById: record.revokedById,
          revokedAt: record.revokedAt,
          note: record.note ?? null,
        },
      } as unknown);
    },
    async list(): Promise<RevocationRecord[]> {
      return prisma.licenseRevocation.findMany({
        orderBy: { revokedAt: "desc" },
        take: 100,
      }) as unknown as Promise<RevocationRecord[]>;
    },
    invalidateCache() {
      // Prisma queries are always fresh; no cache to invalidate.
    },
  };
}

// ─── OrderStore ──────────────────────────────────────────────────────────────

function createPrismaOrderStore(prisma: PrismaClientLike): OrderStore {
  return {
    async create(record: OrderRecord): Promise<OrderRecord> {
      return prisma.order.create({ data: record as unknown }) as unknown as Promise<OrderRecord>;
    },
    async findById(orderId: string): Promise<OrderRecord | null> {
      return prisma.order.findUnique({ where: { id: orderId } }) as unknown as Promise<OrderRecord | null>;
    },
    async findByOrderNumber(orderNumber: string): Promise<OrderRecord | null> {
      return prisma.order.findUnique({ where: { orderNumber } }) as unknown as Promise<OrderRecord | null>;
    },
    async update(orderId: string, patch: Partial<OrderRecord>): Promise<OrderRecord> {
      return prisma.order.update({
        where: { id: orderId },
        data: patch as unknown,
      }) as unknown as Promise<OrderRecord>;
    },
  };
}

// ─── BalanceLedger (simplified Prisma version) ───────────────────────────────

function createPrismaBalanceLedger(_prisma: PrismaClientLike): BalanceLedger {
  // Full Prisma ledger implementation requires a dedicated LedgerEntry table
  // which isn't in the Phase 3 schema yet. For now, delegate to the
  // Developer.balanceCents field + PayoutRequest table.
  // This is a placeholder that will be fleshed out when the LedgerEntry
  // model is added to the schema.
  throw new Error(
    "Prisma-backed BalanceLedger requires a LedgerEntry model. " +
    "Use REGISTRY_STORE_DRIVER=memory until the schema is extended.",
  );
}

// ─── AuditLogger ─────────────────────────────────────────────────────────────

function createPrismaAuditLogger(prisma: PrismaClientLike): AuditLogger {
  return {
    async write(entry: Omit<AuditLogEntry, "createdAt">): Promise<void> {
      await prisma.auditLog.create({
        data: { ...entry, createdAt: new Date() } as unknown,
      });
    },
    async list(options?: { limit?: number; action?: string }): Promise<AuditLogEntry[]> {
      return prisma.auditLog.findMany({
        where: options?.action ? { action: options.action } : undefined,
        orderBy: { createdAt: "desc" },
        take: options?.limit ?? 100,
      }) as unknown as Promise<AuditLogEntry[]>;
    },
  };
}

// ─── ConsumerLookup ──────────────────────────────────────────────────────────

function createPrismaConsumerLookup(prisma: PrismaClientLike): ConsumerLookup {
  return {
    async findByAppId(appId: string): Promise<ConsumerRecord | null> {
      const row = await prisma.registryConsumer.findFirst({
        where: { appId, enabled: true },
      } as unknown);
      if (!row) return null;
      const r = row as Record<string, unknown>;
      return {
        instanceId: r.instanceId as string,
        appId: r.appId as string,
        appKeyHash: r.appKeyHash as string,
        enabled: r.enabled as boolean,
        rateLimitPerMin: (r.rateLimitPerMin as number) ?? 600,
      };
    },
  };
}

export type { PrismaClientLike };
