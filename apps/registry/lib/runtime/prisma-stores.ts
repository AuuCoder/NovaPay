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
import type { LicenseRecord, LicenseStore } from "../licensing/store";
import { getSettlementSettings } from "../settlement/settings";

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
    licenseStore: createPrismaLicenseStore(prisma),
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
    findMany(args: unknown): Promise<unknown[]>;
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
  license: {
    findUnique(args: unknown): Promise<unknown>;
    findMany(args: unknown): Promise<unknown[]>;
    create(args: unknown): Promise<unknown>;
    update(args: unknown): Promise<unknown>;
  };
  registryLedgerEntry: {
    findUnique(args: unknown): Promise<unknown>;
    findMany(args: unknown): Promise<unknown[]>;
    create(args: unknown): Promise<unknown>;
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

interface PrismaOrderRow {
  id: string;
  orderNumber: string;
  pluginId: string;
  pluginSlug: string;
  developerId: string;
  version: string;
  buyerInstanceId: string | null;
  buyerMerchantId: string | null;
  pricingPlanKind: OrderRecord["pricingPlanKind"];
  priceAmountCents: number;
  priceCurrency: string;
  state: OrderRecord["state"];
  novapayOrderId: string | null;
  checkoutUrl: string | null;
  licenseId: string | null;
  paidAt: Date | null;
  failedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

interface PrismaLicenseRow {
  id: string;
  orderId: string | null;
  pluginId: string;
  pluginSlug: string;
  developerId: string | null;
  version: string;
  pricingPlanKind: LicenseRecord["pricingPlanKind"];
  issuedAt: Date;
  expiresAt: Date | null;
  state: LicenseRecord["state"];
  jwsCompact: string;
  licenseKeyHash: string;
  instanceId: string | null;
  merchantId: string | null;
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

// ─── LicenseStore ────────────────────────────────────────────────────────────

function createPrismaLicenseStore(prisma: PrismaClientLike): LicenseStore {
  function mapRow(row: PrismaLicenseRow): LicenseRecord {
    return {
      id: row.id,
      orderId: row.orderId,
      pluginId: row.pluginId,
      pluginSlug: row.pluginSlug,
      developerId: row.developerId,
      version: row.version,
      pricingPlanKind: row.pricingPlanKind,
      issuedAt: row.issuedAt,
      expiresAt: row.expiresAt,
      state: row.state,
      jwsCompact: row.jwsCompact,
      licenseKeyHash: row.licenseKeyHash,
      instanceId: row.instanceId,
      merchantId: row.merchantId,
    };
  }

  return {
    async save(record) {
      const existing = await prisma.license.findUnique({
        where: { id: record.id },
      }) as PrismaLicenseRow | null;

      if (existing) {
        return mapRow(existing);
      }

      const created = await prisma.license.create({
        data: {
          id: record.id,
          orderId: record.orderId,
          pluginId: record.pluginId,
          pluginSlug: record.pluginSlug,
          developerId: record.developerId,
          version: record.version,
          pricingPlanKind: record.pricingPlanKind,
          issuedAt: record.issuedAt,
          expiresAt: record.expiresAt,
          state: record.state,
          jwsCompact: record.jwsCompact,
          licenseKey: record.jwsCompact,
          licenseKeyHash: record.licenseKeyHash,
          instanceId: record.instanceId,
          merchantId: record.merchantId,
        } as unknown,
      }) as PrismaLicenseRow;

      return mapRow(created);
    },
    async findById(id) {
      const row = await prisma.license.findUnique({
        where: { id },
      }) as PrismaLicenseRow | null;
      return row ? mapRow(row) : null;
    },
    async findByOrderId(orderId) {
      const row = await prisma.license.findUnique({
        where: { orderId },
      }) as PrismaLicenseRow | null;
      return row ? mapRow(row) : null;
    },
    async markRevoked(id) {
      const existing = await prisma.license.findUnique({
        where: { id },
      }) as PrismaLicenseRow | null;
      if (!existing) {
        return null;
      }

      const updated = await prisma.license.update({
        where: { id },
        data: { state: "REVOKED" } as unknown,
      }) as PrismaLicenseRow;

      return mapRow(updated);
    },
    async listAll() {
      const rows = await (prisma.license as {
        findMany(args: unknown): Promise<PrismaLicenseRow[]>;
      }).findMany({
        orderBy: { issuedAt: "desc" },
      });
      return rows.map(mapRow);
    },
  };
}

// ─── OrderStore ──────────────────────────────────────────────────────────────

function createPrismaOrderStore(prisma: PrismaClientLike): OrderStore {
  function mapRow(row: PrismaOrderRow): OrderRecord {
    return {
      id: row.id,
      orderNumber: row.orderNumber,
      pluginId: row.pluginId,
      pluginSlug: row.pluginSlug,
      developerId: row.developerId,
      version: row.version,
      buyerInstanceId: row.buyerInstanceId ?? "",
      buyerMerchantId: row.buyerMerchantId,
      pricingPlanKind: row.pricingPlanKind,
      priceAmountCents: row.priceAmountCents,
      priceCurrency: row.priceCurrency,
      state: row.state,
      novapayOrderId: row.novapayOrderId,
      checkoutUrl: row.checkoutUrl,
      licenseId: row.licenseId,
      paidAt: row.paidAt,
      failedAt: row.failedAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  function toCreateData(record: OrderRecord) {
    return {
      id: record.id,
      orderNumber: record.orderNumber,
      pluginId: record.pluginId,
      pluginSlug: record.pluginSlug,
      developerId: record.developerId,
      version: record.version,
      buyerInstanceId: record.buyerInstanceId,
      buyerMerchantId: record.buyerMerchantId ?? null,
      pricingPlanKind: record.pricingPlanKind,
      priceAmountCents: record.priceAmountCents,
      priceCurrency: record.priceCurrency,
      state: record.state,
      novapayOrderId: record.novapayOrderId ?? null,
      checkoutUrl: record.checkoutUrl ?? null,
      licenseId: record.licenseId ?? null,
      paidAt: record.paidAt ?? null,
      failedAt: record.failedAt ?? null,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
  }

  function toUpdateData(patch: Partial<OrderRecord>) {
    const data: Record<string, unknown> = {};

    if ("orderNumber" in patch) data.orderNumber = patch.orderNumber;
    if ("pluginId" in patch) data.pluginId = patch.pluginId;
    if ("pluginSlug" in patch) data.pluginSlug = patch.pluginSlug;
    if ("developerId" in patch) data.developerId = patch.developerId;
    if ("version" in patch) data.version = patch.version;
    if ("buyerInstanceId" in patch) data.buyerInstanceId = patch.buyerInstanceId;
    if ("buyerMerchantId" in patch) data.buyerMerchantId = patch.buyerMerchantId ?? null;
    if ("pricingPlanKind" in patch) data.pricingPlanKind = patch.pricingPlanKind;
    if ("priceAmountCents" in patch) data.priceAmountCents = patch.priceAmountCents;
    if ("priceCurrency" in patch) data.priceCurrency = patch.priceCurrency;
    if ("state" in patch) data.state = patch.state;
    if ("novapayOrderId" in patch) data.novapayOrderId = patch.novapayOrderId ?? null;
    if ("checkoutUrl" in patch) data.checkoutUrl = patch.checkoutUrl ?? null;
    if ("licenseId" in patch) data.licenseId = patch.licenseId ?? null;
    if ("paidAt" in patch) data.paidAt = patch.paidAt ?? null;
    if ("failedAt" in patch) data.failedAt = patch.failedAt ?? null;
    if ("updatedAt" in patch) data.updatedAt = patch.updatedAt;

    return data;
  }

  return {
    async create(record: OrderRecord): Promise<OrderRecord> {
      const created = await prisma.order.create({
        data: toCreateData(record) as unknown,
      }) as PrismaOrderRow;
      return mapRow(created);
    },
    async findById(orderId: string): Promise<OrderRecord | null> {
      const row = await prisma.order.findUnique({
        where: { id: orderId },
      }) as PrismaOrderRow | null;
      return row ? mapRow(row) : null;
    },
    async findByOrderNumber(orderNumber: string): Promise<OrderRecord | null> {
      const row = await prisma.order.findUnique({
        where: { orderNumber },
      }) as PrismaOrderRow | null;
      return row ? mapRow(row) : null;
    },
    async update(orderId: string, patch: Partial<OrderRecord>): Promise<OrderRecord> {
      const updated = await prisma.order.update({
        where: { id: orderId },
        data: toUpdateData(patch) as unknown,
      }) as PrismaOrderRow;
      return mapRow(updated);
    },
    async listByDeveloper(developerId: string): Promise<OrderRecord[]> {
      const rows = await prisma.order.findMany({
        where: { developerId },
        orderBy: { createdAt: "desc" },
      } as unknown) as PrismaOrderRow[];
      return rows.map(mapRow);
    },
    async listAll(): Promise<OrderRecord[]> {
      const rows = await prisma.order.findMany({
        orderBy: { createdAt: "desc" },
      } as unknown) as PrismaOrderRow[];
      return rows.map(mapRow);
    },
  };
}

// ─── BalanceLedger ───────────────────────────────────────────────────────────

interface PrismaLedgerEntryRow {
  id: string;
  developerId: string;
  amountCents: number;
  currency: string;
  reason: string;
  externalRef: string;
  occurredAt: Date;
}

interface PrismaPayoutRequestRow {
  id: string;
  developerId: string;
  payoutAccountId: string;
  amountCents: number;
  currency: string;
  state: string;
  adminNote?: string | null;
  createdAt: Date;
  updatedAt: Date;
  processedAt?: Date | null;
}

const DEFAULT_LEDGER_CURRENCY = "CNY";

function mapLedgerEntryRow(row: PrismaLedgerEntryRow): LedgerEntry {
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

function mapPayoutRequestRow(row: PrismaPayoutRequestRow): PayoutRequest {
  return {
    id: row.id,
    developerId: row.developerId,
    payoutAccountId: row.payoutAccountId,
    amountCents: row.amountCents,
    currency: row.currency,
    state:
      row.state === "APPROVED" ||
      row.state === "REJECTED" ||
      row.state === "PROCESSING" ||
      row.state === "COMPLETED" ||
      row.state === "FAILED"
        ? row.state
        : "PENDING_REVIEW",
    adminNote: row.adminNote ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    processedAt: row.processedAt ?? null,
  };
}

function computeBalanceFromRows(
  entries: PrismaLedgerEntryRow[],
  payouts: PrismaPayoutRequestRow[],
  currency: string,
  holdDays: number,
): BalanceSnapshot {
  const total = entries.reduce((sum, entry) => sum + entry.amountCents, 0);
  const payoutFrozen = payouts
    .filter((request) => request.state === "PENDING_REVIEW" && request.currency === currency)
    .reduce((sum, request) => sum + request.amountCents, 0);
  const holdThreshold =
    holdDays > 0 ? Date.now() - holdDays * 24 * 60 * 60 * 1000 : null;
  const heldCredits =
    holdThreshold === null
      ? 0
      : entries.reduce((sum, entry) => {
          if (
            entry.currency === currency &&
            entry.amountCents > 0 &&
            entry.reason === "LICENSE_SALE" &&
            entry.occurredAt.getTime() > holdThreshold
          ) {
            return sum + entry.amountCents;
          }
          return sum;
        }, 0);
  const frozen = payoutFrozen + heldCredits;

  return {
    total,
    frozen,
    available: total - frozen,
    currency,
  };
}

function createPrismaBalanceLedger(prisma: PrismaClientLike): BalanceLedger {
  return {
    async credit(input) {
      const existing = await prisma.registryLedgerEntry.findUnique({
        where: { externalRef: input.externalRef },
      }) as PrismaLedgerEntryRow | null;

      if (existing) {
        return mapLedgerEntryRow(existing);
      }

      const created = await prisma.registryLedgerEntry.create({
        data: {
          developerId: input.developerId,
          amountCents: input.amountCents,
          currency: input.currency,
          reason: input.reason,
          externalRef: input.externalRef,
          occurredAt: new Date(),
        },
      }) as PrismaLedgerEntryRow;

      return mapLedgerEntryRow(created);
    },

    async getBalance(developerId, currency = DEFAULT_LEDGER_CURRENCY) {
      const [entries, payouts] = await Promise.all([
        prisma.registryLedgerEntry.findMany({
          where: { developerId, currency },
        }) as Promise<PrismaLedgerEntryRow[]>,
        prisma.payoutRequest.findMany({
          where: {
            developerId,
            currency,
            state: "PENDING_REVIEW",
          },
        }) as Promise<PrismaPayoutRequestRow[]>,
      ]);
      const settings = await getSettlementSettings();

      return computeBalanceFromRows(
        entries,
        payouts,
        currency,
        Math.max(0, Math.trunc(settings.payoutHoldDays)),
      );
    },

    async submitPayout({
      developerId,
      payoutAccountId,
      amountCents,
      currency = DEFAULT_LEDGER_CURRENCY,
    }) {
      if (amountCents <= 0) {
        return { success: false, errorCode: "INVALID_AMOUNT" as const };
      }

      const balance = await this.getBalance(developerId, currency);
      if (balance.available < amountCents) {
        return { success: false, errorCode: "INSUFFICIENT_BALANCE" as const };
      }

      const request = await prisma.payoutRequest.create({
        data: {
          developerId,
          payoutAccountId,
          amountCents,
          currency,
          state: "PENDING_REVIEW",
        },
      }) as PrismaPayoutRequestRow;

      return {
        success: true,
        request: mapPayoutRequestRow(request),
      };
    },

    async approvePayout({ requestId, adminNote }) {
      const existing = await prisma.payoutRequest.findUnique({
        where: { id: requestId },
      }) as PrismaPayoutRequestRow | null;

      if (!existing) {
        return { success: false, errorCode: "NOT_FOUND" as const };
      }

      if (existing.state !== "PENDING_REVIEW") {
        return { success: false, errorCode: "INVALID_STATE" as const };
      }

      const debitExisting = await prisma.registryLedgerEntry.findUnique({
        where: { externalRef: existing.id },
      }) as PrismaLedgerEntryRow | null;

      if (!debitExisting) {
        await prisma.registryLedgerEntry.create({
          data: {
            developerId: existing.developerId,
            amountCents: -existing.amountCents,
            currency: existing.currency,
            reason: "PAYOUT_APPROVED",
            externalRef: existing.id,
            occurredAt: new Date(),
          },
        });
      }

      const updated = await prisma.payoutRequest.update({
        where: { id: requestId },
        data: {
          state: "APPROVED",
          adminNote: adminNote ?? null,
          processedAt: new Date(),
        },
      }) as PrismaPayoutRequestRow;

      return {
        success: true,
        request: mapPayoutRequestRow(updated),
      };
    },

    async rejectPayout({ requestId, adminNote }) {
      const existing = await prisma.payoutRequest.findUnique({
        where: { id: requestId },
      }) as PrismaPayoutRequestRow | null;

      if (!existing) {
        return { success: false, errorCode: "NOT_FOUND" as const };
      }

      if (existing.state !== "PENDING_REVIEW") {
        return { success: false, errorCode: "INVALID_STATE" as const };
      }

      const updated = await prisma.payoutRequest.update({
        where: { id: requestId },
        data: {
          state: "REJECTED",
          adminNote,
          processedAt: new Date(),
        },
      }) as PrismaPayoutRequestRow;

      return {
        success: true,
        request: mapPayoutRequestRow(updated),
      };
    },

    async listPayouts(developerId) {
      const rows = await prisma.payoutRequest.findMany({
        where: developerId ? { developerId } : undefined,
        orderBy: { createdAt: "desc" },
      }) as PrismaPayoutRequestRow[];

      return rows.map(mapPayoutRequestRow);
    },

    async listEntries(developerId) {
      const rows = await prisma.registryLedgerEntry.findMany({
        where: { developerId },
        orderBy: { occurredAt: "desc" },
      }) as PrismaLedgerEntryRow[];

      return rows.map(mapLedgerEntryRow);
    },
  };
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
