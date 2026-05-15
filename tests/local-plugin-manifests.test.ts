import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { discoverLocalPluginPackageManifests } from "../lib/plugins/local-package-manifests";

async function withTempPluginDir(
  run: (root: string) => Promise<void>,
) {
  const previous = process.env.NOVAPAY_LOCAL_PLUGIN_DIR;
  const root = await mkdtemp(path.join(os.tmpdir(), "novapay-local-plugin-"));

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

test("local plugin manifests are discovered as manifest-only packages", async () => {
  await withTempPluginDir(async (root) => {
    const pluginDir = path.join(root, "wxpay-local");
    await mkdir(pluginDir, { recursive: true });
    await writeFile(
      path.join(pluginDir, "plugin.json"),
      JSON.stringify(
        {
          slug: "local.wxpay-manifest",
          kind: "PAYMENT_CHANNEL",
          channelCode: "wxpay.local",
          providerKey: "wxpay",
          packageName: "@novapay/plugin-wxpay-local",
          displayName: "Local WeChat Manifest",
          vendor: "Local Dev",
          description: "Local manifest-only plugin package.",
          version: "0.1.0",
          capabilities: ["native_qr", "notify_callback"],
          category: {
            zh: "本地插件",
            en: "Local Plugin",
          },
          summary: {
            zh: "本地微信插件清单",
            en: "Local WeChat plugin manifest",
          },
          detail: {
            zh: "当前只接入清单，不执行运行时代码。",
            en: "Currently manifest-only without runtime execution.",
          },
          supportsCallbackRoute: true,
          requiresMerchantProfileCompletion: true,
          manifestVersion: 3,
        },
        null,
        2,
      ),
      "utf8",
    );

    const manifests = await discoverLocalPluginPackageManifests();

    assert.equal(manifests.length, 1);
    assert.equal(manifests[0]?.slug, "local.wxpay-manifest");
    assert.equal(manifests[0]?.source, "LOCAL_PACKAGE");
    assert.equal(manifests[0]?.runnable, false);
    assert.equal(manifests[0]?.manifestVersion, 3);
    assert.equal(
      manifests[0]?.localPath,
      path.join(pluginDir, "plugin.json"),
    );
  });
});

test("local plugin manifest discovery rejects duplicate channel codes", async () => {
  await withTempPluginDir(async (root) => {
    const pluginADir = path.join(root, "plugin-a");
    const pluginBDir = path.join(root, "plugin-b");
    await mkdir(pluginADir, { recursive: true });
    await mkdir(pluginBDir, { recursive: true });

    const createManifest = (slug: string) =>
      JSON.stringify(
        {
          slug,
          kind: "PAYMENT_CHANNEL",
          channelCode: "crypto.local",
          providerKey: "crypto",
          packageName: `@novapay/${slug}`,
          displayName: slug,
          vendor: "Local Dev",
          description: "Duplicate channel code fixture.",
          version: "0.1.0",
          capabilities: ["native_qr"],
          category: {
            zh: "本地插件",
            en: "Local Plugin",
          },
          summary: {
            zh: "重复测试",
            en: "Duplicate test",
          },
          detail: {
            zh: "用于校验重复 channelCode。",
            en: "Used to validate duplicate channel codes.",
          },
        },
        null,
        2,
      );

    await writeFile(path.join(pluginADir, "plugin.json"), createManifest("local.plugin-a"));
    await writeFile(path.join(pluginBDir, "plugin.json"), createManifest("local.plugin-b"));

    await assert.rejects(
      () => discoverLocalPluginPackageManifests(),
      /duplicate channelCode detected: crypto\.local/,
    );
  });
});
