import type {
  PaymentNotification,
  PaymentProvider,
  ProviderAccountConfig,
} from "@/lib/payments/types";
import { formatAmount } from "@/lib/payments/utils";

export const CTF_ALIPAY_MONITOR_CHANNEL_CODE = "ctf.alipay.monitor" as const;
export const CTF_WXPAY_MONITOR_CHANNEL_CODE = "ctf.wxpay.monitor" as const;
export const CTF_BILL_CAPTURE_PROVIDER_KEY = "ctf-bill-capture" as const;

interface CtfBillCaptureChannelDefinition {
  channelCode: typeof CTF_ALIPAY_MONITOR_CHANNEL_CODE | typeof CTF_WXPAY_MONITOR_CHANNEL_CODE;
  displayName: string;
  description: string;
  appScheme: "alipay" | "wechat";
}

const FALLBACK_QR_PREFIX = "novapay-ctf-bill-capture";

function getAccountValue(account: ProviderAccountConfig | null | undefined, keys: string[]) {
  if (!account) {
    return undefined;
  }

  for (const key of keys) {
    const value = account.config[key];

    if (value) {
      return value;
    }
  }

  return undefined;
}

function getQrPayload(account: ProviderAccountConfig | null | undefined, orderId: string) {
  const configured = getAccountValue(account, ["qrPayload", "receivingQrPayload", "qrUrl"]);

  if (configured) {
    return configured;
  }

  // CTF 沙箱兜底二维码:不代表真实收款码,只用于训练端把订单上下文和账单事件串起来。
  return `${FALLBACK_QR_PREFIX}://${orderId}`;
}

function getReceiverLabel(account: ProviderAccountConfig | null | undefined) {
  return getAccountValue(account, ["receiverLabel", "accountAlias", "displayName"]);
}

function getQrImageUrl(account: ProviderAccountConfig | null | undefined) {
  return getAccountValue(account, ["qrImageUrl", "qrImageDataUrl", "receivingQrImageUrl"]);
}

function createPendingNotification(input: {
  orderId: string;
  gatewayOrderId?: string | null;
  amount?: string;
  channelCode: string;
}): PaymentNotification {
  return {
    orderId: input.orderId,
    gatewayOrderId: input.gatewayOrderId ?? null,
    providerStatus: "CTF_WAIT_BILL_CAPTURE",
    amount: input.amount,
    paidAt: null,
    succeeds: false,
    rawPayload: {
      source: "ctf_bill_capture_query",
      channelCode: input.channelCode,
      message: "Waiting for App bill-capture event to be posted into the sandbox.",
    },
  };
}

export function createCtfBillCaptureProvider(
  definition: CtfBillCaptureChannelDefinition,
): PaymentProvider {
  return {
    getSummary() {
      return {
        code: definition.channelCode,
        provider: CTF_BILL_CAPTURE_PROVIDER_KEY,
        displayName: definition.displayName,
        description: definition.description,
        configured: true,
        implementationStatus: "ready",
        capabilities: ["native_qr", "notify_callback", "order_query"],
      };
    },

    isConfigured() {
      // CTF 通道允许只配置采集端点,二维码内容缺省时使用沙箱占位 payload。
      return true;
    },

    async createPayment(input) {
      const qrPayload = getQrPayload(input.account, input.orderId);
      const receiverLabel = getReceiverLabel(input.account);
      const qrImageUrl = getQrImageUrl(input.account);

      return {
        status: "requires_action",
        mode: "qr_code",
        checkoutUrl: qrPayload,
        providerStatus: "CTF_WAIT_BILL_CAPTURE",
        providerPayload: {
          providerDisplayName: definition.displayName,
          channelCode: definition.channelCode,
          appScheme: definition.appScheme,
          receiverLabel: receiverLabel ?? input.account?.displayName ?? null,
          qrPayload,
          qrImageUrl: qrImageUrl ?? null,
          qrHint:
            definition.appScheme === "alipay"
              ? "支付完成后，监听端会自动上报支付宝收款事件。"
              : "支付完成后，监听端会自动上报微信收款事件。",
          expectedAmount: formatAmount(input.amount),
          expectedCurrency: input.currency,
          captureEndpoint: input.notifyUrl ?? null,
        },
      };
    },

    async queryPayment(input) {
      return createPendingNotification({
        orderId: input.orderId,
        gatewayOrderId: input.gatewayOrderId,
        amount: input.amount,
        channelCode: definition.channelCode,
      });
    },
  };
}

export const ctfAlipayBillCaptureProvider = createCtfBillCaptureProvider({
  channelCode: CTF_ALIPAY_MONITOR_CHANNEL_CODE,
  displayName: "支付宝收款监听",
  description:
    "支付宝收款监听通道：平台展示收款码，监听端上报到账事件给 NovaPay 进行订单匹配。",
  appScheme: "alipay",
});

export const ctfWxpayBillCaptureProvider = createCtfBillCaptureProvider({
  channelCode: CTF_WXPAY_MONITOR_CHANNEL_CODE,
  displayName: "微信收款监听",
  description:
    "微信收款监听通道：平台展示收款码，监听端上报到账事件给 NovaPay 进行订单匹配。",
  appScheme: "wechat",
});
