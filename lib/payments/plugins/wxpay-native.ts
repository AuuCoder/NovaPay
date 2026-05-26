import { wxpayNativeProvider } from "@/lib/payments/providers/wxpay-native";
import type { PaymentPluginDefinition } from "@/lib/payments/plugins/types";

export const wxpayNativePlugin: PaymentPluginDefinition = {
  channelCode: "wxpay.native",
  providerKey: "wxpay",
  provider: wxpayNativeProvider,
  marketplace: {
    slug: "novapay.wxpay-native",
    packageName: "@novapay/plugin-wxpay-native",
    vendor: "NovaPay Core",
    version: "1.0.0",
    category: {
      zh: "官方支付",
      en: "Official Payment",
    },
    summary: {
      zh: "微信 Native 扫码支付的受控内置插件，面向二维码收银场景。",
      en: "Trusted built-in WeChat Native QR payment plugin for scan-to-pay flows.",
    },
    description: {
      zh: "由 NovaPay 核心团队维护，支持商户自有微信商户号、API v3 验签、专属回调路由与统一订单编排。",
      en: "Maintained by the NovaPay core team with merchant-owned WeChat credentials, API v3 signature verification, dedicated callback routes, and unified order orchestration.",
    },
  },
  callbacks: {
    pathSegment: "wxpay",
  },
  adminOption: {
    title: {
      zh: "微信 Native 扫码",
      en: "WeChat Native QR",
    },
    detail: {
      zh: "返回 code_url，前端需渲染二维码供扫码支付。",
      en: "Returns a `code_url` for the frontend to render as a QR code.",
    },
  },
  merchantTemplate: {
    title: {
      zh: "微信 Native 扫码",
      en: "WeChat Native QR",
    },
    description: {
      zh: "商户自己维护微信支付商户号、商户证书序列号、商户私钥、API v3 密钥和微信支付公钥，系统为当前通道实例生成专属上游回调地址。",
      en: "Merchants maintain their own WeChat Pay merchant ID, merchant certificate serial number, private key, API v3 key, and WeChat Pay public key. NovaPay generates a dedicated upstream callback URL for each channel instance.",
    },
    requiresMerchantProfileCompletion: true,
    fields: [
      { key: "appId", label: "App ID", required: true, placeholder: "wx1234567890abcdef" },
      {
        key: "mchId",
        label: {
          zh: "商户号",
          en: "Merchant ID",
        },
        required: true,
        placeholder: "1900000109",
      },
      {
        key: "mchSerialNo",
        label: {
          zh: "商户证书序列号",
          en: "Merchant Certificate Serial Number",
        },
        required: true,
        placeholder: "777B7C...",
      },
      {
        key: "privateKey",
        label: {
          zh: "商户私钥",
          en: "Merchant Private Key",
        },
        required: true,
        multiline: true,
        placeholder: "-----BEGIN PRIVATE KEY-----",
      },
      {
        key: "apiV3Key",
        label: "API v3 Key",
        required: true,
        placeholder: "32字节 APIv3 密钥",
      },
      {
        key: "platformPublicKey",
        label: {
          zh: "微信平台公钥",
          en: "WeChat Platform Public Key",
        },
        required: true,
        multiline: true,
        placeholder: "-----BEGIN PUBLIC KEY-----",
      },
      {
        key: "platformSerial",
        label: {
          zh: "微信支付公钥 ID",
          en: "WeChat Pay Public Key ID",
        },
        placeholder: "PUB_KEY_ID_011...",
      },
    ],
  },
};
