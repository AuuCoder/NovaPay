/**
 * Order lifecycle service for paid plugins (Req 13.1, 13.2).
 *
 * Coordinates Order creation, NovaPay payment order kickoff, callback
 * handling, and License issuance. Phase 3 keeps the persistence in memory;
 * production replaces the store with Prisma.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { LicenseClaims } from "../licensing/issuer";
import { issueLicense } from "../licensing/issuer";
import type { Ed25519Signer } from "../signing/signer";
import type { SigningKeyStore } from "../signing/key-store";
import type { BalanceLedger } from "../payouts/balance-ledger";
import type { LicenseStore } from "../licensing/store";

export type OrderState =
  | "PENDING"
  | "PAID"
  | "FAILED"
  | "REFUNDED"
  | "CANCELLED";

export interface OrderRecord {
  id: string;
  orderNumber: string;
  pluginSlug: string;
  pluginId: string;
  developerId: string;
  version: string;
  buyerInstanceId: string;
  buyerMerchantId?: string | null;
  pricingPlanKind: LicenseClaims["pricingPlanKind"];
  priceAmountCents: number;
  priceCurrency: string;
  state: OrderState;
  novapayOrderId?: string | null;
  checkoutUrl?: string | null;
  paidAt?: Date | null;
  failedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
  licenseId?: string | null;
}

export interface CreateOrderInput {
  pluginSlug: string;
  pluginId: string;
  developerId: string;
  version: string;
  buyerInstanceId: string;
  buyerMerchantId?: string | null;
  pricingPlanKind: LicenseClaims["pricingPlanKind"];
  priceAmountCents: number;
  priceCurrency: string;
}

export interface OrderStore {
  create(record: OrderRecord): Promise<OrderRecord>;
  findById(orderId: string): Promise<OrderRecord | null>;
  findByOrderNumber(orderNumber: string): Promise<OrderRecord | null>;
  update(orderId: string, patch: Partial<OrderRecord>): Promise<OrderRecord>;
  listByDeveloper(developerId: string): Promise<OrderRecord[]>;
  listAll(): Promise<OrderRecord[]>;
}

interface PersistedOrderRecord extends Omit<OrderRecord, "createdAt" | "updatedAt" | "paidAt" | "failedAt"> {
  createdAt: string;
  updatedAt: string;
  paidAt?: string | null;
  failedAt?: string | null;
}

function toPersisted(record: OrderRecord): PersistedOrderRecord {
  return {
    ...record,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    paidAt: record.paidAt?.toISOString() ?? null,
    failedAt: record.failedAt?.toISOString() ?? null,
  };
}

function fromPersisted(record: PersistedOrderRecord): OrderRecord {
  return {
    ...record,
    createdAt: new Date(record.createdAt),
    updatedAt: new Date(record.updatedAt),
    paidAt: record.paidAt ? new Date(record.paidAt) : null,
    failedAt: record.failedAt ? new Date(record.failedAt) : null,
  };
}

export function createInMemoryOrderStore(): OrderStore {
  const orders = new Map<string, OrderRecord>();
  const byNumber = new Map<string, string>();
  return {
    async create(record) {
      orders.set(record.id, { ...record });
      byNumber.set(record.orderNumber, record.id);
      return { ...record };
    },
    async findById(orderId) {
      const r = orders.get(orderId);
      return r ? { ...r } : null;
    },
    async findByOrderNumber(orderNumber) {
      const id = byNumber.get(orderNumber);
      if (!id) return null;
      const r = orders.get(id);
      return r ? { ...r } : null;
    },
    async update(orderId, patch) {
      const existing = orders.get(orderId);
      if (!existing) {
        throw new Error(`Order not found: ${orderId}`);
      }
      const merged = { ...existing, ...patch, updatedAt: new Date() };
      orders.set(orderId, merged);
      return { ...merged };
    },
    async listByDeveloper(developerId) {
      return [...orders.values()]
        .filter((order) => order.developerId === developerId)
        .map((order) => ({ ...order }));
    },
    async listAll() {
      return [...orders.values()].map((order) => ({ ...order }));
    },
  };
}

export function createPersistentOrderStore(filePath: string): OrderStore {
  function load() {
    if (!existsSync(filePath)) {
      return [] as PersistedOrderRecord[];
    }

    try {
      return JSON.parse(readFileSync(filePath, "utf8")) as PersistedOrderRecord[];
    } catch {
      return [] as PersistedOrderRecord[];
    }
  }

  function save(records: OrderRecord[]) {
    mkdirSync(path.dirname(filePath), { recursive: true });
    writeFileSync(filePath, JSON.stringify(records.map(toPersisted), null, 2), "utf8");
  }

  const records = load().map(fromPersisted);
  const byId = new Map(records.map((record) => [record.id, record]));
  const byNumber = new Map(records.map((record) => [record.orderNumber, record.id]));

  function ordered() {
    return [...byId.values()].sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime());
  }

  return {
    async create(record) {
      byId.set(record.id, { ...record });
      byNumber.set(record.orderNumber, record.id);
      save(ordered());
      return { ...record };
    },
    async findById(orderId) {
      const record = byId.get(orderId);
      return record ? { ...record } : null;
    },
    async findByOrderNumber(orderNumber) {
      const id = byNumber.get(orderNumber);
      if (!id) return null;
      const record = byId.get(id);
      return record ? { ...record } : null;
    },
    async update(orderId, patch) {
      const existing = byId.get(orderId);
      if (!existing) {
        throw new Error(`Order not found: ${orderId}`);
      }

      const merged = { ...existing, ...patch, updatedAt: new Date() };
      byId.set(orderId, merged);
      save(ordered());
      return { ...merged };
    },
    async listByDeveloper(developerId) {
      return ordered()
        .filter((order) => order.developerId === developerId)
        .map((order) => ({ ...order }));
    },
    async listAll() {
      return ordered().map((order) => ({ ...order }));
    },
  };
}

export interface OrderServiceDeps {
  orderStore: OrderStore;
  signer: Ed25519Signer;
  keyStore: SigningKeyStore;
  licenseStore?: LicenseStore;
  ledger?: BalanceLedger;
  /** Revenue share percentage (0-100) credited to the developer. Defaults to 70%. */
  developerRevenueSharePercent?: number;
}

