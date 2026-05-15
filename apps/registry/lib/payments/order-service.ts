/**
 * Order lifecycle service for paid plugins (Req 13.1, 13.2).
 *
 * Coordinates Order creation, NovaPay payment order kickoff, callback
 * handling, and License issuance. Phase 3 keeps the persistence in memory;
 * production replaces the store with Prisma.
 */

import { randomUUID } from "node:crypto";
import type { LicenseClaims } from "../licensing/issuer";
import { issueLicense } from "../licensing/issuer";
import type { Ed25519Signer } from "../signing/signer";
import type { SigningKeyStore } from "../signing/key-store";
import type { BalanceLedger } from "../payouts/balance-ledger";

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
  };
}

export interface OrderServiceDeps {
  orderStore: OrderStore;
  signer: Ed25519Signer;
  keyStore: SigningKeyStore;
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
