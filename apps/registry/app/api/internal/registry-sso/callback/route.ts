import { NextResponse } from "next/server";
import { createRegistrySession } from "../../../../../lib/auth/session";
import { exchangeNovaPayAdminSsoToken } from "../../../../../lib/auth/novapay-admin-sso";
import { updateSettlementSettings } from "../../../../../lib/settlement/settings";
import { getNovaPayMainAppUrl } from "../../../../../lib/auth/novapay-admin-sso";

export const runtime = "nodejs";

function withMessage(path: string, key: "error" | "success", message: string) {
  const url = new URL(path, "http://localhost");
  url.searchParams.set(key, message);
  return `${url.pathname}?${url.searchParams.toString()}`;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token");

  if (!token) {
    return NextResponse.redirect(
      new URL(
        withMessage("/developer/auth", "error", "sso_token_missing"),
        request.url,
      ),
    );
  }

  const adminIdentity = await exchangeNovaPayAdminSsoToken(token);

  if (!adminIdentity) {
    return NextResponse.redirect(
      new URL(
        withMessage(
          "/developer/auth",
          "error",
          "sso_token_invalid",
        ),
        request.url,
      ),
    );
  }

  await createRegistrySession({
    actorKind: "ADMIN_SSO",
    actorId: adminIdentity.id,
    email: adminIdentity.email,
    displayName: adminIdentity.name,
    role: adminIdentity.role,
  });

  const bridgeResponse = await fetch(
    new URL("/api/internal/bootstrap/registry-bridge", getNovaPayMainAppUrl()).toString(),
    {
      method: "POST",
      cache: "no-store",
    },
  );

  if (bridgeResponse.ok) {
    const bridgePayload = (await bridgeResponse.json().catch(() => null)) as
      | {
          success?: boolean;
          bridge?: {
            merchantCode: string;
            apiKeyId: string;
            apiKeySecret: string;
            notifySecret: string;
            channelCode: string;
          };
        }
      | null;

    if (bridgePayload?.success && bridgePayload.bridge) {
      await updateSettlementSettings({
        developerRevenueSharePercent: 70,
        payoutHoldDays: 7,
        registryNovaPayMerchantCode: bridgePayload.bridge.merchantCode,
        registryNovaPayApiKeyId: bridgePayload.bridge.apiKeyId,
        registryNovaPayApiKeySecret: bridgePayload.bridge.apiKeySecret,
        registryNovaPayNotifySecret: bridgePayload.bridge.notifySecret,
        registryNovaPayChannelCode: bridgePayload.bridge.channelCode,
      });
    }
  }

  return NextResponse.redirect(
    new URL(
      withMessage("/developer/plugins", "success", "sso_connected"),
      request.url,
    ),
  );
}
