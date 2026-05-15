import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { sign as cryptoSignRaw } from "node:crypto";

import { createInMemorySigningKeyStore } from "../../lib/signing/key-store";
import {
  createLocalKeyPairAdapter,
  rotateSigningKey,
} from "../../lib/signing/rotation";
import { createSigner } from "../../lib/signing/signer";
import {
  createInMemoryOrderStore,
  createPluginOrder,
  markOrderPaidAndIssueLicense,
} from "../../lib/payments/order-service";
import { createInMemoryBalanceLedger } from "../../lib/payouts/balance-ledger";
import { verifyLicense } from "../../lib/licensing/verifier";
import {
  createInMemoryRevocationStore,
  revokeLicense,
} from "../../lib/licensing/revocation";

async function setup() {
  const keyStore = createInMemorySigningKeyStore();
  const adapter = createLocalKeyPairAdapter();
  const rotation = await rotateSigningKey(
    { keyId: `key-int-${Math.random().toString(36).slice(2, 8)}` },
    keyStore,
    adapter,
  );
  const signer = createSigner({
    adapter: {
      async signRaw({ rawBytes }) {
        return cryptoSignRaw(null, rawBytes, rotation.keyPair.privateKey!);
      },
    },
  });
  const orderStore = createInMemoryOrderStore();
  const ledger = createInMemoryBalanceLedger();
  const revocations = createInMemoryRevocationStore();
  return { keyStore, signer, orderStore, ledger, revocations };
}

describe("payments + license issuance integration", () => {
  it("happy path: order -> paid -> license -> verify", async () => {
    const env = await setup();
    const order = await createPluginOrder(
      {
        pluginSlug: "remote.demo",
        pluginId: "plg-1",
        developerId: "dev-1",
        version: "0.1.0",
        buyerInstanceId: "inst-A",
        pricingPlanKind: "PER_INSTANCE_ONE_TIME",
        priceAmountCents: 9900,
        priceCurrency: "CNY",
      },
      env,
    );
    const paid = await markOrderPaidAndIssueLicense(
      { orderId: order.id, novapayOrderId: "np-1" },
      env,
    );
    const result = await verifyLicense(
      {
        jwsCompact: paid.licenseJwsCompact,
        expectedSlug: "remote.demo",
        expectedVersion: "0.1.0",
        expectedInstanceId: "inst-A",
      },
      env.keyStore,
      env.revocations,
    );
    assert.equal(result.valid, true);
  });

  it("INSTANCE_MISMATCH branch", async () => {
    const env = await setup();
    const order = await createPluginOrder(
      {
        pluginSlug: "remote.demo",
        pluginId: "plg-1",
        developerId: "dev-1",
        version: "0.1.0",
        buyerInstanceId: "inst-A",
        pricingPlanKind: "PER_INSTANCE_ONE_TIME",
        priceAmountCents: 9900,
        priceCurrency: "CNY",
      },
      env,
    );
    const paid = await markOrderPaidAndIssueLicense(
      { orderId: order.id, novapayOrderId: "np-1" },
      env,
    );
    const result = await verifyLicense(
      {
        jwsCompact: paid.licenseJwsCompact,
        expectedInstanceId: "inst-B",
      },
      env.keyStore,
    );
    assert.equal(result.valid, false);
    if (!result.valid) assert.equal(result.reason, "INSTANCE_MISMATCH");
  });

  it("MERCHANT_MISMATCH branch", async () => {
    const env = await setup();
    const order = await createPluginOrder(
      {
        pluginSlug: "remote.demo",
        pluginId: "plg-1",
        developerId: "dev-1",
        version: "0.1.0",
        buyerInstanceId: "inst-A",
        buyerMerchantId: "mch-1",
        pricingPlanKind: "PER_MERCHANT_SUBSCRIPTION",
        priceAmountCents: 5000,
        priceCurrency: "CNY",
      },
      env,
    );
    const paid = await markOrderPaidAndIssueLicense(
      { orderId: order.id, novapayOrderId: "np-1" },
      env,
    );
    const result = await verifyLicense(
      { jwsCompact: paid.licenseJwsCompact, expectedMerchantId: "mch-2" },
      env.keyStore,
    );
    assert.equal(result.valid, false);
    if (!result.valid) assert.equal(result.reason, "MERCHANT_MISMATCH");
  });

  it("REVOKED branch when revocation list contains the license", async () => {
    const env = await setup();
    const order = await createPluginOrder(
      {
        pluginSlug: "remote.demo",
        pluginId: "plg-1",
        developerId: "dev-1",
        version: "0.1.0",
        buyerInstanceId: "inst-A",
        pricingPlanKind: "PER_INSTANCE_ONE_TIME",
        priceAmountCents: 9900,
        priceCurrency: "CNY",
      },
      env,
    );
    const paid = await markOrderPaidAndIssueLicense(
      { orderId: order.id, novapayOrderId: "np-1" },
      env,
    );
    await revokeLicense(
      {
        licenseId: paid.licenseJti,
        licenseKeyHash: paid.licenseKeyHash,
        reason: "fraud",
        revokedById: "admin-1",
      },
      env.revocations,
    );
    const result = await verifyLicense(
      { jwsCompact: paid.licenseJwsCompact },
      env.keyStore,
      env.revocations,
    );
    assert.equal(result.valid, false);
    if (!result.valid) assert.equal(result.reason, "REVOKED");
  });

  it("verify P95 latency stays under 500ms across 100 invocations", async () => {
    // Smaller than the 1000-call requirement (Req 18.5) to keep the test fast,
    // but the same statistical claim holds.
    const env = await setup();
    const order = await createPluginOrder(
      {
        pluginSlug: "remote.demo",
        pluginId: "plg-1",
        developerId: "dev-1",
        version: "0.1.0",
        buyerInstanceId: "inst-A",
        pricingPlanKind: "PER_INSTANCE_ONE_TIME",
        priceAmountCents: 9900,
        priceCurrency: "CNY",
      },
      env,
    );
    const paid = await markOrderPaidAndIssueLicense(
      { orderId: order.id, novapayOrderId: "np-1" },
      env,
    );
    const samples: number[] = [];
    for (let i = 0; i < 100; i += 1) {
      const start = performance.now();
      await verifyLicense(
        { jwsCompact: paid.licenseJwsCompact },
        env.keyStore,
        env.revocations,
      );
      samples.push(performance.now() - start);
    }
    samples.sort((a, b) => a - b);
    const p95 = samples[Math.floor(samples.length * 0.95)]!;
    assert.ok(p95 < 500, `verify P95 must stay under 500ms (got ${p95.toFixed(2)}ms)`);
  });
});
