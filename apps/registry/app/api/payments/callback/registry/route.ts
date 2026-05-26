import { NextResponse, type NextRequest } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { getRegistryRuntime } from "../../../../../lib/runtime/state";
import { markOrderPaidAndIssueLicense } from "../../../../../lib/payments/order-service";
import { getSettlementSettings } from "../../../../../lib/settlement/settings";
import { getRegistryNovaPayBridgeConfig } from "../../../../../lib/payments/novapay-config";

export const runtime = "nodejs";

function verifyCallbackSignature(secret: string, timestamp: string, rawBody: string, signature: string) {
  const expected = createHmac("sha256", secret)
    .update(`${timestamp}.${rawBody}`)
    .digest("hex");

  try {
    const left = Buffer.from(expected, "hex");
    const right = Buffer.from(signature, "hex");
    if (left.length !== right.length) {
      return false;
    }
    return timingSafeEqual(left, right);
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const timestamp = request.headers.get("x-novapay-timestamp")?.trim() || "";
  const signature = request.headers.get("x-novapay-signature")?.trim() || "";

  const bridge = await getRegistryNovaPayBridgeConfig();
  if (!timestamp || !signature || !verifyCallbackSignature(bridge.notifySecret, timestamp, rawBody, signature)) {
    return NextResponse.json(
      { success: false, error: "INVALID_SIGNATURE" },
      { status: 401 },
    );
  }

  const payload = JSON.parse(rawBody) as {
    event?: string;
    order?: {
      id?: string;
      externalOrderId?: string;
      status?: string;
      providerStatus?: string | null;
      paidAt?: string | null;
      metadata?: Record<string, unknown> | null;
    };
  };

  const registryOrderId =
    payload.order?.externalOrderId?.trim() ||
    (payload.order?.metadata &&
    typeof payload.order.metadata === "object" &&
    payload.order.metadata !== null &&
    typeof payload.order.metadata.registryOrderId === "string"
      ? payload.order.metadata.registryOrderId.trim()
      : "") ||
    "";

  if (!registryOrderId) {
    return NextResponse.json(
      { success: false, error: "REGISTRY_ORDER_ID_REQUIRED" },
      { status: 400 },
    );
  }

  const state = await getRegistryRuntime();
  const order = await state.orderStore.findById(registryOrderId);
  if (!order) {
    return NextResponse.json(
      { success: false, error: "ORDER_NOT_FOUND" },
      { status: 404 },
    );
  }

  if (payload.order?.status === "SUCCEEDED") {
    if (order.state === "PAID") {
      return NextResponse.json({ success: true, idempotent: true });
    }

    const settlementSettings = await getSettlementSettings();
    await markOrderPaidAndIssueLicense(
      {
        orderId: order.id,
        novapayOrderId: order.novapayOrderId ?? order.id,
        paidAt: payload.order.paidAt ? new Date(payload.order.paidAt) : new Date(),
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
  } else if (
    payload.order?.status === "FAILED" ||
    payload.order?.status === "CANCELLED"
  ) {
    if (order.state !== "PAID") {
      await state.orderStore.update(order.id, {
        state: payload.order.status === "FAILED" ? "FAILED" : "CANCELLED",
        updatedAt: new Date(),
      });
    }
  }

  return NextResponse.json({ success: true });
}
