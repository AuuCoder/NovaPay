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
  markOrderRefunded,
  markOrderPaidAndIssueLicense,
} from "../../lib/payments/order-service";
import { createInMemoryBalanceLedger } from "../../lib/payouts/balance-ledger";

async function setupDeps() {
  const keyStore = createInMemorySigningKeyStore();
  const adapter = createLocalKeyPairAdapter();
  const rotation = await rotateSigningKey(
    { keyId: `key-order-${Math.random().toString(36).slice(2, 8)}` },
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
  return { keyStore, signer, orderStore, ledger };
}

describe("order service", () => {
  it("creates a PENDING order with a unique orderNumber", async () => {
    const deps = await setupDeps();
    const order = await createPluginOrder(
      {
        pluginSlug: "thirdparty.sample-pay",
        pluginId: "plg-1",
        developerId: "dev-1",
        version: "0.1.0",
        buyerInstanceId: "inst-A",
        pricingPlanKind: "PER_INSTANCE_ONE_TIME",
        priceAmountCents: 9900,
        priceCurrency: "CNY",
      },
      { orderStore: deps.orderStore, signer: deps.signer, keyStore: deps.keyStore },
    );

    assert.equal(order.state, "PENDING");
    assert.ok(order.id.startsWith("ord_"));
    assert.ok(order.orderNumber.length > 0);
  });

  it("issues a license and credits developer balance on PAID", async () => {
    const deps = await setupDeps();
    const order = await createPluginOrder(
      {
        pluginSlug: "thirdparty.sample-pay",
        pluginId: "plg-1",
        developerId: "dev-1",
        version: "0.1.0",
        buyerInstanceId: "inst-A",
        pricingPlanKind: "PER_INSTANCE_ONE_TIME",
        priceAmountCents: 10000,
        priceCurrency: "CNY",
      },
      deps,
    );

    const result = await markOrderPaidAndIssueLicense(
      {
        orderId: order.id,
        novapayOrderId: "np-12345",
      },
      { ...deps, developerRevenueSharePercent: 70 },
    );

    assert.equal(result.order.state, "PAID");
    assert.equal(result.order.novapayOrderId, "np-12345");
    assert.ok(result.licenseJwsCompact.split(".").length === 3);

    const balance = await deps.ledger.getBalance("dev-1", "CNY");
    // 70% of 10000 = 7000 cents
    assert.equal(balance.total, 7000);
    assert.equal(balance.available, 7000);
  });

  it("refuses to mark an already PAID order", async () => {
    const deps = await setupDeps();
    const order = await createPluginOrder(
      {
        pluginSlug: "thirdparty.sample-pay",
        pluginId: "plg-1",
        developerId: "dev-1",
        version: "0.1.0",
        buyerInstanceId: "inst-A",
        pricingPlanKind: "PER_INSTANCE_ONE_TIME",
        priceAmountCents: 5000,
        priceCurrency: "CNY",
      },
      deps,
    );
    await markOrderPaidAndIssueLicense(
      { orderId: order.id, novapayOrderId: "np-1" },
      deps,
    );
    await assert.rejects(
      () =>
        markOrderPaidAndIssueLicense(
          { orderId: order.id, novapayOrderId: "np-2" },
          deps,
        ),
      /already marked PAID/,
    );
  });

  it("reverses developer revenue when an order is refunded", async () => {
    const deps = await setupDeps();
    const order = await createPluginOrder(
      {
        pluginSlug: "thirdparty.sample-pay",
        pluginId: "plg-1",
        developerId: "dev-1",
        version: "0.1.0",
        buyerInstanceId: "inst-A",
        pricingPlanKind: "PER_INSTANCE_ONE_TIME",
        priceAmountCents: 10000,
        priceCurrency: "CNY",
      },
      deps,
    );

    await markOrderPaidAndIssueLicense(
      {
        orderId: order.id,
        novapayOrderId: "np-12345",
      },
      { ...deps, developerRevenueSharePercent: 70 },
    );

    const refunded = await markOrderRefunded(
      { orderId: order.id },
      { ...deps, developerRevenueSharePercent: 70 },
    );

    assert.equal(refunded.state, "REFUNDED");

    const balance = await deps.ledger.getBalance("dev-1", "CNY");
    assert.equal(balance.total, 0);
    assert.equal(balance.available, 0);
  });
});
