import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  parsePluginPackageManifest,
  type PluginPackageManifest,
} from "../../lib/manifest/parse";

/**
 * Factory for a fully-valid raw plugin.json structure. Tests mutate a deep
 * clone (via JSON parse/stringify) so individual cases stay isolated.
 */
function buildValidRaw(): Record<string, unknown> {
  return {
    manifestVersion: 1,
    slug: "remote.demo-runnable-crypto",
    kind: "PAYMENT_CHANNEL",
    channelCode: "crypto.remote-runnable",
    providerKey: "crypto",
    packageName: "@novapay/remote-demo-runnable",
    displayName: "Remote Demo Runnable Plugin",
    vendor: "NovaPay Remote Demo",
    description: "A demo plugin used to validate the remote pipeline.",
    version: "0.1.0",
    capabilities: ["native_qr", "return_url", "order_close"],
    category: { zh: "加密货币", en: "Crypto" },
    summary: { zh: "演示远程加密插件", en: "Remote crypto demo" },
    detail: { zh: "用于验证远程签名插件的端到端流程。", en: "End-to-end remote demo." },
    supportsCallbackRoute: true,
    requiresMerchantProfileCompletion: false,
    runtimeEntrypoint: "dist/runtime.mjs",
  };
}

function clone(raw: Record<string, unknown>): Record<string, unknown> {
  return JSON.parse(JSON.stringify(raw)) as Record<string, unknown>;
}

