import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { discoverLocalPluginPackageManifests } from "../lib/plugins/local-package-manifests";
import { loadLocalPaymentPluginRuntimeInspection } from "../lib/plugins/local-package-runtimes";

async function withTempPluginDir(
  run: (root: string) => Promise<void>,
) {
  const previous = process.env.NOVAPAY_LOCAL_PLUGIN_DIR;
  const root = await mkdtemp(path.join(os.tmpdir(), "novapay-local-runtime-"));

  try {
    process.env.NOVAPAY_LOCAL_PLUGIN_DIR = root;
    await run(root);
  } finally {
    if (previous === undefined) {
      delete process.env.NOVAPAY_LOCAL_PLUGIN_DIR;
    } else {
      process.env.NOVAPAY_LOCAL_PLUGIN_DIR = previous;
    }

    await rm(root, { recursive: true, force: true });
  }
}

test("local plugin runtime inspection marks ready adapters as runnable", async () => {
  await withTempPluginDir(async (root) => {
    const pluginDir = path.join(root, "ready-plugin");
    await mkdir(pluginDir, { recursive: true });
    await writeFile(
      path.join(pluginDir, "plugin.json"),
      JSON.stringify(
        {
          slug: "local.ready-plugin",
          kind: "PAYMENT_CHANNEL",
          channelCode: "crypto.ready-plugin",
          providerKey: "crypto",
          packageName: "@novapay/local-ready-plugin",
          displayName: "Ready Plugin",
          vendor: "Local Dev",
          description: "Ready runtime plugin.",
          version: "0.1.0",
          capabilities: ["native_qr"],
          category: { zh: "本地插件", en: "Local Plugin" },
          summary: { zh: "摘要", en: "Summary" },
          detail: { zh: "详情", en: "Detail" },
          runtimeEntrypoint: "./runtime.js",
          supportsCallbackRoute: false,
          requiresMerchantProfileCompletion: false,
          manifestVersion: 1,
        },
        null,
        2,
      ),
      "utf8",
    );
    await writeFile(
      path.join(pluginDir, "runtime.js"),
      `export const pluginRuntime = {
        provider: {
          getSummary() {
            return {
              code: "crypto.ready-plugin",
              provider: "crypto",
              displayName: "Ready Plugin",
              description: "Ready runtime plugin.",
              configured: false,
              implementationStatus: "ready",
              capabilities: ["native_qr"],
            };
          },
          isConfigured() { return true; },
          async createPayment() {
            return {
              status: "requires_action",
              mode: "qr_code",
              checkoutUrl: "demo",
              providerPayload: {}
            };
          }
        },
        adminOption: {
          title: { zh: "管理标题", en: "Admin Title" },
          detail: { zh: "管理说明", en: "Admin Detail" }
        },
        merchantTemplate: {
          title: { zh: "商户标题", en: "Merchant Title" },
          description: { zh: "商户说明", en: "Merchant Description" },
          fields: []
        }
      };`,
      "utf8",
    );

    const manifests = await discoverLocalPluginPackageManifests();
    const inspection = await loadLocalPaymentPluginRuntimeInspection(manifests[0]!);

    assert.equal(inspection.runnable, true);
    assert.equal(inspection.loadError, null);
    assert.equal(inspection.definition?.channelCode, "crypto.ready-plugin");
  });
});

test("local plugin runtime inspection keeps skeleton adapters non-runnable", async () => {
  await withTempPluginDir(async (root) => {
    const pluginDir = path.join(root, "skeleton-plugin");
    await mkdir(pluginDir, { recursive: true });
    await writeFile(
      path.join(pluginDir, "plugin.json"),
      JSON.stringify(
        {
          slug: "local.skeleton-plugin",
          kind: "PAYMENT_CHANNEL",
          channelCode: "crypto.skeleton-plugin",
          providerKey: "crypto",
          packageName: "@novapay/local-skeleton-plugin",
          displayName: "Skeleton Plugin",
          vendor: "Local Dev",
          description: "Skeleton runtime plugin.",
          version: "0.1.0",
          capabilities: ["native_qr"],
          category: { zh: "本地插件", en: "Local Plugin" },
          summary: { zh: "摘要", en: "Summary" },
          detail: { zh: "详情", en: "Detail" },
          runtimeEntrypoint: "./runtime.js",
          supportsCallbackRoute: false,
          requiresMerchantProfileCompletion: false,
          manifestVersion: 1,
        },
        null,
        2,
      ),
      "utf8",
    );
    await writeFile(
      path.join(pluginDir, "runtime.js"),
      `export const pluginRuntime = {
        provider: {
          getSummary() {
            return {
              code: "crypto.skeleton-plugin",
              provider: "crypto",
              displayName: "Skeleton Plugin",
              description: "Skeleton runtime plugin.",
              configured: false,
              implementationStatus: "skeleton",
              capabilities: ["native_qr"],
            };
          },
          isConfigured() { return false; },
          async createPayment() {
            throw new Error("not ready");
          }
        },
        adminOption: {
          title: { zh: "管理标题", en: "Admin Title" },
          detail: { zh: "管理说明", en: "Admin Detail" }
        },
        merchantTemplate: {
          title: { zh: "商户标题", en: "Merchant Title" },
          description: { zh: "商户说明", en: "Merchant Description" },
          fields: []
        }
      };`,
      "utf8",
    );

    const manifests = await discoverLocalPluginPackageManifests();
    const inspection = await loadLocalPaymentPluginRuntimeInspection(manifests[0]!);

    assert.equal(inspection.runnable, false);
    assert.match(inspection.loadError ?? "", /implementationStatus is not ready/);
    assert.equal(inspection.definition?.channelCode, "crypto.skeleton-plugin");
  });
});
