/**
 * GET /registry/plugins/:slug
 *
 * Returns a single plugin record with its published version list.
 * Phase 1: hardcoded demo data. Will be replaced by DB query.
 */

import { NextResponse, type NextRequest } from "next/server";

export const runtime = "nodejs";

interface VersionEntry {
  version: string;
  publishedAt: string;
  checksum: string | null;
  signature: string | null;
}

interface PluginDetail {
  remotePluginId: string;
  slug: string;
  kind: string;
  channelCode: string;
  providerKey: string;
  packageName: string;
  displayName: string;
  vendor: string;
  description: string;
  version: string;
  latestVersion: string;
  runtimeMode: string;
  pricingMode: string;
  priceLabel: string | null;
  purchaseUrl: string | null;
  downloadUrl: string;
  checksum: string | null;
  signature: string | null;
  capabilities: string[];
  metadata: Record<string, unknown>;
}

// Phase 1 demo data
const DEMO_PLUGINS: Record<string, { plugin: PluginDetail; versions: VersionEntry[] }> = {
  "remote.demo-runnable-crypto": {
    plugin: {
      remotePluginId: "remote.demo.crypto",
      slug: "remote.demo-runnable-crypto",
      kind: "PAYMENT_CHANNEL",
      channelCode: "crypto.remote-runnable",
      providerKey: "crypto",
      packageName: "@novapay/remote-demo-runnable",
      displayName: "Remote Demo Runnable Plugin",
      vendor: "NovaPay Remote Demo",
      description: "A remote registry plugin used to validate registry sync and package install.",
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
        summary: { zh: "远程可运行插件示例", en: "Remote runnable plugin example" },
        description: { zh: "用于验证远程插件商店下载并安装到平台本地运行目录的最小示例。", en: "Minimal example used to validate remote plugin download and local installation." },
      },
    },
    versions: [
      { version: "0.1.0", publishedAt: "2025-01-01T00:00:00.000Z", checksum: null, signature: null },
    ],
  },
};

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const entry = DEMO_PLUGINS[slug];

  if (!entry) {
    return NextResponse.json(
      { error: "PLUGIN_NOT_FOUND", message: `No plugin found with slug: ${slug}` },
      { status: 404 },
    );
  }

  return NextResponse.json({
    plugin: entry.plugin,
    versions: entry.versions,
  });
}
