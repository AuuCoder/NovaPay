import {
  ctfAlipayBillCaptureProvider,
  ctfWxpayBillCaptureProvider,
  CTF_ALIPAY_MONITOR_CHANNEL_CODE,
  CTF_BILL_CAPTURE_PROVIDER_KEY,
  CTF_WXPAY_MONITOR_CHANNEL_CODE,
} from "@/lib/payments/providers/ctf-bill-capture";
import type { PaymentPluginDefinition } from "@/lib/payments/plugins/types";

const commonFields: PaymentPluginDefinition["merchantTemplate"]["fields"] = [
  {
    key: "qrPayload",
    label: {
      zh: "收款码内容 / URL",
      en: "Receiving QR payload / URL",
    },
    placeholder: "https://qr.example.test/ctf-receive or alipayqr://...",
    multiline: true,
  },
  {
    key: "qrImageUrl",
    label: {
      zh: "收款码图片 URL / Data URL",
      en: "Receiving QR image URL / Data URL",
    },
    placeholder: "https://cdn.example.test/alipay-qr.png or data:image/png;base64,...",
    multiline: true,
  },
  {
    key: "receiverLabel",
    label: {
      zh: "收款账户标识",
      en: "Receiver label",
    },
    placeholder: "支付宝个人收款号A",
  },
  {
    key: "collectorSecret",
    label: {
      zh: "采集端密钥",
      en: "Collector secret",
    },
    required: true,
    placeholder: "Hook/抓包训练端在 x-ctf-capture-secret 中携带",
  },
  {
    key: "sourceHint",
    label: {
      zh: "采集来源标记（可选）",
      en: "Capture source hint (optional)",
    },
    placeholder: "frida-alipay-lab / mitm-wechat-lab",
  },
];

export const ctfAlipayBillCapturePlugin: PaymentPluginDefinition = {
  channelCode: CTF_ALIPAY_MONITOR_CHANNEL_CODE,
  providerKey: CTF_BILL_CAPTURE_PROVIDER_KEY,
  provider: ctfAlipayBillCaptureProvider,
  marketplace: {
    slug: "novapay.alipay-bill-capture",
    packageName: "@novapay/plugin-alipay-bill-capture",
    vendor: "NovaPay Official",
    version: "1.0.1",
    category: {
      zh: "监听收款",
      en: "Receipt Listener",
    },
    summary: {
      zh: "支付宝收款监听通道，适用于个人收款码到账通知自动上报场景。",
      en: "Alipay receipt listener channel for automatic bill posting from personal collection notifications.",
    },
    description: {
      zh: "平台展示商户支付宝收款码，并接收监听端从支付宝通知或账单流程提取的收款事件，再按金额与时间窗匹配订单。",
      en: "Shows the merchant Alipay collection QR, accepts receipt events captured from app notifications or bill flows, and reconciles orders by amount and time window.",
    },
  },
  callbacks: {
    pathSegment: "ctf-bill-capture",
  },
  adminOption: {
    title: {
      zh: "支付宝收款监听",
      en: "Alipay Receipt Listener",
    },
    detail: {
      zh: "由监听端上报支付宝收款事件，平台自动匹配订单。",
      en: "Listener posts Alipay receipt events and NovaPay matches orders automatically.",
    },
  },
  merchantTemplate: {
    title: {
      zh: "支付宝收款监听",
      en: "Alipay Receipt Listener",
    },
    description: {
      zh: "配置支付宝收款码和必填的监听端密钥。通道实例会生成专属账单上报 URL，供通知监听端投递收款事件。",
      en: "Configure the Alipay collection QR and required listener secret. The channel instance exposes a dedicated bill ingest URL for receipt listener agents.",
    },
    requiresMerchantProfileCompletion: false,
    fields: commonFields,
  },
};

export const ctfWxpayBillCapturePlugin: PaymentPluginDefinition = {
  channelCode: CTF_WXPAY_MONITOR_CHANNEL_CODE,
  providerKey: CTF_BILL_CAPTURE_PROVIDER_KEY,
  provider: ctfWxpayBillCaptureProvider,
  marketplace: {
    slug: "novapay.wxpay-bill-capture",
    packageName: "@novapay/plugin-wxpay-bill-capture",
    vendor: "NovaPay Official",
    version: "1.0.1",
    category: {
      zh: "监听收款",
      en: "Receipt Listener",
    },
    summary: {
      zh: "微信收款监听通道，适用于个人收款码到账通知自动上报场景。",
      en: "WeChat receipt listener channel for automatic bill posting from personal collection notifications.",
    },
    description: {
      zh: "平台展示商户微信收款码，并接收监听端从微信通知或账单流程提取的收款事件，再按金额与时间窗匹配订单。",
      en: "Shows the merchant WeChat collection QR, accepts receipt events captured from app notifications or bill flows, and reconciles orders by amount and time window.",
    },
  },
  callbacks: {
    pathSegment: "ctf-bill-capture",
  },
  adminOption: {
    title: {
      zh: "微信收款监听",
      en: "WeChat Receipt Listener",
    },
    detail: {
      zh: "由监听端上报微信收款事件，平台自动匹配订单。",
      en: "Listener posts WeChat receipt events and NovaPay matches orders automatically.",
    },
  },
  merchantTemplate: {
    title: {
      zh: "微信收款监听",
      en: "WeChat Receipt Listener",
    },
    description: {
      zh: "配置微信收款码和必填的监听端密钥。通道实例会生成专属账单上报 URL，供通知监听端投递收款事件。",
      en: "Configure the WeChat collection QR and required listener secret. The channel instance exposes a dedicated bill ingest URL for receipt listener agents.",
    },
    requiresMerchantProfileCompletion: false,
    fields: commonFields,
  },
};
