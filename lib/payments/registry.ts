import { alipayPageProvider } from "@/lib/payments/providers/alipay-page";
import { wxpayNativeProvider } from "@/lib/payments/providers/wxpay-native";
import type { PaymentChannelCode, PaymentProvider } from "@/lib/payments/types";

const providers: Record<PaymentChannelCode, PaymentProvider> = {
  "alipay.page": alipayPageProvider,
  "wxpay.native": wxpayNativeProvider,
};

export function getPaymentProvider(channelCode: string) {
  return providers[channelCode as PaymentChannelCode];
}

export function listPaymentChannels() {
  return Object.values(providers).map((provider) => provider.getSummary());
}

export type { PaymentProvider };
