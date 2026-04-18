import { alipayPageProvider } from "@/lib/payments/providers/alipay-page";
import {
  usdtBaseProvider,
  usdtBscProvider,
  usdtSolProvider,
} from "@/lib/payments/providers/usdt-onchain";
import { wxpayNativeProvider } from "@/lib/payments/providers/wxpay-native";
import { normalizePaymentChannelCode } from "@/lib/payments/channel-codes";
import type { PaymentChannelCode, PaymentProvider } from "@/lib/payments/types";

const providers: Partial<Record<PaymentChannelCode, PaymentProvider>> = {
  "alipay.page": alipayPageProvider,
  "usdt.base": usdtBaseProvider,
  "usdt.bsc": usdtBscProvider,
  "usdt.sol": usdtSolProvider,
  "wxpay.native": wxpayNativeProvider,
};

export function getPaymentProvider(channelCode: string) {
  const normalized = normalizePaymentChannelCode(channelCode);
  return providers[normalized as PaymentChannelCode];
}

export function listPaymentChannels() {
  return Object.values(providers).map((provider) => provider.getSummary());
}

export type { PaymentProvider };
