const CHANNEL_CODE_ALIASES: Record<string, string> = {
  "wechat.native": "wxpay.native",
};

export function normalizePaymentChannelCode(channelCode: string | null | undefined) {
  const normalized = String(channelCode ?? "").trim();
  return CHANNEL_CODE_ALIASES[normalized] ?? normalized;
}

export function isWxpayNativeChannelCode(channelCode: string | null | undefined) {
  return normalizePaymentChannelCode(channelCode) === "wxpay.native";
}
