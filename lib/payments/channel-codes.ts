const CHANNEL_CODE_ALIASES: Record<string, string> = {
  "wechat.native": "wxpay.native",
};

export const USDT_BSC_CHANNEL_CODE = "usdt.bsc";
export const USDT_BASE_CHANNEL_CODE = "usdt.base";
export const USDT_SOL_CHANNEL_CODE = "usdt.sol";

export const USDT_CHANNEL_CODES = [
  USDT_BSC_CHANNEL_CODE,
  USDT_BASE_CHANNEL_CODE,
  USDT_SOL_CHANNEL_CODE,
] as const;

export function normalizePaymentChannelCode(channelCode: string | null | undefined) {
  const normalized = String(channelCode ?? "").trim();
  return CHANNEL_CODE_ALIASES[normalized] ?? normalized;
}

export function isWxpayNativeChannelCode(channelCode: string | null | undefined) {
  return normalizePaymentChannelCode(channelCode) === "wxpay.native";
}

export function isUsdtPaymentChannelCode(channelCode: string | null | undefined) {
  const normalized = normalizePaymentChannelCode(channelCode);
  return USDT_CHANNEL_CODES.includes(
    normalized as (typeof USDT_CHANNEL_CODES)[number],
  );
}

export function isUsdtEvmChannelCode(channelCode: string | null | undefined) {
  const normalized = normalizePaymentChannelCode(channelCode);
  return normalized === USDT_BSC_CHANNEL_CODE || normalized === USDT_BASE_CHANNEL_CODE;
}

export function isUsdtSolanaChannelCode(channelCode: string | null | undefined) {
  return normalizePaymentChannelCode(channelCode) === USDT_SOL_CHANNEL_CODE;
}
