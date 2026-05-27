/**
 * POST /api/registry/plugins/:slug/orders
 *
 * Creates a purchase order for a PAID plugin. The caller (NovaPay instance)
 * provides its instanceId and optional merchantId. The Registry creates an
 * Order record and (in production) kicks off a NovaPay payment order via the
 * dogfood client. For phase 3 dev mode, we immediately mark the order PAID
 * and issue a license so the round-trip can be tested without real payment.
 *
 * Request body:
 *   { instanceId: string, merchantId?: string, scope?: "INSTANCE"|"MERCHANT" }
 *
 * Response:
 *   { orderId, orderNumber, checkoutUrl?, license?: { licenseKey, expiresAt } }
 */

import { NextResponse, type NextRequest } from "next/server";
import {
  getRegistryRuntime,
  resolveCatalogPaidPricing,
} from "../../../../../../lib/runtime/state";
import { requireConsumer } from "../../../../../../lib/auth/require-consumer";
import { getPluginOwner } from "../../../../../../lib/developer/plugin-ownership";
import {
  createPluginOrder,
  markOrderPaidAndIssueLicense,
} from "../../../../../../lib/payments/order-service";
import { getSettlementSettings } from "../../../../../../lib/settlement/settings";
import { apiError } from "../../../../../../lib/api/response";
import { NovaPayClient } from "../../../../../../lib/payments/novapay-client";
import {
  getRegistryNovaPayBridgeConfig,
  isRegistryNovaPayBridgeConfigured,
} from "../../../../../../lib/payments/novapay-config";

export const runtime = "nodejs";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const auth = await requireConsumer(request);
  if (auth.response) return auth.response;

  const { slug } = await params;
  const state = await getRegistryRuntime();

  // Find the plugin in the catalog
  const plugin = state.catalog.find((p) => p.slug === slug);
  if (!plugin) {
    return apiError(request, "PLUGIN_NOT_FOUND", 404, { slug });
  }

  if (plugin.pricingMode !== "PAID") {
    return apiError(request, "PLUGIN_IS_FREE", 400);
  }

  const paidPricing = resolveCatalogPaidPricing(plugin);
  if (!paidPricing) {
    return apiError(request, "PLUGIN_PRICING_INCOMPLETE", 409);
  }

  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return apiError(request, "INVALID_BODY", 400);
  }

  const instanceId =
    typeof body.instanceId === "string" ? body.instanceId.trim() : auth.consumer.instanceId;
  const merchantId =
    typeof body.merchantId === "string" && body.merchantId.trim()
      ? body.merchantId.trim()
      : null;

  if (!instanceId) {
    return apiError(request, "MISSING_INSTANCE_ID", 400);
  }

  // Create the order
  const order = await createPluginOrder(
    {
      pluginSlug: slug,
      pluginId: slug, // In-memory; production uses the real PluginRecord.id
      developerId: (await getPluginOwner(slug)) ?? "novapay-official",
      version: plugin.version,
      buyerInstanceId: instanceId,
      buyerMerchantId: merchantId,
      pricingPlanKind: paidPricing.pricingPlanKind,
      priceAmountCents: paidPricing.priceAmountCents,
      priceCurrency: paidPricing.priceCurrency,
    },
    {
      orderStore: state.orderStore,
      signer: state.signer,
      keyStore: state.keyStore,
      ledger: state.ledger,
    },
  );

  if (await isRegistryNovaPayBridgeConfigured()) {
    const bridgeConfig = await getRegistryNovaPayBridgeConfig();
    const publicBaseUrl = bridgeConfig.publicBaseUrl.replace(/\/$/, "");
    const client = new NovaPayClient({
      baseUrl: bridgeConfig.baseUrl,
      merchantId: bridgeConfig.merchantCode,
      apiKeyId: bridgeConfig.apiKeyId,
      apiKeySecret: bridgeConfig.apiKeySecret,
    });

    const payment = await client.createPaymentOrder({
      externalOrderId: order.id,
      amountCents: order.priceAmountCents,
      currency: order.priceCurrency,
      subject: `${plugin.displayName} ${plugin.version}`,
      channelCode: bridgeConfig.channelCode,
      callbackUrl: bridgeConfig.callbackUrl,
      returnUrl: `${publicBaseUrl}/admin/plugins/${slug}?registryPluginSlug=${encodeURIComponent(slug)}&registryOrderId=${encodeURIComponent(order.id)}`,
      metadata: {
        registryOrderId: order.id,
        registryPluginSlug: slug,
      },
    });

    await state.orderStore.update(order.id, {
      novapayOrderId: payment.novapayOrderId,
      checkoutUrl: payment.checkoutUrl,
      state: payment.status === "PROCESSING" ? "PENDING" : "PENDING",
    });

    return NextResponse.json({
      orderId: order.id,
      orderNumber: order.orderNumber,
      state: "PENDING",
      checkoutUrl: payment.checkoutUrl,
      license: null,
    });
  }

  // Dev fallback: auto-pay immediately when the real NovaPay bridge is not
  // configured so local integration can still complete end-to-end.
  const autoPayEnabled = process.env.REGISTRY_AUTO_PAY !== "0";

  if (autoPayEnabled) {
    const settlementSettings = await getSettlementSettings();
    const paid = await markOrderPaidAndIssueLicense(
      {
        orderId: order.id,
        novapayOrderId: `auto-${order.orderNumber}`,
      },
      {
        orderStore: state.orderStore,
        signer: state.signer,
        keyStore: state.keyStore,
        licenseStore: state.licenseStore,
        ledger: state.ledger,
        developerRevenueSharePercent: settlementSettings.developerRevenueSharePercent,
      },
    );

    return NextResponse.json({
      orderId: paid.order.id,
      orderNumber: paid.order.orderNumber,
      state: "PAID",
      checkoutUrl: null,
      license: {
        licenseKey: paid.licenseJwsCompact,
        licenseKeyHash: paid.licenseKeyHash,
        expiresAt: null,
      },
    });
  }

  // Production path: return the order in PENDING state with a checkoutUrl
  return NextResponse.json({
    orderId: order.id,
    orderNumber: order.orderNumber,
    state: "PENDING",
    checkoutUrl: `https://pay.novapay.example/checkout/${order.orderNumber}`,
    license: null,
  });
}
