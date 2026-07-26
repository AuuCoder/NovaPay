import { NextResponse, type NextRequest } from "next/server";
import { requireRegistryAdminRequest } from "../../../../../../lib/auth/session";
import { apiError } from "../../../../../../lib/api/response";
import {
  getRegistryRuntime,
  type RegistryPaidPricingPlanKind,
  updateCatalogPluginPricing,
} from "../../../../../../lib/runtime/state";

export const runtime = "nodejs";

const PAID_PRICING_PLAN_KINDS = new Set<RegistryPaidPricingPlanKind>([
  "PER_INSTANCE_ONE_TIME",
  "PER_MERCHANT_SUBSCRIPTION",
  "PER_USAGE",
]);

function parsePriceAmountCents(value: unknown) {
  if (typeof value === "number") {
    return Number.isFinite(value) && value > 0 ? Math.round(value * 100) : null;
  }

  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  const normalized = value.trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) {
    return null;
  }

  const numeric = Number(normalized);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return null;
  }

  return Math.round(numeric * 100);
}

function parseCurrency(value: unknown) {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  const normalized = value.trim().toUpperCase();
  return /^[A-Z]{3}$/.test(normalized) ? normalized : null;
}

function parseOptionalText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const auth = await requireRegistryAdminRequest(request);
  if (auth.response) {
    return auth.response;
  }

  const { slug } = await params;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return apiError(request, "INVALID_BODY", 400);
  }

  const pricingMode = body.pricingMode === "PAID" ? "PAID" : "FREE";
  const pricingPlanKind =
    typeof body.pricingPlanKind === "string" &&
    PAID_PRICING_PLAN_KINDS.has(body.pricingPlanKind as RegistryPaidPricingPlanKind)
      ? (body.pricingPlanKind as RegistryPaidPricingPlanKind)
      : null;
  const priceAmountCents = parsePriceAmountCents(body.priceAmount);
  const priceCurrency = parseCurrency(body.priceCurrency);

  if (pricingMode === "PAID") {
    if (!pricingPlanKind) {
      return apiError(request, "INVALID_PRICING_PLAN_KIND", 400);
    }

    if (!priceAmountCents) {
      return apiError(request, "INVALID_PRICE_AMOUNT", 400);
    }

    if (!priceCurrency) {
      return apiError(request, "INVALID_PRICE_CURRENCY", 400);
    }
  }

  const state = await getRegistryRuntime();

  try {
    const result = await updateCatalogPluginPricing({
      state,
      slug,
      pricing: {
        pricingMode,
        pricingPlanKind: pricingMode === "PAID" ? pricingPlanKind : null,
        priceAmountCents: pricingMode === "PAID" ? priceAmountCents : null,
        priceCurrency: pricingMode === "PAID" ? priceCurrency : null,
        priceLabel: parseOptionalText(body.priceLabel),
        purchaseUrl: parseOptionalText(body.purchaseUrl),
      },
    });

    return NextResponse.json({
      ok: true,
      plugin: result.plugin,
      artifactUpdated: result.artifactUpdated,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message === "PLUGIN_NOT_FOUND") {
      return apiError(request, "PLUGIN_NOT_FOUND", 404, { slug });
    }
    if (message === "PLUGIN_PRICING_INCOMPLETE") {
      return apiError(request, "PLUGIN_PRICING_INCOMPLETE", 400);
    }

    return apiError(request, "INVALID_BODY", 400, undefined, { detail: message });
  }
}