describe("parsePluginPackageManifest", () => {
  it("parses a fully-populated manifest (happy path)", () => {
    const raw = buildValidRaw();
    const manifest = parsePluginPackageManifest(raw);

    assert.equal(manifest.slug, "remote.demo-runnable-crypto");
    assert.equal(manifest.kind, "PAYMENT_CHANNEL");
    assert.equal(manifest.channelCode, "crypto.remote-runnable");
    assert.equal(manifest.providerKey, "crypto");
    assert.equal(manifest.packageName, "@novapay/remote-demo-runnable");
    assert.equal(manifest.displayName, "Remote Demo Runnable Plugin");
    assert.equal(manifest.vendor, "NovaPay Remote Demo");
    assert.equal(manifest.version, "0.1.0");
    assert.equal(manifest.manifestVersion, 1);
    assert.equal(manifest.supportsCallbackRoute, true);
    assert.equal(manifest.requiresMerchantProfileCompletion, false);
    assert.equal(manifest.runtimeEntrypoint, "dist/runtime.mjs");
    assert.deepEqual(manifest.capabilities, [
      "native_qr",
      "return_url",
      "order_close",
    ]);
    assert.deepEqual(manifest.category, { zh: "加密货币", en: "Crypto" });
    assert.deepEqual(manifest.summary, {
      zh: "演示远程加密插件",
      en: "Remote crypto demo",
    });
    assert.deepEqual(manifest.detail, {
      zh: "用于验证远程签名插件的端到端流程。",
      en: "End-to-end remote demo.",
    });
    // Default source applied when caller omits options.
    assert.equal(manifest.source, "REMOTE_SIGNED");
  });

  it("defaults manifestVersion to 1 when missing", () => {
    const raw = clone(buildValidRaw());
    delete raw.manifestVersion;

    const manifest = parsePluginPackageManifest(raw);
    assert.equal(manifest.manifestVersion, 1);
  });

  it("defaults manifestVersion to 1 when not an integer", () => {
    const raw = clone(buildValidRaw());
    raw.manifestVersion = 1.5;

    const manifest = parsePluginPackageManifest(raw);
    assert.equal(manifest.manifestVersion, 1);
  });

  it("defaults supportsCallbackRoute and requiresMerchantProfileCompletion to false when missing", () => {
    const raw = clone(buildValidRaw());
    delete raw.supportsCallbackRoute;
    delete raw.requiresMerchantProfileCompletion;

    const manifest = parsePluginPackageManifest(raw);
    assert.equal(manifest.supportsCallbackRoute, false);
    assert.equal(manifest.requiresMerchantProfileCompletion, false);
  });

  it("treats runtimeEntrypoint as optional and normalises blank strings to null", () => {
    const raw = clone(buildValidRaw());
    delete raw.runtimeEntrypoint;
    const omitted = parsePluginPackageManifest(raw);
    assert.equal(omitted.runtimeEntrypoint, null);

    const blank = clone(buildValidRaw());
    blank.runtimeEntrypoint = "   ";
    const blankParsed = parsePluginPackageManifest(blank);
    assert.equal(blankParsed.runtimeEntrypoint, null);
  });

  it("rejects non-object root payloads", () => {
    assert.throws(
      () => parsePluginPackageManifest(null),
      /Manifest root must be an object\./,
    );
    assert.throws(
      () => parsePluginPackageManifest([]),
      /Manifest root must be an object\./,
    );
    assert.throws(
      () => parsePluginPackageManifest("plugin"),
      /Manifest root must be an object\./,
    );
  });

  it("rejects manifests missing required fields", () => {
    const requiredScalarFields = [
      "slug",
      "channelCode",
      "packageName",
      "displayName",
      "vendor",
      "description",
      "version",
    ] as const;

    for (const field of requiredScalarFields) {
      const raw = clone(buildValidRaw());
      delete raw[field];

      assert.throws(
        () => parsePluginPackageManifest(raw),
        new RegExp(`${field} must be a non-empty string\\.`),
        `Expected missing-field error for ${field}`,
      );
    }
  });

  it("rejects unsupported kind values", () => {
    const raw = clone(buildValidRaw());
    raw.kind = "MERCHANT_GATEWAY";

    assert.throws(
      () => parsePluginPackageManifest(raw),
      /Unsupported kind: MERCHANT_GATEWAY/,
    );
  });

  it("rejects providerKey values outside the whitelist", () => {
    const raw = clone(buildValidRaw());
    raw.providerKey = "stripe";

    assert.throws(
      () => parsePluginPackageManifest(raw),
      /Unsupported providerKey: stripe/,
    );
  });

  it("rejects capabilities outside the whitelist", () => {
    const raw = clone(buildValidRaw());
    raw.capabilities = ["native_qr", "telepathy"];

    assert.throws(
      () => parsePluginPackageManifest(raw),
      /Unsupported capability: telepathy/,
    );
  });

  it("rejects empty or non-array capabilities", () => {
    const empty = clone(buildValidRaw());
    empty.capabilities = [];
    assert.throws(
      () => parsePluginPackageManifest(empty),
      /capabilities must be a non-empty array\./,
    );

    const notArray = clone(buildValidRaw());
    notArray.capabilities = "native_qr";
    assert.throws(
      () => parsePluginPackageManifest(notArray),
      /capabilities must be a non-empty array\./,
    );
  });

  it("rejects bilingual fields missing zh or en", () => {
    const missingCategoryEn = clone(buildValidRaw());
    (missingCategoryEn.category as Record<string, unknown>).en = "";
    assert.throws(
      () => parsePluginPackageManifest(missingCategoryEn),
      /category\.en must be a non-empty string\./,
    );

    const missingSummary = clone(buildValidRaw());
    delete missingSummary.summary;
    assert.throws(
      () => parsePluginPackageManifest(missingSummary),
      /summary must contain zh and en fields\./,
    );

    const detailZhMissing = clone(buildValidRaw());
    (detailZhMissing.detail as Record<string, unknown>).zh = "   ";
    assert.throws(
      () => parsePluginPackageManifest(detailZhMissing),
      /detail\.zh must be a non-empty string\./,
    );
  });

  it("respects explicit source override and stores raw JSON when provided", () => {
    const raw = buildValidRaw();
    const rawJson = JSON.stringify(raw);

    const manifest: PluginPackageManifest = parsePluginPackageManifest(raw, {
      source: "LOCAL_PACKAGE",
      rawJson,
    });

    assert.equal(manifest.source, "LOCAL_PACKAGE");
    assert.equal(manifest.rawJson, rawJson);
  });
});
