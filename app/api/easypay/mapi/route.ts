import { NextResponse } from "next/server";
import { isAppError } from "@/lib/errors";
import { authenticateEasyPayRequest, parseEasyPayRequest } from "@/lib/easypay/request";
import { createEasyPayPaymentOrder } from "@/lib/easypay/service";
import { getRequestClientIp, getRequestOrigin } from "@/lib/payments/api-route";
import { isRecord } from "@/lib/payments/utils";

export const runtime = "nodejs";

/**
 * 易支付 API 支付(mapi):GET/POST /mapi.php → /api/easypay/mapi
 *
 * 验签建单后返回 JSON:
 *  - 成功 {code:1, trade_no, type, ...}
 *    · 跳转类(redirect)→ payurl(收银台 URL)
 *    · 扫码类(qr_code)→ qrcode(二维码原文)
 *  - 失败 {code:-1, msg}
 */
function fail(msg: string) {
  return NextResponse.json({ code: -1, msg });
}

async function handleMapi(request: Request) {
  let auth;
  try {
    const params = await parseEasyPayRequest(request);
    auth = await authenticateEasyPayRequest({ request, params });
  } catch (error) {
    const message = isAppError(error)
      ? error.message
      : error instanceof Error
        ? error.message
        : "鉴权失败。";
    return fail(message);
  }

  try {
    const { result } = await createEasyPayPaymentOrder({
      auth,
      clientIp: getRequestClientIp(request),
    });

    const order = result.order;
    const channelPayload = isRecord(order.channelPayload) ? order.channelPayload : {};
    const mode = typeof channelPayload.mode === "string" ? channelPayload.mode : null;
    const cashierUrl = new URL(`/pay/${order.id}`, getRequestOrigin(request)).toString();

    const base: Record<string, unknown> = {
      code: 1,
      msg: "success",
      trade_no: order.id,
      out_trade_no: order.externalOrderId,
      type: auth.type,
    };

    if (mode === "qr_code" && order.checkoutUrl) {
      // 扫码类:返回二维码原文 + 托管页兜底
      return NextResponse.json({
        ...base,
        qrcode: order.checkoutUrl,
        payurl: cashierUrl,
      });
    }

    // 跳转类(默认):返回收银台 URL
    return NextResponse.json({
      ...base,
      payurl: order.checkoutUrl || cashierUrl,
    });
  } catch (error) {
    const message = isAppError(error)
      ? error.message
      : error instanceof Error
        ? error.message
        : "下单失败。";
    return fail(message);
  }
}

export async function GET(request: Request) {
  return handleMapi(request);
}

export async function POST(request: Request) {
  return handleMapi(request);
}
