import { NextResponse } from "next/server";
import { isAppError } from "@/lib/errors";
import { authenticateEasyPayRequest, parseEasyPayRequest } from "@/lib/easypay/request";
import { createEasyPayPaymentOrder } from "@/lib/easypay/service";
import { getRequestClientIp, getRequestOrigin } from "@/lib/payments/api-route";

export const runtime = "nodejs";

/**
 * 易支付页面跳转支付:GET/POST /submit.php → /api/easypay/submit
 *
 * 验签建单后 302 跳到 NovaPay 托管收银台 /pay/{orderId}。
 * 易支付客户端把用户浏览器直接打到本端点,所以错误也以 HTML/文本回显,不返回 JSON。
 */
async function handleSubmit(request: Request) {
  try {
    const params = await parseEasyPayRequest(request);
    const auth = await authenticateEasyPayRequest({ request, params });

    const { result } = await createEasyPayPaymentOrder({
      auth,
      clientIp: getRequestClientIp(request),
    });

    const cashierUrl = new URL(`/pay/${result.order.id}`, getRequestOrigin(request)).toString();
    return NextResponse.redirect(cashierUrl, 302);
  } catch (error) {
    const message = isAppError(error)
      ? error.message
      : error instanceof Error
        ? error.message
        : "下单失败。";
    const status = isAppError(error) ? error.status : 400;

    return new NextResponse(`易支付下单失败:${message}`, {
      status,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }
}

export async function GET(request: Request) {
  return handleSubmit(request);
}

export async function POST(request: Request) {
  return handleSubmit(request);
}
