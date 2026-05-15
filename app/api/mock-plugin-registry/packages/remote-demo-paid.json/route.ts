import { NextResponse } from "next/server";
import { mockRegistryProductionGuard } from "../../_guard";

export const runtime = "nodejs";

export async function GET() {
  const guard = mockRegistryProductionGuard();
  if (guard) return guard;

  return NextResponse.json({
    manifest: {
      slug: "remote.demo-paid-crypto",
      kind: "PAYMENT_CHANNEL",
      channelCode: "crypto.remote-paid",
      providerKey: "crypto",
      packageName: "@novapay/remote-demo-paid",
      displayName: "Remote Demo Paid Plugin",
      vendor: "NovaPay Remote Demo",
      description: "A mock paid remote plugin package with a runnable runtime entrypoint.",
      version: "0.1.0",
      capabilities: ["native_qr", "return_url", "order_close"],
      category: {
        zh: "远程插件",
        en: "Remote Plugin",
      },
      summary: {
        zh: "远程收费插件示例",
        en: "Remote paid plugin example",
      },
      detail: {
        zh: "用于验证收费远程插件在购买后才能下载并安装的最小示例。",
        en: "Minimal example used to validate that a paid remote plugin can only be downloaded and installed after purchase.",
      },
      runtimeEntrypoint: "./runtime.js",
      supportsCallbackRoute: false,
      requiresMerchantProfileCompletion: false,
      manifestVersion: 1,
    },
    files: [
      {
        path: "runtime.js",
        content: `export const pluginRuntime = {
  provider: {
    getSummary() {
      return {
        code: "crypto.remote-paid",
        provider: "crypto",
        displayName: "Remote Demo Paid Plugin",
        description: "Remote paid runnable provider.",
        configured: false,
        implementationStatus: "ready",
        capabilities: ["native_qr", "return_url", "order_close"],
      };
    },
    isConfigured(account) {
      return Boolean(account?.config?.walletAddress);
    },
    async createPayment(input) {
      const receivingAddress = input.account?.config?.walletAddress ?? "remote-paid-address";
      return {
        status: "requires_action",
        mode: "qr_code",
        checkoutUrl: receivingAddress,
        providerStatus: "AWAITING_TRANSFER",
        providerPayload: {
          networkLabel: "Remote Paid",
          receivingAddress,
          qrPayload: receivingAddress,
          quotedCnyAmount: input.amount,
        },
      };
    },
    async closePayment(input) {
      return {
        orderId: input.orderId,
        gatewayOrderId: input.gatewayOrderId ?? null,
        providerStatus: "CLOSED",
        amount: input.amount,
        paidAt: null,
        succeeds: false,
        rawPayload: {
          action: "close",
          provider: "remote-demo-paid",
        },
      };
    },
  },
  adminOption: {
    title: {
      zh: "远程收费插件示例",
      en: "Remote Demo Paid Plugin",
    },
    detail: {
      zh: "通过 mock 远程商店安装的收费可运行示例插件。",
      en: "Paid runnable example plugin installed through the mock remote registry.",
    },
  },
  merchantTemplate: {
    title: {
      zh: "远程收费插件示例",
      en: "Remote Demo Paid Plugin",
    },
    description: {
      zh: "填写示例收款地址即可完成最小配置。",
      en: "Provide a demo receiving address to complete basic configuration.",
    },
    fields: [
      {
        key: "walletAddress",
        label: {
          zh: "示例收款地址",
          en: "Demo Receiving Address",
        },
        required: true,
        placeholder: {
          zh: "remote-paid-address",
          en: "remote-paid-address",
        },
      },
    ],
  },
};`,
      },
    ],
  });
}
