import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { loadPaymentPluginRuntimeInspectionFromManifestPath } from "../lib/plugins/local-package-runtimes";

test("official remote catalog entries use the built-in runtime without importing bundle code", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "novapay-official-runtime-"));
  const manifestPath = path.join(directory, "plugin.json");

  await writeFile(
    manifestPath,
    JSON.stringify({
      slug: "novapay.alipay-page",
      kind: "PAYMENT_CHANNEL",
      channelCode: "alipay.page",
      providerKey: "alipay",
      packageName: "@novapay/plugin-alipay-page",
      displayName: "Alipay",
      vendor: "NovaPay Core",
      description: "Official catalog metadata",
      version: "1.0.0",
      capabilities: ["page_redirect"],
      category: { zh: "official", en: "official" },
      summary: { zh: "summary", en: "summary" },
      detail: { zh: "detail", en: "detail" },
      runtimeEntrypoint: "./runtime-that-does-not-exist.js",
      supportsCallbackRoute: true,
      requiresMerchantProfileCompletion: true,
      manifestVersion: 1,
    }),
    "utf8",
  );

  try {
    const result = await loadPaymentPluginRuntimeInspectionFromManifestPath(
      manifestPath,
      "REMOTE_SIGNED",
    );

    assert.equal(result.inspection.runnable, true);
    assert.equal(result.inspection.definition?.marketplace.slug, "novapay.alipay-page");
    assert.equal(result.inspection.definition?.provider.getSummary().code, "alipay.page");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
