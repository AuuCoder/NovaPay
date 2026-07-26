import { normalizePaymentChannelCode } from "@/lib/payments/channel-codes";

/**
 * 易支付 `type` 短码 → NovaPay 点分 channelCode 的映射。
 *
 * 易支付客户端只发短码(alipay / wxpay / qqpay / bank / usdt ...),
 * NovaPay 内部用点分码(alipay.page / wxpay.native / usdt.bsc ...)。
 * 每张凭证带一份可配映射表,商户可在控制台修改。
 */

export type EasyPayTypeMapping = Record<string, string>;

/**
 * 新建凭证时的默认映射。只映射当前内置且最常用的通道;
 * 商户可在控制台增删,目标通道在保存时会校验「已安装」。
 */
export const DEFAULT_EASYPAY_TYPE_MAPPING: EasyPayTypeMapping = {
  alipay: "alipay.page",
  wxpay: "wxpay.native",
  usdt: "usdt.bsc",
};

/**
 * 把任意来源(Prisma Json)解析成干净的 `Record<string,string>`。
 * 非法形状返回空表。
 */
export function parseTypeMapping(raw: unknown): EasyPayTypeMapping {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return {};
  }

  const mapping: EasyPayTypeMapping = {};
  for (const [type, channelCode] of Object.entries(raw as Record<string, unknown>)) {
    const normalizedType = type.trim().toLowerCase();
    if (normalizedType && typeof channelCode === "string" && channelCode.trim()) {
      mapping[normalizedType] = normalizePaymentChannelCode(channelCode);
    }
  }
  return mapping;
}

/**
 * 解析 type → channelCode。找不到映射返回 null(调用方据此拒绝)。
 */
export function resolveChannelCode(
  mapping: EasyPayTypeMapping,
  type: string | null | undefined,
): string | null {
  const normalizedType = String(type ?? "").trim().toLowerCase();
  if (!normalizedType) {
    return null;
  }
  return mapping[normalizedType] ?? null;
}

/**
 * 校验映射表里的每个目标 channelCode 都在「已安装通道」集合内。
 * 用于控制台保存映射前的把关。返回不合法的 [type, channelCode] 列表。
 */
export function findUninstalledMappingTargets(
  mapping: EasyPayTypeMapping,
  installedCodes: Iterable<string>,
): Array<{ type: string; channelCode: string }> {
  const installed = new Set(
    Array.from(installedCodes, (code) => normalizePaymentChannelCode(code)),
  );
  const invalid: Array<{ type: string; channelCode: string }> = [];
  for (const [type, channelCode] of Object.entries(mapping)) {
    if (!installed.has(normalizePaymentChannelCode(channelCode))) {
      invalid.push({ type, channelCode });
    }
  }
  return invalid;
}
