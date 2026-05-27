/**
 * Order lifecycle service for paid plugins (Req 13.1, 13.2).
 *
 * Coordinates Order creation, NovaPay payment order kickoff, callback
 * handling, and License issuance. Production uses the Prisma-backed store;
 * the in-memory variant is kept for unit tests.
 */

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

interface PrismaOrderLike {
  order: {
    create(args: unknown): Promise<unknown>;
    findUnique(args: unknown): Promise<unknown>;
    findFirst(args: unknown): Promise<unknown>;
    findMany(args: unknown): Promise<unknown[]>;
    update(args: unknown): Promise<unknown>;
  };
}

interface OrderRow {
  id: string;
  orderNumber: string;
  pluginSlug: string;
  pluginId: string;
  developerId: string;
  version: string;
  buyerInstanceId: string | null;
  buyerMerchantId: string | null;
  pricingPlanKind: OrderRecord["pricingPlanKind"];
  priceAmountCents: number;
  priceCurrency: string;
  state: OrderState;
  novapayOrderId: string | null;
  checkoutUrl: string | null;
  paidAt: Date | null;
  failedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  licenseId: string | null;
}

function fromOrderRow(row: OrderRow): OrderRecord {
  return {
    id: row.id,
    orderNumber: row.orderNumber,
    pluginSlug: row.pluginSlug,
    pluginId: row.pluginId,
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
    paidAt: row.paidAt,
    failedAt: row.failedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    licenseId: row.licenseId,
  };
}

export function createPrismaOrderStore(prisma: PrismaOrderLike): OrderStore {
  return {
    async create(record) {
      const row = (await prisma.order.create({
        data: {
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
          paidAt: record.paidAt ?? null,
          failedAt: record.failedAt ?? null,
          licenseId: record.licenseId ?? null,
          createdAt: record.createdAt,
        },
      })) as OrderRow;
      return fromOrderRow(row);
    },
    async findById(orderId) {
      const row = (await prisma.order.findUnique({ where: { id: orderId } })) as OrderRow | null;
      return row ? fromOrderRow(row) : null;
    },
    async findByOrderNumber(orderNumber) {
      const row = (await prisma.order.findUnique({
        where: { orderNumber },
      })) as OrderRow | null;
      return row ? fromOrderRow(row) : null;
    },
    async update(orderId, patch) {
      const data: Record<string, unknown> = {};
      if (patch.state !== undefined) data.state = patch.state;
      if (patch.novapayOrderId !== undefined) data.novapayOrderId = patch.novapayOrderId;
      if (patch.checkoutUrl !== undefined) data.checkoutUrl = patch.checkoutUrl;
      if (patch.paidAt !== undefined) data.paidAt = patch.paidAt;
      if (patch.failedAt !== undefined) data.failedAt = patch.failedAt;
      if (patch.licenseId !== undefined) data.licenseId = patch.licenseId;
      if (patch.buyerMerchantId !== undefined) data.buyerMerchantId = patch.buyerMerchantId;

      const row = (await prisma.order.update({
        where: { id: orderId },
        data,
      })) as OrderRow;
      return fromOrderRow(row);
    },
    async listByDeveloper(developerId) {
      const rows = (await prisma.order.findMany({
        where: { developerId },
        orderBy: { createdAt: "desc" },
      })) as OrderRow[];
      return rows.map(fromOrderRow);
    },
    async listAll() {
      const rows = (await prisma.order.findMany({
        orderBy: { createdAt: "desc" },
      })) as OrderRow[];
      return rows.map(fromOrderRow);
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
