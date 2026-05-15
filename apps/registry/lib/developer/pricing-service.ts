/**
 * Plugin pricing configuration (Req 7.1–7.6).
 *
 * Phase 2 only allows pricingMode=FREE. Attempting to set PAID returns
 * PRICE_NOT_ALLOWED_FOR_FREE. Phase 3 will unlock PAID pricing.
 */

export interface PricingInput {
  pluginSlug: string;
  developerId: string;
  pricingMode: "FREE" | "PAID";
  priceLabel?: string | null;
}

export type PricingErrorCode =
  | "PRICE_NOT_ALLOWED_FOR_FREE"
  | "PAID_NOT_SUPPORTED_YET"
  | "PLUGIN_NOT_FOUND"
  | "NOT_PLUGIN_OWNER";

export interface PricingResult {
  success: boolean;
  errorCode?: PricingErrorCode;
}

export interface PricingHistoryEntry {
  beforeJson: Record<string, unknown>;
  afterJson: Record<string, unknown>;
  changedBy: string;
  createdAt: Date;
}

export interface PricingStore {
  getPricing(pluginSlug: string): Promise<{ pricingMode: "FREE" | "PAID"; priceLabel: string | null } | null>;
  updatePricing(pluginSlug: string, pricingMode: "FREE" | "PAID", priceLabel: string | null): Promise<void>;
  recordHistory(pluginSlug: string, entry: PricingHistoryEntry): Promise<void>;
}

export async function updatePluginPricing(
  input: PricingInput,
  store: PricingStore,
): Promise<PricingResult> {
  if (input.pricingMode === "PAID") {
    return { success: false, errorCode: "PAID_NOT_SUPPORTED_YET" };
  }

  if (input.pricingMode === "FREE" && input.priceLabel) {
    return { success: false, errorCode: "PRICE_NOT_ALLOWED_FOR_FREE" };
  }

  const current = await store.getPricing(input.pluginSlug);
  if (!current) {
    return { success: false, errorCode: "PLUGIN_NOT_FOUND" };
  }

  const before = { pricingMode: current.pricingMode, priceLabel: current.priceLabel };
  const after = { pricingMode: input.pricingMode, priceLabel: input.priceLabel ?? null };

  await store.updatePricing(input.pluginSlug, input.pricingMode, input.priceLabel ?? null);
  await store.recordHistory(input.pluginSlug, {
    beforeJson: before,
    afterJson: after,
    changedBy: input.developerId,
    createdAt: new Date(),
  });

  return { success: true };
}
