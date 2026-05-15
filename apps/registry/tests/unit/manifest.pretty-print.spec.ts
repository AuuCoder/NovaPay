import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  parsePluginPackageManifest,
  type PluginPackageManifest,
} from "../../lib/manifest/parse";
import { prettyPrintPluginPackageManifest } from "../../lib/manifest/pretty-print";

function buildRawWithRuntimeEntrypoint(): Record<string, unknown> {
  return {
    manifestVersion: 1,
    slug: "remote.demo-runnable-crypto",
    kind: "PAYMENT_CHANNEL",
    channelCode: "crypto.remote-runnable",
    providerKey: "crypto",
    packageName: "@novapay/remote-demo-runnable",
    displayName: "Remote Demo Runnable Plugin",
    vendor: "NovaPay Remote Demo",
    description: "Remote signed runnable plugin used for end-to-end demos.",
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

function buildRawWithoutRuntimeEntrypoint(): Record<string, unknown> {
  const raw = buildRawWithRuntimeEntrypoint();
  delete raw.runtimeEntrypoint;
  raw.slug = "remote.demo-paid-crypto";
  raw.channelCode = "crypto.remote-paid";
  raw.packageName = "@novapay/remote-demo-paid";
  raw.displayName = "Remote Demo Paid Plugin";
  return raw;
}

/**
 * Compare two parsed manifests ignoring the internal-only fields
 * (`source`, `rawJson`) per the round-trip contract documented in parse.ts.
 */
function expectStructurallyEqualIgnoringInternals(
  left: PluginPackageManifest,
  right: PluginPackageManifest,
): void {
  const stripInternals = (manifest: PluginPackageManifest) => {
    const { source: _source, rawJson: _rawJson, ...rest } = manifest;
    return rest;
  };

  assert.deepEqual(stripInternals(left), stripInternals(right));
}

describe("prettyPrintPluginPackageManifest", () => {
  it("performs lossless round-trip parse → print → parse", () => {
    const raw = buildRawWithRuntimeEntrypoint();
    const first = parsePluginPackageManifest(raw);
    const printed = prettyPrintPluginPackageManifest(first);
    const second = parsePluginPackageManifest(JSON.parse(printed));

    expectStructurallyEqualIgnoringInternals(first, second);
  });

  it("performs lossless round-trip when runtimeEntrypoint is null", () => {
    const raw = buildRawWithoutRuntimeEntrypoint();
    const first = parsePluginPackageManifest(raw);
    assert.equal(first.runtimeEntrypoint, null);

    const printed = prettyPrintPluginPackageManifest(first);
    // runtimeEntrypoint must be omitted entirely when null.
    assert.ok(!printed.includes("runtimeEntrypoint"));

    const second = parsePluginPackageManifest(JSON.parse(printed));
    expectStructurallyEqualIgnoringInternals(first, second);
    assert.equal(second.runtimeEntrypoint, null);
  });

  it("emits keys in the canonical fixed order", () => {
    const raw = buildRawWithRuntimeEntrypoint();
    const manifest = parsePluginPackageManifest(raw);
    const printed = prettyPrintPluginPackageManifest(manifest);
    const parsed = JSON.parse(printed) as Record<string, unknown>;

    assert.deepEqual(Object.keys(parsed), [
      "manifestVersion",
      "slug",
      "kind",
      "channelCode",
      "providerKey",
      "packageName",
      "displayName",
      "vendor",
      "description",
      "version",
      "capabilities",
      "category",
      "summary",
      "detail",
      "supportsCallbackRoute",
      "requiresMerchantProfileCompletion",
      "runtimeEntrypoint",
    ]);
  });

  it("indents with two spaces by default and ends with a trailing newline", () => {
    const raw = buildRawWithRuntimeEntrypoint();
    const manifest = parsePluginPackageManifest(raw);
    const printed = prettyPrintPluginPackageManifest(manifest);

    // Trailing newline is part of the contract.
    assert.ok(printed.endsWith("\n"));

    // Inspect a line that should be indented with exactly two spaces.
    const lines = printed.split("\n");
    const slugLine = lines.find((line) => line.includes("\"slug\":"));
    assert.ok(slugLine, "slug line must be present");
    assert.match(slugLine!, /^ {2}"slug": /);
  });

  it("honours the indent override option", () => {
    const raw = buildRawWithRuntimeEntrypoint();
    const manifest = parsePluginPackageManifest(raw);
    const printed = prettyPrintPluginPackageManifest(manifest, { indent: 4 });

    const lines = printed.split("\n");
    const slugLine = lines.find((line) => line.includes("\"slug\":"));
    assert.ok(slugLine, "slug line must be present");
    assert.match(slugLine!, /^ {4}"slug": /);
  });

  it("never emits source or rawJson", () => {
    const raw = buildRawWithRuntimeEntrypoint();
    const rawJson = JSON.stringify(raw);
    const manifest = parsePluginPackageManifest(raw, {
      source: "LOCAL_PACKAGE",
      rawJson,
    });

    const printed = prettyPrintPluginPackageManifest(manifest);
    assert.ok(!printed.includes("\"source\""));
    assert.ok(!printed.includes("\"rawJson\""));
  });

  it("produces byte-identical output across repeated invocations", () => {
    const raw = buildRawWithRuntimeEntrypoint();
    const manifest = parsePluginPackageManifest(raw);

    const first = prettyPrintPluginPackageManifest(manifest);
    const second = prettyPrintPluginPackageManifest(manifest);
    assert.equal(first, second);
  });
});
