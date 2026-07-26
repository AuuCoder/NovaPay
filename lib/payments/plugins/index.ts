import type { Locale } from "@/lib/i18n";
import { normalizePaymentChannelCode } from "@/lib/payments/channel-codes";
import { alipayPagePlugin } from "@/lib/payments/plugins/alipay-page";
import {
  resolveMerchantChannelTemplate,
  resolvePaymentChannelOption,
  type MerchantChannelTemplate,
  type PaymentChannelOption,
  type PaymentPluginDefinition,
} from "@/lib/payments/plugins/types";
import {
  usdtBasePlugin,
  usdtBscPlugin,
  usdtSolPlugin,
} from "@/lib/payments/plugins/usdt-onchain";
import { wxpayNativePlugin } from "@/lib/payments/plugins/wxpay-native";
import {
  ctfAlipayBillCapturePlugin,
  ctfWxpayBillCapturePlugin,
} from "@/lib/payments/plugins/ctf-bill-capture";

const paymentPlugins: PaymentPluginDefinition[] = [
  alipayPagePlugin,
  wxpayNativePlugin,
  usdtBscPlugin,
  usdtBasePlugin,
  usdtSolPlugin,
  ctfAlipayBillCapturePlugin,
  ctfWxpayBillCapturePlugin,
];

const paymentPluginsByCode = new Map<string, PaymentPluginDefinition>(
  paymentPlugins.map((plugin) => [plugin.channelCode, plugin]),
);

export function listPaymentPlugins() {
  return paymentPlugins;
}

export function getPaymentPlugin(channelCode: string) {
  const normalized = normalizePaymentChannelCode(channelCode);
  return paymentPluginsByCode.get(normalized);
}

export function listMerchantChannelTemplates(
  locale: Locale = "zh",
): MerchantChannelTemplate[] {
  return paymentPlugins.map((plugin) =>
    resolveMerchantChannelTemplate(plugin, locale),
  );
}

export function getMerchantChannelTemplateByCode(
  channelCode: string,
  locale: Locale = "zh",
) {
  const plugin = getPaymentPlugin(channelCode);
  return plugin ? resolveMerchantChannelTemplate(plugin, locale) : null;
}

export function listPaymentChannelOptions(
  locale: Locale = "zh",
): PaymentChannelOption[] {
  return paymentPlugins.map((plugin) => resolvePaymentChannelOption(plugin, locale));
}
