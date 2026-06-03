import { NextResponse } from "next/server";

import { AppError, isAppError } from "@/lib/errors";
import { authenticateMerchantApiRequest } from "@/lib/merchants/api-auth";
import { listMerchantInstalledPaymentChannels } from "@/lib/plugins/marketplace";

export const runtime = "nodejs";

/**
 * 商户鉴权接口:返回该商户当前真正"已安装且启用"的支付渠道。
 *
 * 鉴权沿用与下单一致的签名方案(x-novapay-key / timestamp / nonce / signature),
 * 签名串为 `${timestamp}.${nonce}.${rawBody}`。GET 无 body,rawBody 为空串。
 *
 * merchantCode 通过查询参数传入(GET 没有 body)。
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const merchantCode = url.searchParams.get("merchantCode")?.trim() ?? "";

  if (!merchantCode) {
    return NextResponse.json(
      { error: "merchantCode is required." },
      { status: 400 },
    );
  }

  try {
    const { merchant } = await authenticateMerchantApiRequest({
      request,
      rawBody: "",
      merchantCode,
    });

    const channels = await listMerchantInstalledPaymentChannels(merchant.id);

    return NextResponse.json({
      merchantCode: merchant.code,
      channels: channels.map((channel) => ({
        code: channel.code,
        provider: channel.provider,
        displayName: channel.displayName,
        configured: channel.configured,
        capabilities: channel.capabilities,
      })),
      channelCodes: channels.map((channel) => channel.code),
    });
  } catch (error) {
    if (isAppError(error)) {
      return NextResponse.json(
        { error: error.message, code: error.code, details: error.details },
        { status: error.status },
      );
    }

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to list installed payment channels.",
      },
      { status: 500 },
    );
  }
}
