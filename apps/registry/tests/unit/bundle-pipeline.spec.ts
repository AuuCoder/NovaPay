import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createHash, generateKeyPairSync, verify as cryptoVerify } from "node:crypto";

import { runBundlePipeline } from "../../lib/bundle/pipeline";
import { createInMemoryObjectStore } from "../../lib/storage/object-store";
import { createInMemorySigningKeyStore } from "../../lib/signing/key-store";
import { createLocalEd25519Signer } from "../../lib/signing/signer";

function buildJsonBundle() {
  return JSON.stringify({
    manifest: {
      manifestVersion: 1,
      slug: "remote.test-plugin",
      kind: "PAYMENT_CHANNEL",
      channelCode: "crypto.test",
      providerKey: "crypto",
      packageName: "@novapay/test-plugin",
      displayName: "Test Plugin",
      vendor: "Test Vendor",
      description: "A test plugin for pipeline validation.",
      version: "0.1.0",
      capabilities: ["native_qr"],
      category: { zh: "测试", en: "Test" },
      summary: { zh: "测试插件", en: "Test plugin" },
      detail: { zh: "用于管道测试", en: "For pipeline testing" },
      supportsCallbackRoute: false,
      requiresMerchantProfileCompletion: false,
      runtimeEntrypoint: "./runtime.js",
    },
    files: [
      { path: "runtime.js", content: "export const pluginRuntime = {};" },
    ],
  });
}

function setupDeps() {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const spkiDer = publicKey.export({ type: "spki", format: "der" });
  const rawPubKey = Buffer.from(spkiDer.subarray(spkiDer.length - 32)).toString("base64url");

  const keyStore = createInMemorySigningKeyStore();
  const objectStore = createInMemoryObjectStore();
  const signer = createLocalEd25519Signer({ keyId: "key-test", privateKey });

  return { keyStore, objectStore, signer, publicKey, rawPubKey };
}

describe("runBundlePipeline", () => {
  it("parses manifest, stores bundle, signs, and returns correct result", async () => {
    const { keyStore, objectStore, signer, publicKey } = setupDeps();

    // Provision a signing key first
    await keyStore.rotate({
      newKey: {
        keyId: "key-test",
        alg: "Ed25519",
        publicKey: "AAAA",
        kmsKeyArn: null,
        notBefore: new Date(),
        notAfter: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
      },
    });

    const bundleJson = buildJsonBundle();
    const rawBytes = Buffer.from(bundleJson, "utf8");

    const result = await runBundlePipeline(
      { rawBytes, contentType: "application/json" },
      { objectStore, signer, keyStore },
    );

    // Manifest parsed correctly
    assert.equal(result.manifest.slug, "remote.test-plugin");
    assert.equal(result.manifest.channelCode, "crypto.test");
    assert.equal(result.manifest.source, "REMOTE_SIGNED");

    // sha256 matches
    const expectedSha = createHash("sha256").update(rawBytes).digest("hex");
    assert.equal(result.sha256, expectedSha);

    // Storage key follows convention
    assert.equal(result.storageKey, `packages/${expectedSha}.tar.gz`);
    assert.equal(result.alreadyExisted, false);
    assert.equal(result.sizeBytes, rawBytes.length);

    // Signature is valid Ed25519
    assert.match(result.signature, /^ed25519:[A-Za-z0-9_-]+$/);
    const sigBytes = Buffer.from(
      result.signature.slice("ed25519:".length),
      "base64url",
    );
    const valid = cryptoVerify(null, rawBytes, publicKey, sigBytes);
    assert.equal(valid, true);
    assert.equal(result.signatureKeyId, "key-test");
  });

  it("deduplicates when the same bundle is uploaded twice", async () => {
    const { keyStore, objectStore, signer } = setupDeps();
    await keyStore.rotate({
      newKey: {
        keyId: "key-test",
        alg: "Ed25519",
        publicKey: "AAAA",
        kmsKeyArn: null,
        notBefore: new Date(),
        notAfter: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
      },
    });

    const rawBytes = Buffer.from(buildJsonBundle(), "utf8");
    const deps = { objectStore, signer, keyStore };

    const first = await runBundlePipeline(
      { rawBytes, contentType: "application/json" },
      deps,
    );
    const second = await runBundlePipeline(
      { rawBytes, contentType: "application/json" },
      deps,
    );

    assert.equal(first.sha256, second.sha256);
    assert.equal(first.alreadyExisted, false);
    assert.equal(second.alreadyExisted, true);
  });

  it("rejects bundles without a manifest field", async () => {
    const { keyStore, objectStore, signer } = setupDeps();
    await keyStore.rotate({
      newKey: {
        keyId: "key-test",
        alg: "Ed25519",
        publicKey: "AAAA",
        kmsKeyArn: null,
        notBefore: new Date(),
        notAfter: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
      },
    });

    const rawBytes = Buffer.from(JSON.stringify({ files: [] }), "utf8");

    await assert.rejects(
      () =>
        runBundlePipeline(
          { rawBytes, contentType: "application/json" },
          { objectStore, signer, keyStore },
        ),
      /does not contain a plugin\.json manifest/,
    );
  });

  it("rejects invalid gzip content gracefully", async () => {
    const { keyStore, objectStore, signer } = setupDeps();
    await keyStore.rotate({
      newKey: {
        keyId: "key-test",
        alg: "Ed25519",
        publicKey: "AAAA",
        kmsKeyArn: null,
        notBefore: new Date(),
        notAfter: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
      },
    });

    // Truncated gzip — will fail during gunzip
    const rawBytes = Buffer.from([0x1f, 0x8b, 0x08]);

    await assert.rejects(
      () =>
        runBundlePipeline(
          { rawBytes, contentType: "application/gzip" },
          { objectStore, signer, keyStore },
        ),
      /incorrect header check|unexpected end/i,
    );
  });
});
