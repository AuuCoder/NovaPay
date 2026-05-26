import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createInMemoryAuditLogger } from "../../lib/audit/log";
import { takeDownPlugin, type CatalogEntry, type PluginVersionRecord, type RegistryRuntimeState } from "../../lib/runtime/state";
import { createInMemorySigningKeyStore } from "../../lib/signing/key-store";
import { createSigner } from "../../lib/signing/signer";
import { createInMemoryRevocationStore } from "../../lib/licensing/revocation";
import { createInMemoryLicenseStore } from "../../lib/licensing/store";
import { createInMemoryOrderStore } from "../../lib/payments/order-service";
import { createInMemoryBalanceLedger } from "../../lib/payouts/balance-ledger";
import { createInMemoryObjectStore } from "../../lib/storage/object-store";

function createStubState(): RegistryRuntimeState {
  const catalogEntry: CatalogEntry = {
    remotePluginId: "thirdparty.checkout",
    slug: "thirdparty.checkout",
    kind: "PAYMENT_CHANNEL",
    channelCode: "thirdparty.checkout",
    providerKey: "thirdparty",
    packageName: "@acme/plugin-thirdparty-checkout",
    displayName: "ThirdParty Checkout",
    vendor: "Acme",
    description: "stub",
    version: "1.0.0",
    latestVersion: "1.0.0",
    runtimeMode: "RUNNABLE",
    pricingMode: "FREE",
    pricingPlanKind: null,
    priceAmountCents: null,
    priceCurrency: null,
    priceLabel: null,
    purchaseUrl: null,
    capabilities: [],
    metadata: {},
  };

  const versionRecord: PluginVersionRecord = {
    slug: "thirdparty.checkout",
    version: "1.0.0",
    reviewState: "PUBLISHED",
    pricingMode: "FREE",
    pricingPlanKind: null,
    priceAmountCents: null,
    priceCurrency: null,
    priceLabel: null,
    purchaseUrl: null,
    scanResult: null,
    publishedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const auditLogger = createInMemoryAuditLogger();

  return {
    keyStore: createInMemorySigningKeyStore(),
    signer: createSigner({
      adapter: {
        async signRaw() {
          return Buffer.from("stub");
        },
      },
    }),
    // not used in this test
    signingPrivateKey: {} as never,
    signingKeyPair: {} as never,
    activateSigningKeyPair() {},
    revocations: createInMemoryRevocationStore(),
    licenseStore: createInMemoryLicenseStore(),
    orderStore: createInMemoryOrderStore(),
    ledger: createInMemoryBalanceLedger(),
    auditLogger,
    objectStore: createInMemoryObjectStore(),
    demoBundles: new Map([
      [
        "thirdparty.checkout@1.0.0",
        {
          slug: "thirdparty.checkout",
          rawBytes: Buffer.from("stub"),
          pipelineResult: {
            manifest: {
              slug: "thirdparty.checkout",
              version: "1.0.0",
              kind: "PAYMENT_CHANNEL",
              channelCode: "thirdparty.checkout",
              providerKey: "thirdparty",
              packageName: "@acme/plugin-thirdparty-checkout",
              displayName: "ThirdParty Checkout",
              vendor: "Acme",
              description: "stub",
              capabilities: [],
              category: { zh: "支付", en: "Payment" },
              summary: { zh: "摘要", en: "Summary" },
              detail: { zh: "详情", en: "Detail" },
              supportsCallbackRoute: false,
              requiresMerchantProfileCompletion: false,
              runtimeEntrypoint: "./runtime.js",
              manifestVersion: 1,
            },
            manifestRaw: "{}",
            sha256: "stub",
            signature: "stub",
            signatureKeyId: "stub",
            storageKey: "stub",
            sizeBytes: 4,
            alreadyExisted: false,
          } as never,
          catalogEntry,
        },
      ],
    ]) as never,
    pluginVersions: new Map([["thirdparty.checkout@1.0.0", versionRecord]]),
    catalog: [catalogEntry],
    verificationSessions: new Map(),
    consumers: {
      async findByAppId() {
        return null;
      },
      register() {},
    },
  };
}

describe("plugin take-down", () => {
  it("marks published versions as TAKEN_DOWN, removes them from the catalog, and writes an audit entry", async () => {
    const state = createStubState();

    const result = await takeDownPlugin({
      state,
      slug: "thirdparty.checkout",
      actorId: "admin-1",
      reason: "policy violation",
      ip: "127.0.0.1",
    });

    assert.equal(result.success, true);
    assert.equal(result.updatedVersions.length, 1);
    assert.equal(result.updatedVersions[0]?.reviewState, "TAKEN_DOWN");
    assert.equal(state.catalog.length, 0);

    const logs = await state.auditLogger.list();
    assert.equal(logs.length, 1);
    assert.equal(logs[0]?.action, "PLUGIN_TAKEN_DOWN");
    assert.equal(logs[0]?.targetId, "thirdparty.checkout");
  });
});
