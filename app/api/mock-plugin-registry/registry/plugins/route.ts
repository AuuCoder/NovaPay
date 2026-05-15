import { NextResponse } from "next/server";
import { mockRegistryProductionGuard } from "../../_guard";

export const runtime = "nodejs";

export async function GET() {
  const guard = mockRegistryProductionGuard();
  if (guard) return guard;

  return NextResponse.json({
    plugins: [
      {
        remotePluginId: "remote.demo.crypto",
        slug: "remote.demo-runnable-crypto",
        kind: "PAYMENT_CHANNEL",
        channelCode: "crypto.remote-runnable",
        providerKey: "crypto",
        packageName: "@novapay/remote-demo-runnable",
        displayName: "Remote Demo Runnable Plugin",
        vendor: "NovaPay Remote Demo",
        description:
          "A mock remote registry plugin used to validate registry sync and package install.",
        version: "0.1.0",
        latestVersion: "0.1.0",
        runtimeMode: "RUNNABLE",
        pricingMode: "FREE",
        priceLabel: "Free",
        purchaseUrl: null,
        downloadUrl: "http://localhost:3000/api/mock-plugin-registry/packages/remote-demo-runnable.json",
        checksum: null,
        signature: null,
        capabilities: ["native_qr", "return_url", "order_close"],
        metadata: {
          category: {
            zh: "远程插件",
            en: "Remote Plugin",
          },
          summary: {
            zh: "用于验证远程插件商店同步与安装流程的示例插件。",
            en: "Example plugin used to validate remote registry sync and install flows.",
          },
          description: {
            zh: "该插件通过 mock 远程商店暴露，用于验证目录同步、插件包下载和平台安装。",
            en: "Exposed through the mock registry to validate directory sync, package download, and platform installation.",
          },
        },
      },
      {
        remotePluginId: "remote.demo.paid.crypto",
        slug: "remote.demo-paid-crypto",
        kind: "PAYMENT_CHANNEL",
        channelCode: "crypto.remote-paid",
        providerKey: "crypto",
        packageName: "@novapay/remote-demo-paid",
        displayName: "Remote Demo Paid Plugin",
        vendor: "NovaPay Remote Demo",
        description:
          "A mock paid remote registry plugin used to validate paid plugin purchase and install flows.",
        version: "0.1.0",
        latestVersion: "0.1.0",
        runtimeMode: "RUNNABLE",
        pricingMode: "PAID",
        priceLabel: "¥99 / license",
        purchaseUrl: "https://example.com/checkout/remote-demo-paid",
        downloadUrl: "http://localhost:3000/api/mock-plugin-registry/packages/remote-demo-paid.json",
        checksum: null,
        signature: null,
        capabilities: ["native_qr", "return_url", "order_close"],
        metadata: {
          category: {
            zh: "远程插件",
            en: "Remote Plugin",
          },
          summary: {
            zh: "用于验证收费插件购买与安装流程的示例插件。",
            en: "Example plugin used to validate paid-plugin purchase and install flows.",
          },
          description: {
            zh: "该插件通过 mock 远程商店暴露，用于验证收费插件在未购/已购状态下的后台行为。",
            en: "Exposed through the mock registry to validate admin-side behavior for paid plugins before and after purchase.",
          },
        },
      },
    ],
  });
}
