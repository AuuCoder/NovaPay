import { randomBytes } from "node:crypto";
import type { Locale } from "@/lib/i18n";
import { getPublicBaseUrl } from "@/lib/env";
import {
  isUsdtPaymentChannelCode,
  isWxpayNativeChannelCode,
} from "@/lib/payments/channel-codes";
import { maskProviderConfigForDisplay } from "@/lib/provider-account-config";

interface MerchantChannelFieldDefinition {
  key: string;
  label: string;
  required?: boolean;
  placeholder?: string;
  multiline?: boolean;
}

interface MerchantChannelTemplate {
  channelCode: "alipay.page" | "wxpay.native" | "usdt.bsc" | "usdt.base" | "usdt.sol";
  providerKey: "alipay" | "wxpay" | "crypto";
  title: string;
  description: string;
  requiresMerchantProfileCompletion: boolean;
  supportsCallbackRoute: boolean;
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
          supportsCallbackRoute: true,
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
          supportsCallbackRoute: true,
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
        {
          channelCode: "usdt.bsc",
          providerKey: "crypto",
          title: "USDT on BSC",
          description:
            "The merchant provides its own BSC USDT receiving address. NovaPay generates a hosted checkout page, locks the quote, and matches on-chain deposits for this channel.",
          requiresMerchantProfileCompletion: false,
          supportsCallbackRoute: false,
          fields: [
            { key: "walletAddress", label: "Receiving Address", required: true, placeholder: "0x..." },
            { key: "addressLabel", label: "Address Label", placeholder: "BSC main wallet" },
          ],
        },
        {
          channelCode: "usdt.base",
          providerKey: "crypto",
          title: "USDT on Base",
          description:
            "The merchant provides its own Base USDT receiving address. NovaPay generates a hosted checkout page, locks the quote, and matches on-chain deposits for this channel.",
          requiresMerchantProfileCompletion: false,
          supportsCallbackRoute: false,
          fields: [
            { key: "walletAddress", label: "Receiving Address", required: true, placeholder: "0x..." },
            { key: "addressLabel", label: "Address Label", placeholder: "Base settlement wallet" },
          ],
        },
        {
          channelCode: "usdt.sol",
          providerKey: "crypto",
          title: "USDT on Solana",
          description:
            "The merchant provides its own Solana USDT receiving address. NovaPay generates a hosted checkout page, locks the quote, and matches on-chain deposits for this channel.",
          requiresMerchantProfileCompletion: false,
          supportsCallbackRoute: false,
          fields: [
            { key: "walletAddress", label: "Receiving Address", required: true, placeholder: "9xQeWvG816bUx9EP..." },
            { key: "addressLabel", label: "Address Label", placeholder: "Solana receiving wallet" },
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
    supportsCallbackRoute: true,
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
    supportsCallbackRoute: true,
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
  {
    channelCode: "usdt.bsc",
    providerKey: "crypto",
    title: "USDT · BSC",
    description: "商户维护自己的 BSC 链 USDT 收款地址。系统会为该通道生成托管支付页、锁定报价并匹配链上到账。",
    requiresMerchantProfileCompletion: false,
    supportsCallbackRoute: false,
    fields: [
      { key: "walletAddress", label: "收款地址", required: true, placeholder: "0x..." },
      { key: "addressLabel", label: "地址备注", placeholder: "BSC 主收款钱包" },
    ],
  },
  {
    channelCode: "usdt.base",
    providerKey: "crypto",
    title: "USDT · Base",
    description: "商户维护自己的 Base 链 USDT 收款地址。系统会为该通道生成托管支付页、锁定报价并匹配链上到账。",
    requiresMerchantProfileCompletion: false,
    supportsCallbackRoute: false,
    fields: [
      { key: "walletAddress", label: "收款地址", required: true, placeholder: "0x..." },
      { key: "addressLabel", label: "地址备注", placeholder: "Base 结算钱包" },
    ],
  },
  {
    channelCode: "usdt.sol",
    providerKey: "crypto",
    title: "USDT · Solana",
    description: "商户维护自己的 Solana 链 USDT 收款地址。系统会为该通道生成托管支付页、锁定报价并匹配链上到账。",
    requiresMerchantProfileCompletion: false,
    supportsCallbackRoute: false,
    fields: [
      { key: "walletAddress", label: "收款地址", required: true, placeholder: "9xQeWvG816bUx9EP..." },
      { key: "addressLabel", label: "地址备注", placeholder: "Solana 收款钱包" },
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

export function supportsMerchantChannelCallbackRoute(channelCode: string) {
  return !isUsdtPaymentChannelCode(channelCode);
}

export function buildMerchantChannelCallbackPath(channelCode: string, accountId: string, token: string) {
  if (!supportsMerchantChannelCallbackRoute(channelCode)) {
    throw new Error(`Channel ${channelCode} does not use an upstream callback route.`);
  }

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
