import { NextResponse, type NextRequest } from "next/server";
import { requireRegistryAdminRequest } from "../../../../lib/auth/session";
import { getRegistryNovaPayBridgeSecrets } from "../../../../lib/settlement/settings";
import { getPrismaClient } from "../../../../lib/runtime/prisma-client";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const auth = await requireRegistryAdminRequest(request);
  if (auth.response) {
    return auth.response;
  }

  const bridge = await getRegistryNovaPayBridgeSecrets();
  const prisma = (await getPrismaClient()) as {
    merchant?: {
      findUnique(args: unknown): Promise<{
        id: string;
        code: string;
        status: string;
        callbackEnabled: boolean;
      } | null>;
    };
    merchantApiCredential?: {
      findFirst(args: unknown): Promise<{ id: string; keyId: string; enabled: boolean } | null>;
    };
    merchantChannelAccount?: {
      findFirst(args: unknown): Promise<{ id: string; channelCode: string; displayName: string } | null>;
    };
  } | null;

  const merchant = bridge.merchantCode
    ? await prisma?.merchant?.findUnique({
        where: { code: bridge.merchantCode },
        select: {
          id: true,
          code: true,
          status: true,
          callbackEnabled: true,
        },
      })
    : null;

  const credential =
    merchant && bridge.apiKeyId
      ? await prisma?.merchantApiCredential?.findFirst({
          where: {
            merchantId: merchant.id,
            keyId: bridge.apiKeyId,
            enabled: true,
          },
          select: {
            id: true,
            keyId: true,
            enabled: true,
          },
        })
      : null;

  const channel =
    merchant && bridge.channelCode
      ? await prisma?.merchantChannelAccount?.findFirst({
          where: {
            merchantId: merchant.id,
            channelCode: bridge.channelCode,
            enabled: true,
          },
          select: {
            id: true,
            channelCode: true,
            displayName: true,
          },
        })
      : null;

  return NextResponse.json({
    merchantConfigured: Boolean(bridge.merchantCode),
    apiKeyConfigured: Boolean(bridge.apiKeyId && bridge.apiKeySecret),
    notifySecretConfigured: Boolean(bridge.notifySecret),
    merchant,
    credential,
    channel,
    ready: Boolean(
      merchant &&
        merchant.status === "APPROVED" &&
        credential &&
        channel &&
        bridge.notifySecret,
    ),
  });
}
