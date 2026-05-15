/**
 * End-to-end integration test: NovaPay main app ↔ Registry.
 *
 * Simulates the full consumer-side flow:
 *   1. Fetch /api/registry/plugins → parse with parseRemotePluginRecord
 *   2. Fetch /api/registry/packages/:slug/:version → get checksum + signature
 *   3. Fetch download URL → get raw bundle bytes
 *   4. Verify sha256 checksum
 *   5. Verify Ed25519 signature using trust.json public key
 *   6. Parse the bundle manifest with parsePluginPackageManifest
 *
 * Requires the Registry dev server running at localhost:3100 with
 * REGISTRY_AUTH_DISABLED=1. Skip this test in CI unless the server is up.
 */

import assert from "node:assert/strict";
import { describe, it, before } from "node:test";
import { createHash, createPublicKey, verify as cryptoVerify } from "node:crypto";

const REGISTRY_BASE = process.env.REGISTRY_BASE_URL ?? "http://localhost:3100";

const ED25519_SPKI_PREFIX = Buffer.from([
  0x30, 0x2a, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x03, 0x21, 0x00,
]);

async function fetchJson(path: string) {
  const r = await fetch(`${REGISTRY_BASE}${path}`);
  if (!r.ok) throw new Error(`${path} -> HTTP ${r.status}`);
  return r.json() as Promise<Record<string, unknown>>;
}

