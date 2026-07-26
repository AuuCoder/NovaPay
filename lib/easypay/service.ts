import { isTerminalPaymentStatus } from "@/lib/orders/status";
import { createPaymentOrder, getMerchantPaymentOrder } from "@/lib/orders/service";
import type { EasyPayAuthResult } from "@/lib/easypay/request";
import {
  buildEasyPayMetadata,
  isEasyPayOrder,
  toEasyPayStatus,
  type EasyPayOrderMarker,
} from "@/lib/easypay/order-marker";
import { formatAmount } from "@/lib/payments/utils";

/**
 * 把一个已鉴权的易支付请求落成 NovaPay 订单。
 * 复用 createPaymentOrder 的全部校验(商户审核、插件已装、out_trade_no 去重等)。
 */
export async function createEasyPayPaymentOrder(input: {
  auth: EasyPayAuthResult;
  clientIp?: string | null;
}) {
  const { auth } = input;
  const params = auth.params;

  const outTradeNo = (params.out_trade_no ?? "").trim();
  if (!outTradeNo) {
    throw new Error("缺少 out_trade_no 参数。");
  }

  const name = (params.name ?? "").trim();
  if (!name) {
    throw new Error("缺少 name 参数。");
  }

  // formatAmount 会校验正数并保留两位
  const amount = formatAmount(params.money ?? "");

  const notifyUrl = (params.notify_url ?? "").trim() || null;
  const returnUrl = (params.return_url ?? "").trim() || null;
  const param = (params.param ?? "").trim() || null;

  const metadata = buildEasyPayMetadata(auth, { notifyUrl, param });

  const result = await createPaymentOrder({
    merchantCode: auth.merchant.code,
    channelCode: auth.channelCode,
    externalOrderId: outTradeNo,
    amount,
    currency: "CNY",
    subject: name,
    clientIp: input.clientIp ?? null,
    returnUrl,
    // 业务异步通知地址走易支付出站逻辑,这里不复用 callbackUrl(那是 NovaPay JSON 回调)。
    callbackUrl: null,
    metadata,
  });

  return { result, outTradeNo, amount, name };
}

export {
  isTerminalPaymentStatus,
  getMerchantPaymentOrder,
  isEasyPayOrder,
  toEasyPayStatus,
  buildEasyPayMetadata,
};
export type { EasyPayOrderMarker };
