/**
 * GET /api/registry/orders/:orderId
 *
 * Returns the current state of a purchase order, including the issued license
 * if the order has been paid. NovaPay instances poll this endpoint after
 * redirecting the admin to the checkout URL.
 */

import { NextResponse, type NextRequest } from "next/server";
import { getRegistryRuntime } from "../../../../../lib/runtime/state";
import { requireConsumer } from "../../../../../lib/auth/require-consumer";

export const runtime = "nodejs";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ orderId: string }> },
) {
  const auth = await requireConsumer(request);
  if (auth.response) return auth.response;

  const { orderId } = await params;
  const state = await getRegistryRuntime();
  const order = await state.orderStore.findById(orderId);

  if (!order) {
    return NextResponse.json(
      { error: "ORDER_NOT_FOUND", message: `No order with id: ${orderId}` },
      { status: 404 },
    );
  }

  // If the order is PAID, look up the license JWS from the demo bundles
  // (in production this would query the License table).
  let license: { licenseKey: string; licenseKeyHash: string; expiresAt: string | null } | null = null;

  if (order.state === "PAID" && order.licenseId) {
    // For the in-memory dev store, we re-issue a fresh license on demand.
    // Production stores the JWS in the License table and returns it directly.
    const { issueLicense } = await import("../../../../../lib/licensing/issuer");
    const issued = await issueLicense(
      {
        pluginSlug: order.pluginSlug,
        version: order.version,
        pricingPlanKind: order.pricingPlanKind,
        instanceId: order.buyerInstanceId,
        merchantId: order.buyerMerchantId ?? undefined,
      },
      state.signer,
      state.keyStore,
    );
    license = {
      licenseKey: issued.jwsCompact,
      licenseKeyHash: issued.licenseKeyHash,
      expiresAt: null,
    };
  }

  return NextResponse.json({
    orderId: order.id,
    orderNumber: order.orderNumber,
    pluginSlug: order.pluginSlug,
    version: order.version,
    buyerInstanceId: order.buyerInstanceId,
    buyerMerchantId: order.buyerMerchantId ?? null,
    state: order.state,
    priceAmountCents: order.priceAmountCents,
    priceCurrency: order.priceCurrency,
    paidAt: order.paidAt?.toISOString() ?? null,
    createdAt: order.createdAt.toISOString(),
    license,
  });
}