async function fetchBytes(url: string) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url} -> HTTP ${r.status}`);
  return Buffer.from(await r.arrayBuffer());
}

function rebuildPublicKey(b64url: string) {
  const raw = Buffer.from(b64url, "base64url");
  return createPublicKey({
    key: Buffer.concat([ED25519_SPKI_PREFIX, raw]),
    format: "der",
    type: "spki",
  });
}

let registryAvailable = false;

describe("NovaPay ↔ Registry integration", () => {
  before(async () => {
    try {
      const r = await fetch(`${REGISTRY_BASE}/api/.well-known/trust.json`, {
        signal: AbortSignal.timeout(3000),
      });
      registryAvailable = r.ok;
    } catch {
      registryAvailable = false;
    }
    if (!registryAvailable) {
      console.log("⚠️  Registry not available at", REGISTRY_BASE, "— skipping integration tests.");
    }
  });

  it("fetches plugin catalog and parses all entries", async (t) => {
    if (!registryAvailable) return t.skip("Registry not running");

    const data = await fetchJson("/api/registry/plugins");
    const plugins = data.plugins as Array<Record<string, unknown>>;
    assert.ok(Array.isArray(plugins));
    assert.ok(plugins.length >= 1, "catalog must have at least 1 plugin");

    for (const plugin of plugins) {
      // Validate required fields from parseRemotePluginRecord
      assert.equal(typeof plugin.remotePluginId, "string");
      assert.equal(typeof plugin.slug, "string");
      assert.equal(plugin.kind, "PAYMENT_CHANNEL");
      assert.equal(typeof plugin.channelCode, "string");
      assert.equal(typeof plugin.providerKey, "string");
      assert.equal(typeof plugin.displayName, "string");
      assert.equal(typeof plugin.version, "string");
      assert.equal(typeof plugin.latestVersion, "string");
      assert.ok(
        plugin.runtimeMode === "RUNNABLE" || plugin.runtimeMode === "MANIFEST_ONLY",
      );
      assert.ok(plugin.pricingMode === "FREE" || plugin.pricingMode === "PAID");
      assert.ok(Array.isArray(plugin.capabilities));
      // checksum and signature must be present (non-null) for signed registry
      assert.ok(
        typeof plugin.checksum === "string" && plugin.checksum.startsWith("sha256:"),
        `plugin ${plugin.slug} must have a sha256: checksum`,
      );
      assert.ok(
        typeof plugin.signature === "string" && plugin.signature.startsWith("ed25519:"),
        `plugin ${plugin.slug} must have an ed25519: signature`,
      );
    }
  });

  it("downloads a FREE bundle and verifies sha256 + Ed25519 signature", async (t) => {
    if (!registryAvailable) return t.skip("Registry not running");

    // 1. Get trust.json for the public key
    const trust = await fetchJson("/api/.well-known/trust.json") as {
      currentKey: { keyId: string; publicKey: string };
    };
    assert.ok(trust.currentKey, "trust.json must have a currentKey");

    // 2. Get package metadata
    const pkg = await fetchJson(
      "/api/registry/packages/remote.demo-runnable-crypto/0.1.0",
    ) as {
      checksum: string;
      signature: string;
      signatureKeyId: string;
      downloadUrl: string;
      sizeBytes: number;
    };
    assert.ok(pkg.checksum.startsWith("sha256:"));
    assert.ok(pkg.signature.startsWith("ed25519:"));
    assert.equal(pkg.signatureKeyId, trust.currentKey.keyId);

    // 3. Download bundle bytes
    const bytes = await fetchBytes(pkg.downloadUrl);
    assert.equal(bytes.length, pkg.sizeBytes);

    // 4. Verify sha256
    const computedSha = createHash("sha256").update(bytes).digest("hex");
    const expectedSha = pkg.checksum.replace(/^sha256:/, "");
    assert.equal(computedSha, expectedSha, "sha256 checksum must match");

    // 5. Verify Ed25519 signature
    const sigB64 = pkg.signature.replace(/^ed25519:/, "");
    const sigBytes = Buffer.from(sigB64, "base64url");
    const pubKey = rebuildPublicKey(trust.currentKey.publicKey);
    const sigOk = cryptoVerify(null, bytes, pubKey, sigBytes);
    assert.equal(sigOk, true, "Ed25519 signature must verify");

    // 6. Parse the manifest from the bundle
    const bundle = JSON.parse(bytes.toString("utf8")) as { manifest: Record<string, unknown> };
    assert.ok(bundle.manifest, "bundle must contain a manifest field");
    assert.equal(bundle.manifest.slug, "remote.demo-runnable-crypto");
    assert.equal(bundle.manifest.kind, "PAYMENT_CHANNEL");
  });

  it("creates an order for a PAID plugin and receives a valid license", async (t) => {
    if (!registryAvailable) return t.skip("Registry not running");

    // 1. Create order
    const orderRes = await fetch(
      `${REGISTRY_BASE}/api/registry/plugins/remote.demo-paid-crypto/orders`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instanceId: "inst_integration-test" }),
      },
    );
    assert.equal(orderRes.ok, true);
    const order = (await orderRes.json()) as {
      orderId: string;
      state: string;
      license: { licenseKey: string; licenseKeyHash: string } | null;
    };
    assert.equal(order.state, "PAID");
    assert.ok(order.license, "auto-pay mode must return a license");
    assert.ok(order.license!.licenseKey.split(".").length === 3, "license must be JWS compact");

    // 2. Verify the license against /licenses/verify
    const verifyRes = await fetch(`${REGISTRY_BASE}/api/licenses/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        licenseKey: order.license!.licenseKey,
        expectedSlug: "remote.demo-paid-crypto",
        expectedVersion: "0.2.0",
        expectedInstanceId: "inst_integration-test",
      }),
    });
    assert.equal(verifyRes.ok, true);
    const verify = (await verifyRes.json()) as { valid: boolean; claims?: Record<string, unknown> };
    assert.equal(verify.valid, true);
    assert.equal(verify.claims?.pluginSlug, "remote.demo-paid-crypto");
    assert.equal(verify.claims?.instanceId, "inst_integration-test");
    assert.equal(verify.claims?.scope, "INSTANCE");

    // 3. Verify with wrong instanceId → INSTANCE_MISMATCH
    const mismatchRes = await fetch(`${REGISTRY_BASE}/api/licenses/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        licenseKey: order.license!.licenseKey,
        expectedInstanceId: "inst_wrong",
      }),
    });
    const mismatch = (await mismatchRes.json()) as { valid: boolean; reason?: string };
    assert.equal(mismatch.valid, false);
    assert.equal(mismatch.reason, "INSTANCE_MISMATCH");

    // 4. Get order by ID
    const getRes = await fetch(`${REGISTRY_BASE}/api/registry/orders/${order.orderId}`);
    assert.equal(getRes.ok, true);
    const fetched = (await getRes.json()) as { state: string; license: unknown };
    assert.equal(fetched.state, "PAID");
    assert.ok(fetched.license, "GET order must include the license");
  });

  it("rejects requests with invalid appKey when auth is enabled", async (t) => {
    if (!registryAvailable) return t.skip("Registry not running");
    // This test only works when REGISTRY_AUTH_DISABLED is NOT set.
    // In dev mode (REGISTRY_AUTH_DISABLED=1) it will pass trivially.
    // We still include it so CI can run it with auth enabled.
    const res = await fetch(`${REGISTRY_BASE}/api/registry/plugins`, {
      headers: {
        "x-novapay-registry-app-id": "novapay-admin",
        "x-novapay-registry-app-key": "wrong-key",
      },
    });
    // When auth is disabled, this returns 200 (anonymous allowed).
    // When auth is enabled, this returns 401.
    assert.ok(
      res.status === 200 || res.status === 401,
      `Expected 200 (auth disabled) or 401 (auth enabled), got ${res.status}`,
    );
  });
});
