import { isRecord } from "@/lib/payments/utils";
import type { EasyPayAuthResult } from "@/lib/easypay/request";

/**
 * 易支付订单的 metadata 协议标记。出站 notify / 同步 return 依赖它来:
 *  - 识别这是易支付订单(protocol)
 *  - 取回签名 KEY(easypayCredentialId → 解密)
 *  - 回显客户端原样字段(easypayType、param)
 *
 * 本模块为纯标记工具,不依赖 orders/callbacks,避免模块循环引用。
 */
export interface EasyPayOrderMarker {
  protocol: "easypay";
  easypayCredentialId: string;
  easypayPid: string;
  easypayType: string;
  notifyUrl: string | null;
  param: string | null;
  [key: string]: unknown;
}

export function buildEasyPayMetadata(
  auth: EasyPayAuthResult,
  extras: { notifyUrl: string | null; param: string | null },
): EasyPayOrderMarker {
  return {
    protocol: "easypay",
    easypayCredentialId: auth.credential.id,
    easypayPid: auth.pid,
    easypayType: auth.type,
    notifyUrl: extras.notifyUrl,
    param: extras.param,
  };
}

export function isEasyPayOrder(metadata: unknown): metadata is EasyPayOrderMarker {
  return isRecord(metadata) && metadata.protocol === "easypay";
}

/** 易支付查询单的 status 语义:1=已支付,0=未支付。 */
export function toEasyPayStatus(orderStatus: string): 0 | 1 {
  return orderStatus === "SUCCEEDED" ? 1 : 0;
}
