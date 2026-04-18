import { randomBytes } from "node:crypto";
import type { Locale } from "@/lib/i18n";
import { getPublicBaseUrl } from "@/lib/env";
import { isWxpayNativeChannelCode } from "@/lib/payments/channel-codes";
import { maskProviderConfigForDisplay } from "@/lib/provider-account-config";

interface MerchantChannelFieldDefinition {
  key: string;
  label: string;
  required?: boolean;
  placeholder?: string;
  multiline?: boolean;
}

interface MerchantChannelTemplate {
  channelCode: "alipay.page" | "wxpay.native";
  providerKey: "alipay" | "wxpay";
  title: string;
  description: string;
  requiresMerchantProfileCompletion: boolean;
  fields: MerchantChannelFieldDefinition[];
}

export function getMerchantChannelTemplates(locale: Locale = "zh"): MerchantChannelTemplate[] {
  return locale === "en"
    ? [
        {
          channelCode: "alipay.page",
          providerKey: "alipay",
          title: "Alipay Web Payment",
          description:
            "Merchants maintain their own AppID, application private key, and Alipay public key. NovaPay generates a dedicated upstream callback URL for each channel instance.",
          requiresMerchantProfileCompletion: true,
          fields: [
            { key: "appId", label: "App ID", required: true, placeholder: "2021000000000000" },
            { key: "privateKey", label: "Application Private Key", required: true, multiline: true, placeholder: "-----BEGIN PRIVATE KEY-----" },
            { key: "publicKey", label: "Alipay Public Key", required: true, multiline: true, placeholder: "-----BEGIN PUBLIC KEY-----" },
          ],
        },
        {
          channelCode: "wxpay.native",
          providerKey: "wxpay",
          title: "WeChat Native QR",
          description:
            "Merchants maintain their own WeChat Pay merchant ID, merchant certificate serial number, private key, API v3 key, and WeChat Pay public key. NovaPay generates a dedicated upstream callback URL for each channel instance.",
          requiresMerchantProfileCompletion: true,
          fields: [
            { key: "appId", label: "App ID", required: true, placeholder: "wx1234567890abcdef" },
            { key: "mchId", label: "Merchant ID", required: true, placeholder: "1900000109" },
            { key: "mchSerialNo", label: "Merchant Certificate Serial Number", required: true, placeholder: "777B7C..." },
            { key: "privateKey", label: "Merchant Private Key", required: true, multiline: true, placeholder: "-----BEGIN PRIVATE KEY-----" },
            { key: "apiV3Key", label: "API v3 Key", required: true, placeholder: "32-byte API v3 key" },
            { key: "platformPublicKey", label: "WeChat Platform Public Key", required: true, multiline: true, placeholder: "-----BEGIN PUBLIC KEY-----" },
            { key: "platformSerial", label: "WeChat Pay Public Key ID", placeholder: "PUB_KEY_ID_011..." },
          ],
        },
      ]
    : [
  {
    channelCode: "alipay.page",
    providerKey: "alipay",
    title: "支付宝网页支付",
    description: "商户自己维护 AppID、应用私钥和支付宝公钥，系统为当前通道实例生成专属上游回调地址。",
    requiresMerchantProfileCompletion: true,
    fields: [
      { key: "appId", label: "App ID", required: true, placeholder: "2021000000000000" },
      { key: "privateKey", label: "应用私钥", required: true, multiline: true, placeholder: "-----BEGIN PRIVATE KEY-----" },
      { key: "publicKey", label: "支付宝公钥", required: true, multiline: true, placeholder: "-----BEGIN PUBLIC KEY-----" },
    ],
  },
  {
    channelCode: "wxpay.native",
    providerKey: "wxpay",
    title: "微信 Native 扫码",
    description: "商户自己维护微信支付商户号、商户证书序列号、商户私钥、API v3 密钥和微信支付公钥，系统为当前通道实例生成专属上游回调地址。",
    requiresMerchantProfileCompletion: true,
    fields: [
      { key: "appId", label: "App ID", required: true, placeholder: "wx1234567890abcdef" },
      { key: "mchId", label: "商户号", required: true, placeholder: "1900000109" },
      { key: "mchSerialNo", label: "商户证书序列号", required: true, placeholder: "777B7C..." },
      { key: "privateKey", label: "商户私钥", required: true, multiline: true, placeholder: "-----BEGIN PRIVATE KEY-----" },
      { key: "apiV3Key", label: "API v3 Key", required: true, placeholder: "32字节 APIv3 密钥" },
      { key: "platformPublicKey", label: "微信平台公钥", required: true, multiline: true, placeholder: "-----BEGIN PUBLIC KEY-----" },
      { key: "platformSerial", label: "微信支付公钥 ID", placeholder: "PUB_KEY_ID_011..." },
    ],
  },
];
}

const merchantChannelTemplates: MerchantChannelTemplate[] = getMerchantChannelTemplates("zh");

export function getMerchantChannelTemplate(channelCode: string) {
  return merchantChannelTemplates.find((template) => template.channelCode === channelCode) ?? null;
}

export function generateMerchantChannelCallbackToken() {
  return `mct_${randomBytes(18).toString("base64url")}`;
}

export function buildMerchantChannelCallbackPath(channelCode: string, accountId: string, token: string) {
  if (channelCode === "alipay.page") {
    return `/api/payments/callback/alipay/${accountId}/${token}`;
  }

  if (isWxpayNativeChannelCode(channelCode)) {
    return `/api/payments/callback/wxpay/${accountId}/${token}`;
  }

  throw new Error(`Unsupported merchant channel callback for ${channelCode}.`);
}

export function buildMerchantChannelCallbackUrl(channelCode: string, accountId: string, token: string) {
  return `${getPublicBaseUrl()}${buildMerchantChannelCallbackPath(channelCode, accountId, token)}`;
}

export function maskMerchantChannelConfig(value: unknown) {
  return maskProviderConfigForDisplay(value);
}
