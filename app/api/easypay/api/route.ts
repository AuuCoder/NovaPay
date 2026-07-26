import { NextResponse } from "next/server";
import { isAppError } from "@/lib/errors";
import { verifyEasyPayRequest, parseEasyPayRequest } from "@/lib/easypay/request";
import {
  getMerchantPaymentOrder,
  isEasyPayOrder,
  toEasyPayStatus,
} from "@/lib/easypay/service";
import { createMerchantPaymentRefund } from "@/lib/refunds/service";
import { getRequestClientIp } from "@/lib/payments/api-route";

export const runtime = "nodejs";

/**
 * 易支付订单查询 / 退款:GET/POST /api.php?act=order|refund → /api/easypay/api
 *
 * - act=order:按 out_trade_no(或 trade_no)查单,返回 {code:1,status,trade_no,...}
 * - act=refund:发起退款,返回 {code:1,...} / {code:-1,msg}
 */
function fail(msg: string) {
  return NextResponse.json({ code: -1, msg });
}

async function handleApi(request: Request) {
  let verified;
  try {
    const params = await parseEasyPayRequest(request);
    verified = await verifyEasyPayRequest({ request, params });
  } catch (error) {
    return fail(errorMessage(error, "鉴权失败。"));
  }

  const act = (verified.params.act ?? "").trim().toLowerCase();

  if (act === "order") {
    return handleOrderQuery(verified);
  }

  if (act === "refund") {
    return handleRefund(verified, getRequestClientIp(request));
  }

  return fail(`不支持的 act: ${act || "(空)"}。`);
}

type Verified = Awaited<ReturnType<typeof verifyEasyPayRequest>>;

async function handleOrderQuery(verified: Verified) {
  const params = verified.params;
  const reference = (params.out_trade_no ?? params.trade_no ?? "").trim();

  if (!reference) {
    return fail("缺少 out_trade_no 或 trade_no 参数。");
  }

  try {
    const order = await getMerchantPaymentOrder({
      merchantCode: verified.merchant.code,
      orderReference: reference,
      syncWithProvider: true,
    });

    const marker = isEasyPayOrder(order.metadata) ? order.metadata : null;

    return NextResponse.json({
      code: 1,
      msg: "success",
      trade_no: order.id,
      out_trade_no: order.externalOrderId,
      type: marker?.easypayType ?? "",
      pid: verified.pid,
      addtime: order.createdAt.toISOString(),
      endtime: order.completedAt?.toISOString() ?? "",
      name: order.subject,
      money: order.amount.toString(),
      status: toEasyPayStatus(order.status),
    });
  } catch (error) {
    return fail(errorMessage(error, "查询失败。"));
  }
}

async function handleRefund(verified: Verified, clientIp: string | null) {
  const params = verified.params;
  const reference = (params.out_trade_no ?? params.trade_no ?? "").trim();
  const money = (params.money ?? "").trim();

  if (!reference) {
    return fail("缺少 out_trade_no 或 trade_no 参数。");
  }

  if (!money) {
    return fail("缺少 money 参数。");
  }

  try {
    const { refund } = await createMerchantPaymentRefund({
      merchantCode: verified.merchant.code,
      orderReference: reference,
      // 易支付退款无独立退款号,用 out_trade_no 派生一个稳定幂等键
      externalRefundId: `easypay-refund-${reference}`,
      amount: money,
      reason: (params.reason ?? "").trim() || null,
      metadata: { protocol: "easypay", pid: verified.pid, clientIp },
    });

    return NextResponse.json({
      code: 1,
      msg: "success",
      trade_no: refund.paymentOrderId,
      out_trade_no: reference,
      refund_no: refund.id,
      money: refund.amount.toString(),
    });
  } catch (error) {
    return fail(errorMessage(error, "退款失败。"));
  }
}

function errorMessage(error: unknown, fallback: string) {
  if (isAppError(error)) {
    return error.message;
  }
  return error instanceof Error ? error.message : fallback;
}

export async function GET(request: Request) {
  return handleApi(request);
}

export async function POST(request: Request) {
  return handleApi(request);
}
