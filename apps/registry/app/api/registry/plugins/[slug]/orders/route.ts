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
import { getRegistryRuntime } from "../../../../../../lib/runtime/state";
import { requireConsumer } from "../../../../../../lib/auth/require-consumer";
import {
  createPluginOrder,
  markOrderPaidAndIssueLicense,
} from "../../../../../../lib/payments/order-service";

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
    return NextResponse.json(
      { error: "PLUGIN_NOT_FOUND", message: `No plugin with slug: ${slug}` },
      { status: 404 },
    );
  }

  if (plugin.pricingMode !== "PAID") {
    return NextResponse.json(
      { error: "PLUGIN_IS_FREE", message: "This plugin is free; no order required." },
      { status: 400 },
    );
  }

  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      { error: "INVALID_BODY", message: "Request body must be JSON." },
      { status: 400 },
    );
  }

  const instanceId =
    typeof body.instanceId === "string" ? body.instanceId.trim() : auth.consumer.instanceId;
  const merchantId =
    typeof body.merchantId === "string" && body.merchantId.trim()
      ? body.merchantId.trim()
      : null;

  if (!instanceId) {
    return NextResponse.json(
      { error: "MISSING_INSTANCE_ID", message: "instanceId is required." },
      { status: 400 },
    );
  }

  // Create the order
  const order = await createPluginOrder(
    {
      pluginSlug: slug,
      pluginId: slug, // In-memory; production uses the real PluginRecord.id
      developerId: "demo-developer", // Placeholder
      version: plugin.version,
      buyerInstanceId: instanceId,
      buyerMerchantId: merchantId,
      pricingPlanKind: "PER_INSTANCE_ONE_TIME",
      priceAmountCents: 9900, // Placeholder; production reads from PluginRecord
      priceCurrency: "CNY",
    },
    {
      orderStore: state.orderStore,
      signer: state.signer,
      keyStore: state.keyStore,
      ledger: state.ledger,
    },
  );

  // Phase 3 dev mode: auto-pay and issue license immediately so the
  // NovaPay main app can complete the purchase round-trip without a real
  // payment gateway. In production this would return a checkoutUrl and
  // wait for the payment callback.
  const autoPayEnabled = process.env.REGISTRY_AUTO_PAY !== "0";

  if (autoPayEnabled) {
    const paid = await markOrderPaidAndIssueLicense(
      {
        orderId: order.id,
        novapayOrderId: `auto-${order.orderNumber}`,
      },
      {
        orderStore: state.orderStore,
        signer: state.signer,
        keyStore: state.keyStore,
        ledger: state.ledger,
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
        expiresAt: null, // perpetual for PER_INSTANCE_ONE_TIME
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