const DEFAULT_REVENUE_SHARE = 70;

export async function createPluginOrder(
  input: CreateOrderInput,
  deps: OrderServiceDeps,
): Promise<OrderRecord> {
  const now = new Date();
  const record: OrderRecord = {
    id: `ord_${randomUUID()}`,
    orderNumber: `${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`,
    pluginSlug: input.pluginSlug,
    pluginId: input.pluginId,
    developerId: input.developerId,
    version: input.version,
    buyerInstanceId: input.buyerInstanceId,
    buyerMerchantId: input.buyerMerchantId ?? null,
    pricingPlanKind: input.pricingPlanKind,
    priceAmountCents: input.priceAmountCents,
    priceCurrency: input.priceCurrency,
    state: "PENDING",
    createdAt: now,
    updatedAt: now,
  };
  return deps.orderStore.create(record);
}

export interface MarkPaidInput {
  orderId: string;
  novapayOrderId: string;
  paidAt?: Date;
}

export interface MarkPaidResult {
  order: OrderRecord;
  licenseJti: string;
  licenseJwsCompact: string;
  licenseKeyHash: string;
}

export interface MarkRefundedInput {
  orderId: string;
  refundedAt?: Date;
}

export async function markOrderPaidAndIssueLicense(
  input: MarkPaidInput,
  deps: OrderServiceDeps,
): Promise<MarkPaidResult> {
  const order = await deps.orderStore.findById(input.orderId);
  if (!order) {
    throw new Error(`Order not found: ${input.orderId}`);
  }
  if (order.state === "PAID") {
    // Idempotent — already paid, look up existing license.
    if (!order.licenseId) {
      throw new Error("Order is PAID but missing license reference.");
    }
    throw new Error(
      `Order ${order.id} already marked PAID; license reissue not allowed.`,
    );
  }

  const license = await issueLicense(
    {
      pluginSlug: order.pluginSlug,
      version: order.version,
      pricingPlanKind: order.pricingPlanKind,
      instanceId: order.buyerInstanceId,
      merchantId: order.buyerMerchantId ?? undefined,
    },
    deps.signer,
    deps.keyStore,
  );

  await deps.orderStore.update(input.orderId, {
    state: "PAID",
    novapayOrderId: input.novapayOrderId,
    paidAt: input.paidAt ?? new Date(),
    licenseId: license.jti,
  });

  if (deps.licenseStore) {
    await deps.licenseStore.save({
      id: license.jti,
      orderId: order.id,
      pluginId: order.pluginId,
      pluginSlug: order.pluginSlug,
      developerId: order.developerId,
      version: order.version,
      pricingPlanKind: order.pricingPlanKind,
      issuedAt: new Date(license.claims.iat * 1000),
      expiresAt: license.claims.exp ? new Date(license.claims.exp * 1000) : null,
      state: "ISSUED",
      jwsCompact: license.jwsCompact,
      licenseKeyHash: license.licenseKeyHash,
      instanceId: order.buyerInstanceId,
      merchantId: order.buyerMerchantId ?? null,
    });
  }

  // Credit developer balance (Req 4.2).
  if (deps.ledger) {
    const sharePercent = deps.developerRevenueSharePercent ?? DEFAULT_REVENUE_SHARE;
    const developerCut = Math.floor((order.priceAmountCents * sharePercent) / 100);
    if (developerCut > 0) {
      await deps.ledger.credit({
        developerId: order.developerId,
        amountCents: developerCut,
        currency: order.priceCurrency,
        reason: "LICENSE_SALE",
        externalRef: order.id,
      });
    }
  }

  const updated = await deps.orderStore.findById(input.orderId);
  if (!updated) {
    throw new Error("Order vanished after update.");
  }

  return {
    order: updated,
    licenseJti: license.jti,
    licenseJwsCompact: license.jwsCompact,
    licenseKeyHash: license.licenseKeyHash,
  };
}

export async function markOrderRefunded(
  input: MarkRefundedInput,
  deps: OrderServiceDeps,
): Promise<OrderRecord> {
  const order = await deps.orderStore.findById(input.orderId);
  if (!order) {
    throw new Error(`Order not found: ${input.orderId}`);
  }

  if (order.state !== "PAID") {
    throw new Error(`Order ${order.id} must be PAID before it can be refunded.`);
  }

  const updated = await deps.orderStore.update(input.orderId, {
    state: "REFUNDED",
    updatedAt: new Date(),
  });

  if (deps.ledger) {
    const sharePercent = deps.developerRevenueSharePercent ?? DEFAULT_REVENUE_SHARE;
    const developerCut = Math.floor((order.priceAmountCents * sharePercent) / 100);
    if (developerCut > 0) {
      await deps.ledger.credit({
        developerId: order.developerId,
        amountCents: -developerCut,
        currency: order.priceCurrency,
        reason: "LICENSE_REFUND",
        externalRef: `refund:${order.id}`,
      });
    }
  }

  return {
    ...updated,
    updatedAt: input.refundedAt ?? new Date(),
  };
}
