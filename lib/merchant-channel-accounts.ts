import { randomBytes } from "node:crypto";
import type { Locale } from "@/lib/i18n";
import { getPublicBaseUrl } from "@/lib/env";
import {
  getMerchantInstalledMerchantChannelTemplate,
  listMerchantInstalledMerchantChannelTemplates,
} from "@/lib/plugins/marketplace";
import {
  getMerchantChannelTemplateByCode,
  getPaymentPlugin,
  listMerchantChannelTemplates,
} from "@/lib/payments/plugins";
import type { MerchantChannelTemplate } from "@/lib/payments/plugins/types";
import { maskProviderConfigForDisplay } from "@/lib/provider-account-config";

export function getMerchantChannelTemplates(locale: Locale = "zh"): MerchantChannelTemplate[] {
  return listMerchantChannelTemplates(locale);
}

export function getMerchantChannelTemplate(channelCode: string) {
  return getMerchantChannelTemplateByCode(channelCode);
}

export async function getActiveMerchantChannelTemplates(
  merchantId: string,
  locale: Locale = "zh",
) {
  return listMerchantInstalledMerchantChannelTemplates(merchantId, locale);
}

export async function getActiveMerchantChannelTemplate(
  merchantId: string,
  channelCode: string,
  locale: Locale = "zh",
) {
  return getMerchantInstalledMerchantChannelTemplate(merchantId, channelCode, locale);
}

export function generateMerchantChannelCallbackToken() {
  return `mct_${randomBytes(18).toString("base64url")}`;
}

export function supportsMerchantChannelCallbackRoute(channelCode: string) {
  return Boolean(getPaymentPlugin(channelCode)?.callbacks);
}

export function buildMerchantChannelCallbackPath(
  channelCode: string,
  accountId: string,
  token: string,
) {
  const plugin = getPaymentPlugin(channelCode);

  if (plugin?.channelCode === "ctf.alipay.monitor" || plugin?.channelCode === "ctf.wxpay.monitor") {
    return `/api/ctf/bill-capture/${accountId}/${token}`;
  }

  if (!plugin?.callbacks) {
    throw new Error(`Channel ${channelCode} does not use an upstream callback route.`);
  }

  return `/api/payments/callback/${plugin.callbacks.pathSegment}/${accountId}/${token}`;
}

export function buildMerchantChannelCallbackUrl(
  channelCode: string,
  accountId: string,
  token: string,
) {
  return `${getPublicBaseUrl()}${buildMerchantChannelCallbackPath(channelCode, accountId, token)}`;
}

export function maskMerchantChannelConfig(value: unknown) {
  return maskProviderConfigForDisplay(value);
}
