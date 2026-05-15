/**
 * GET /registry/plugins
 *
 * Returns the plugin catalog in a format byte-compatible with the NovaPay
 * mock registry (`app/api/mock-plugin-registry/registry/plugins/route.ts`).
 * New fields are placed exclusively under `metadata.*` to preserve backward
 * compatibility with `parseRemotePluginRecord` (Req 23.1, 25.2).
 *
 * Phase 1: returns a hardcoded demo catalog. Once the Prisma-backed
 * PluginRecord store is wired, this will query the database.
 */

import { NextResponse } from "next/server";

export const runtime = "nodejs";

// Phase 1 placeholder catalog — mirrors the mock registry shape exactly.
// Will be replaced by a database query in a follow-up task.
function getPluginCatalog() {
  return [
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
        "A remote registry plugin used to validate registry sync and package install.",
      version: "0.1.0",
      latestVersion: "0.1.0",
      runtimeMode: "RUNNABLE",
      pricingMode: "FREE",
      priceLabel: "Free",
      purchaseUrl: null,
      downloadUrl: "/api/registry/packages/remote.demo-runnable-crypto/0.1.0",
      checksum: null,
      signature: null,
      capabilities: ["native_qr", "return_url", "order_close"],
      metadata: {
        category: { zh: "远程插件", en: "Remote Plugin" },
        summary: {
          zh: "用于验证远程插件商店同步与安装流程的示例插件。",
          en: "Example plugin used to validate remote registry sync and install flows.",
        },
        description: {
          zh: "该插件通过远程商店暴露，用于验证目录同步、插件包下载和平台安装。",
          en: "Exposed through the remote registry to validate directory sync, package download, and platform installation.",
        },
      },
    },
  ];
}

export async function GET() {
  const plugins = getPluginCatalog();

  return NextResponse.json({ plugins }, {
    headers: {
      "Cache-Control": "public, max-age=60, s-maxage=60",
    },
  });
}
