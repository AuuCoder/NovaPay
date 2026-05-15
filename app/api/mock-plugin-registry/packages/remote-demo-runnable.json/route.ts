import { NextResponse } from "next/server";
import { mockRegistryProductionGuard } from "../../_guard";

export const runtime = "nodejs";

export async function GET() {
  const guard = mockRegistryProductionGuard();
  if (guard) return guard;

  return NextResponse.json({
    manifest: {
      slug: "remote.demo-runnable-crypto",
      kind: "PAYMENT_CHANNEL",
      channelCode: "crypto.remote-runnable",
      providerKey: "crypto",
      packageName: "@novapay/remote-demo-runnable",
      displayName: "Remote Demo Runnable Plugin",
      vendor: "NovaPay Remote Demo",
      description:
        "A mock remote plugin package with a runnable runtime entrypoint.",
      version: "0.1.0",
      capabilities: ["native_qr", "return_url", "order_close"],
      category: {
        zh: "远程插件",
        en: "Remote Plugin",
      },
      summary: {
        zh: "远程可运行插件示例",
        en: "Remote runnable plugin example",
      },
      detail: {
        zh: "用于验证远程插件商店下载并安装到平台本地运行目录的最小示例。",
        en: "Minimal example used to validate remote plugin download and local installation.",
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
        code: "crypto.remote-runnable",
        provider: "crypto",
        displayName: "Remote Demo Runnable Plugin",
        description: "Remote demo runnable provider.",
        configured: false,
        implementationStatus: "ready",
        capabilities: ["native_qr", "return_url", "order_close"],
      };
    },
    isConfigured(account) {
      return Boolean(account?.config?.walletAddress);
    },
    async createPayment(input) {
      const receivingAddress = input.account?.config?.walletAddress ?? "remote-demo-address";
      return {
        status: "requires_action",
        mode: "qr_code",
        checkoutUrl: receivingAddress,
        providerStatus: "AWAITING_TRANSFER",
        providerPayload: {
          networkLabel: "Remote Demo",
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
          provider: "remote-demo-runnable",
        },
      };
    },
  },
  adminOption: {
    title: {
      zh: "远程示例可运行插件",
      en: "Remote Demo Runnable Plugin",
    },
    detail: {
      zh: "通过 mock 远程商店安装的可运行示例插件。",
      en: "Runnable example plugin installed through the mock remote registry.",
    },
  },
  merchantTemplate: {
    title: {
      zh: "远程示例可运行插件",
      en: "Remote Demo Runnable Plugin",
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
          zh: "remote-demo-address",
          en: "remote-demo-address",
        },
      },
    ],
  },
};`,
      },
    ],
  });
}
