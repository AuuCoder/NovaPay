import assert from "node:assert/strict";
import test from "node:test";
import { verifyLicense } from "../lib/plugins/license-client";

interface FetchCall {
  url: string;
  init: RequestInit;
}

function withMockFetch<T>(
  responses: Array<{ status: number; body: unknown } | Error>,
  fn: (calls: FetchCall[]) => Promise<T>,
): Promise<T> {
  const calls: FetchCall[] = [];
  const original = globalThis.fetch;
  let callIndex = 0;
  globalThis.fetch = (async (url: RequestInfo | URL, init: RequestInit = {}) => {
    calls.push({ url: url.toString(), init });
    const next = responses[callIndex];
    callIndex += 1;
    if (next instanceof Error) throw next;
    if (!next) throw new Error("No mock response configured for call.");
    return new Response(JSON.stringify(next.body), {
      status: next.status,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;
  return fn(calls).finally(() => {
    globalThis.fetch = original;
  });
}

test("verifyLicense returns success when registry reports valid", async () => {
  await withMockFetch(
    [
      {
        status: 200,
        body: {
          valid: true,
          claims: {
            jti: "lic-1",
            pluginSlug: "remote.demo",
            version: "0.1.0",
            pricingPlanKind: "PER_INSTANCE_ONE_TIME",
            instanceId: "inst-A",
            scope: "INSTANCE",
            iat: Math.floor(Date.now() / 1000),
            exp: Math.floor(Date.now() / 1000) + 3600,
          },
          licenseKeyHash: "deadbeef",
          signingKeyId: "key-1",
        },
      },
    ],
    async (calls) => {
      const result = await verifyLicense({
        licenseKey: "header.payload.signature",
        pluginSlug: "remote.demo",
        version: "0.1.0",
        instanceId: "inst-A",
        registryBaseUrl: "https://registry.example.com",
        appId: "app-1",
        appKey: "key-1",
      });
      assert.equal(result.valid, true);
      if (result.valid) {
        assert.equal(result.claims.pluginSlug, "remote.demo");
        assert.ok(result.licenseExpiresAt instanceof Date);
      }
      assert.equal(calls.length, 1);
      assert.match(calls[0]!.url, /\/api\/licenses\/verify$/);
      assert.equal(
        (calls[0]!.init.headers as Record<string, string>)["x-novapay-registry-app-id"],
        "app-1",
      );
    },
  );
});

test("verifyLicense returns failure with reason when registry rejects", async () => {
  await withMockFetch(
    [
      {
        status: 200,
        body: {
          valid: false,
          reason: "INSTANCE_MISMATCH",
          message: "License instanceId mismatch.",
        },
      },
    ],
    async () => {
      const result = await verifyLicense({
        licenseKey: "header.payload.signature",
        pluginSlug: "remote.demo",
        version: "0.1.0",
        instanceId: "inst-Wrong",
        registryBaseUrl: "https://registry.example.com",
        appId: "app-1",
        appKey: "key-1",
      });
      assert.equal(result.valid, false);
      if (!result.valid) {
        assert.equal(result.reason, "INSTANCE_MISMATCH");
      }
    },
  );
});

test("verifyLicense returns TRANSPORT_ERROR on HTTP failure", async () => {
  await withMockFetch(
    [{ status: 500, body: { error: "internal" } }],
    async () => {
      const result = await verifyLicense({
        licenseKey: "header.payload.signature",
        pluginSlug: "remote.demo",
        version: "0.1.0",
        instanceId: "inst-A",
        registryBaseUrl: "https://registry.example.com",
        appId: "app-1",
        appKey: "key-1",
      });
      assert.equal(result.valid, false);
      if (!result.valid) {
        assert.equal(result.reason, "TRANSPORT_ERROR");
      }
    },
  );
});

test("verifyLicense returns TRANSPORT_ERROR on network failure", async () => {
  await withMockFetch([new Error("network down")], async () => {
    const result = await verifyLicense({
      licenseKey: "header.payload.signature",
      pluginSlug: "remote.demo",
      version: "0.1.0",
      instanceId: "inst-A",
      registryBaseUrl: "https://registry.example.com",
      appId: "app-1",
      appKey: "key-1",
    });
    assert.equal(result.valid, false);
    if (!result.valid) {
      assert.equal(result.reason, "TRANSPORT_ERROR");
      assert.match(result.message, /network down/);
    }
  });
});

test("NOVAPAY_DISABLE_LICENSE_CHECK skips remote call in non-production", async () => {
  const originalEnv = process.env.NOVAPAY_DISABLE_LICENSE_CHECK;
  const originalNodeEnv = process.env.NODE_ENV;
  process.env.NOVAPAY_DISABLE_LICENSE_CHECK = "1";
  process.env.NODE_ENV = "development";
  // Capture console.warn so the test stays quiet.
  const originalWarn = console.warn;
  console.warn = () => {};

  try {
    let fetchCalled = false;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => {
      fetchCalled = true;
      throw new Error("should not be called");
    }) as typeof fetch;

    try {
      const result = await verifyLicense({
        licenseKey: "header.payload.signature",
        pluginSlug: "remote.demo",
        version: "0.1.0",
        instanceId: "inst-A",
        registryBaseUrl: "https://registry.example.com",
        appId: "app-1",
        appKey: "key-1",
      });
      assert.equal(result.valid, true);
      assert.equal(fetchCalled, false);
    } finally {
      globalThis.fetch = originalFetch;
    }
  } finally {
    if (originalEnv === undefined) {
      delete process.env.NOVAPAY_DISABLE_LICENSE_CHECK;
    } else {
      process.env.NOVAPAY_DISABLE_LICENSE_CHECK = originalEnv;
    }
    if (originalNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = originalNodeEnv;
    }
    console.warn = originalWarn;
  }
});
