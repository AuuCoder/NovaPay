import { NextResponse } from "next/server";
import { getNovaPayMainAppUrl } from "../../../../../lib/auth/novapay-admin-sso";
import { updateSettlementSettings } from "../../../../../lib/settlement/settings";

export const runtime = "nodejs";

export async function POST() {
  try {
    const response = await fetch(
      `${getNovaPayMainAppUrl()}/api/internal/bootstrap/registry-bridge`,
      {
        method: "POST",
        cache: "no-store",
      },
    );

    const payload = (await response.json().catch(() => null)) as
      | {
          success?: boolean;
          error?: string;
          bridge?: {
            merchantCode: string;
            apiKeyId: string;
            apiKeySecret: string;
            notifySecret: string;
            channelCode: string;
          };
        }
      | null;

    if (!response.ok || !payload?.success || !payload.bridge) {
      throw new Error(payload?.error || "Main-site bridge provisioning failed.");
    }

    const bridge = payload.bridge;

    await updateSettlementSettings({
      developerRevenueSharePercent: 70,
      payoutHoldDays: 7,
      registryNovaPayMerchantCode: bridge.merchantCode,
      registryNovaPayApiKeyId: bridge.apiKeyId,
      registryNovaPayApiKeySecret: bridge.apiKeySecret,
      registryNovaPayNotifySecret: bridge.notifySecret,
      registryNovaPayChannelCode: bridge.channelCode,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Auto-connect failed.",
      },
      { status: 400 },
    );
  }
}
