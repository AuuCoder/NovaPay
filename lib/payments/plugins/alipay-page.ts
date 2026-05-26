import { alipayPageProvider } from "@/lib/payments/providers/alipay-page";
import type { PaymentPluginDefinition } from "@/lib/payments/plugins/types";

export const alipayPagePlugin: PaymentPluginDefinition = {
  channelCode: "alipay.page",
  providerKey: "alipay",
  provider: alipayPageProvider,
  marketplace: {
    slug: "novapay.alipay-page",
    packageName: "@novapay/plugin-alipay-page",
    vendor: "NovaPay Core",
    version: "1.0.0",
    category: {
      zh: "官方支付",
      en: "Official Payment",
    },
    summary: {
      zh: "支付宝网页支付的受控内置插件，适用于桌面网页跳转收银台场景。",
      en: "Trusted built-in Alipay web payment plugin for desktop redirect checkout flows.",
    },
    description: {
      zh: "由 NovaPay 核心团队维护，支持商户自有 AppID、RSA2 签名、专属回调路由与统一订单接入。",
      en: "Maintained by the NovaPay core team with merchant-owned AppID credentials, RSA2 signing, dedicated callback routes, and unified order orchestration.",
    },
  },
  callbacks: {
    pathSegment: "alipay",
  },
  adminOption: {
    title: {
      zh: "支付宝网页支付",
      en: "Alipay Web Payment",
    },
    detail: {
      zh: "跳转支付宝收银台，适合桌面端支付流程。",
      en: "Redirects the shopper to the Alipay cashier for desktop payment flows.",
    },
  },
  merchantTemplate: {
    title: {
      zh: "支付宝网页支付",
      en: "Alipay Web Payment",
    },
    description: {
      zh: "商户自己维护 AppID、应用私钥和支付宝公钥，系统为当前通道实例生成专属上游回调地址。",
      en: "Merchants maintain their own AppID, application private key, and Alipay public key. NovaPay generates a dedicated upstream callback URL for each channel instance.",
    },
    requiresMerchantProfileCompletion: true,
    fields: [
      { key: "appId", label: "App ID", required: true, placeholder: "2021000000000000" },
      {
        key: "privateKey",
        label: {
          zh: "应用私钥",
          en: "Application Private Key",
        },
        required: true,
        multiline: true,
        placeholder: "-----BEGIN PRIVATE KEY-----",
      },
      {
        key: "publicKey",
        label: {
          zh: "支付宝公钥",
          en: "Alipay Public Key",
        },
        required: true,
        multiline: true,
        placeholder: "-----BEGIN PUBLIC KEY-----",
      },
    ],
  },
};
