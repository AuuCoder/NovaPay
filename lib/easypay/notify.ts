import { appendSignedQueryToUrl, type EasyPayParams } from "@/lib/easypay/sign";
import { revealEasyPayKey } from "@/lib/easypay/credentials";
import { isEasyPayOrder } from "@/lib/easypay/order-marker";
import { getPrismaClient } from "@/lib/prisma";

/**
 * 出站回调请求描述符。原生 NovaPay 与易支付协议各自构造,
 * dispatchMerchantCallback 据此发请求并判定投递成功。
 */
export interface CallbackRequestPlan {
  method: "GET" | "POST";
  url: string;
  headers: Record<string, string>;
  /** 实际发送的 body(GET 为 undefined) */
  body?: string;
  /** 记录到 attempt 的请求体(JSON 友好对象) */
  recordedBody: unknown;
  /** 判定本次投递是否成功 */
  isDelivered: (response: Response, responseText: string | null) => boolean;
}

/**
 * 为易支付订单构造异步通知请求。
 *
 * 易支付客户端期望:GET notify_url?pid&trade_no&out_trade_no&type&name&money&trade_status=TRADE_SUCCESS&param&sign
 * 且必须回纯文本 `success` 才算投递成功。
 *
 * 仅在订单 SUCCEEDED 时通知(易支付协议无失败通知语义)。非成功返回 null,调用方应跳过。
 */
export async function buildEasyPayCallbackRequest(
  order: {
    id: string;
    externalOrderId: string;
    amount: { toString(): string };
    subject: string;
    status: string;
    metadata: unknown;
  },
  notifyUrl: string,
): Promise<CallbackRequestPlan | null> {
  if (!isEasyPayOrder(order.metadata)) {
    return null;
  }

  if (order.status !== "SUCCEEDED") {
    // 易支付只在支付成功时回调
    return null;
  }

  const marker = order.metadata;
  const prisma = getPrismaClient();
  const credential = await prisma.easyPayCredential.findUnique({
    where: { id: marker.easypayCredentialId },
    select: { keyCiphertext: true },
  });

  if (!credential) {
    return null;
  }

  const key = revealEasyPayKey(credential);

  const params: EasyPayParams = {
    pid: marker.easypayPid,
    trade_no: order.id,
    out_trade_no: order.externalOrderId,
    type: marker.easypayType,
    name: order.subject,
    money: order.amount.toString(),
    trade_status: "TRADE_SUCCESS",
    param: marker.param ?? undefined,
  };

  const url = appendSignedQueryToUrl(notifyUrl, params, key);

  return {
    method: "GET",
    url,
    headers: {},
    recordedBody: { ...params, sign_type: "MD5" },
    isDelivered: (response, responseText) =>
      response.ok && (responseText ?? "").trim().toLowerCase() === "success",
  };
}

/**
 * 取易支付订单要回调的 notify_url(来自下单时落库的 metadata)。
 */
export function getEasyPayNotifyUrl(metadata: unknown): string | null {
  if (!isEasyPayOrder(metadata)) {
    return null;
  }
  return metadata.notifyUrl;
}

/**
 * 为易支付订单的同步返回构造带签名的 return_url。
 * 易支付客户端期望 return_url?pid&trade_no&out_trade_no&type&name&money&trade_status&param&sign。
 * 非易支付订单 / 缺凭证返回 null,调用方应回退到原始 returnUrl。
 */
export async function buildEasyPayReturnUrl(
  order: {
    id: string;
    externalOrderId: string;
    amount: { toString(): string };
    subject: string;
    status: string;
    returnUrl: string | null;
    metadata: unknown;
  },
): Promise<string | null> {
  if (!isEasyPayOrder(order.metadata) || !order.returnUrl?.trim()) {
    return null;
  }

  const marker = order.metadata;
  const prisma = getPrismaClient();
  const credential = await prisma.easyPayCredential.findUnique({
    where: { id: marker.easypayCredentialId },
    select: { keyCiphertext: true },
  });

  if (!credential) {
    return null;
  }

  const key = revealEasyPayKey(credential);

  const params: EasyPayParams = {
    pid: marker.easypayPid,
    trade_no: order.id,
    out_trade_no: order.externalOrderId,
    type: marker.easypayType,
    name: order.subject,
    money: order.amount.toString(),
    trade_status: order.status === "SUCCEEDED" ? "TRADE_SUCCESS" : "TRADE_PENDING",
    param: marker.param ?? undefined,
  };

  return appendSignedQueryToUrl(order.returnUrl, params, key);
}
