import {
  isUsdtEvmChannelCode,
  isUsdtPaymentChannelCode,
  isUsdtSolanaChannelCode,
} from "@/lib/payments/channel-codes";

const EVM_ADDRESS_PATTERN = /^0x[a-fA-F0-9]{40}$/;
const SOLANA_ADDRESS_PATTERN = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

function normalizeRawAddress(value: string | null | undefined) {
  return String(value ?? "").trim();
}

export function normalizeEvmAddress(value: string | null | undefined) {
  const normalized = normalizeRawAddress(value);

  if (!EVM_ADDRESS_PATTERN.test(normalized)) {
    throw new Error("Invalid EVM wallet address.");
  }

  return normalized.toLowerCase();
}

export function normalizeSolanaAddress(value: string | null | undefined) {
  const normalized = normalizeRawAddress(value);

  if (!SOLANA_ADDRESS_PATTERN.test(normalized)) {
    throw new Error("Invalid Solana wallet address.");
  }

  return normalized;
}

export function normalizeUsdtReceivingAddress(
  channelCode: string | null | undefined,
  value: string | null | undefined,
) {
  const normalized = normalizeRawAddress(value);

  if (!normalized) {
    throw new Error("USDT receiving address is required.");
  }

  if (isUsdtEvmChannelCode(channelCode)) {
    return normalizeEvmAddress(normalized);
  }

  if (isUsdtSolanaChannelCode(channelCode)) {
    return normalizeSolanaAddress(normalized);
  }

  if (isUsdtPaymentChannelCode(channelCode)) {
    throw new Error(`Unsupported USDT channel code: ${channelCode}`);
  }

  return normalized;
}
