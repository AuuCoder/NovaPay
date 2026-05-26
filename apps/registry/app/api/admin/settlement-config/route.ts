import { NextResponse, type NextRequest } from "next/server";
import { requireRegistryAdminRequest } from "../../../../lib/auth/session";
import {
  getSettlementSettings,
  updateSettlementSettings,
} from "../../../../lib/settlement/settings";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const auth = await requireRegistryAdminRequest(request);
  if (auth.response) {
    return auth.response;
  }

  return NextResponse.json({ settings: await getSettlementSettings() });
}

export async function POST(request: NextRequest) {
  const auth = await requireRegistryAdminRequest(request);
  if (auth.response) {
    return auth.response;
  }

  const body = (await request.json().catch(() => null)) as
    | {
        developerRevenueSharePercent?: number;
        payoutHoldDays?: number;
        registryNovaPayMerchantCode?: string | null;
        registryNovaPayApiKeyId?: string | null;
        registryNovaPayApiKeySecret?: string | null;
        registryNovaPayNotifySecret?: string | null;
        registryNovaPayChannelCode?: string | null;
      }
    | null;

  const developerRevenueSharePercent =
    typeof body?.developerRevenueSharePercent === "number"
      ? body.developerRevenueSharePercent
      : 70;
  const payoutHoldDays =
    typeof body?.payoutHoldDays === "number" ? body.payoutHoldDays : 7;

  const settings = await updateSettlementSettings({
    developerRevenueSharePercent,
    payoutHoldDays,
    registryNovaPayMerchantCode: body?.registryNovaPayMerchantCode ?? null,
    registryNovaPayApiKeyId: body?.registryNovaPayApiKeyId ?? null,
    registryNovaPayApiKeySecret: body?.registryNovaPayApiKeySecret ?? null,
    registryNovaPayNotifySecret: body?.registryNovaPayNotifySecret ?? null,
    registryNovaPayChannelCode: body?.registryNovaPayChannelCode ?? null,
  });

  return NextResponse.json({ settings });
}
