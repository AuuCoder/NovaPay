import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { createInMemoryBalanceLedger } from "../../lib/payouts/balance-ledger";

describe("balance ledger", () => {
  it("credits developer balance from license sales (idempotent on externalRef)", async () => {
    const ledger = createInMemoryBalanceLedger();
    await ledger.credit({
      developerId: "dev-1",
      amountCents: 7000,
      currency: "CNY",
      reason: "LICENSE_SALE",
      externalRef: "ord-100",
    });
    await ledger.credit({
      developerId: "dev-1",
      amountCents: 7000,
      currency: "CNY",
      reason: "LICENSE_SALE",
      externalRef: "ord-100",
    });
    const balance = await ledger.getBalance("dev-1");
    assert.equal(balance.total, 7000);
    assert.equal(balance.available, 7000);
    assert.equal(balance.frozen, 0);
  });

  it("freezes funds on payout submission and rejects when balance is insufficient", async () => {
    const ledger = createInMemoryBalanceLedger();
    await ledger.credit({
      developerId: "dev-1",
      amountCents: 5000,
      currency: "CNY",
      reason: "LICENSE_SALE",
      externalRef: "ord-1",
    });

    const submit1 = await ledger.submitPayout({
      developerId: "dev-1",
      payoutAccountId: "acct-1",
      amountCents: 3000,
    });
    assert.equal(submit1.success, true);

    const balance = await ledger.getBalance("dev-1");
    assert.equal(balance.total, 5000);
    assert.equal(balance.frozen, 3000);
    assert.equal(balance.available, 2000);

    const submit2 = await ledger.submitPayout({
      developerId: "dev-1",
      payoutAccountId: "acct-1",
      amountCents: 3000,
    });
    assert.equal(submit2.success, false);
    assert.equal(submit2.errorCode, "INSUFFICIENT_BALANCE");
  });

  it("debits balance on payout approval and clears frozen", async () => {
    const ledger = createInMemoryBalanceLedger();
    await ledger.credit({
      developerId: "dev-1",
      amountCents: 9000,
      currency: "CNY",
      reason: "LICENSE_SALE",
      externalRef: "ord-1",
    });
    const submit = await ledger.submitPayout({
      developerId: "dev-1",
      payoutAccountId: "acct-1",
      amountCents: 4000,
    });
    assert.ok(submit.request);

    const approved = await ledger.approvePayout({
      requestId: submit.request!.id,
      adminNote: "OK",
    });
    assert.equal(approved.success, true);
    assert.equal(approved.request?.state, "APPROVED");

    const balance = await ledger.getBalance("dev-1");
    assert.equal(balance.total, 5000);
    assert.equal(balance.frozen, 0);
    assert.equal(balance.available, 5000);
  });

  it("releases frozen funds on rejection", async () => {
    const ledger = createInMemoryBalanceLedger();
    await ledger.credit({
      developerId: "dev-1",
      amountCents: 9000,
      currency: "CNY",
      reason: "LICENSE_SALE",
      externalRef: "ord-1",
    });
    const submit = await ledger.submitPayout({
      developerId: "dev-1",
      payoutAccountId: "acct-1",
      amountCents: 4000,
    });
    assert.ok(submit.request);

    const rejected = await ledger.rejectPayout({
      requestId: submit.request!.id,
      adminNote: "KYC failed",
    });
    assert.equal(rejected.success, true);
    assert.equal(rejected.request?.state, "REJECTED");

    const balance = await ledger.getBalance("dev-1");
    assert.equal(balance.total, 9000);
    assert.equal(balance.frozen, 0);
    assert.equal(balance.available, 9000);
  });

  it("rejects payouts with non-positive amount", async () => {
    const ledger = createInMemoryBalanceLedger();
    const submit = await ledger.submitPayout({
      developerId: "dev-1",
      payoutAccountId: "acct-1",
      amountCents: 0,
    });
    assert.equal(submit.success, false);
    assert.equal(submit.errorCode, "INVALID_AMOUNT");
  });

  it("supports negative adjustment entries for refund clawback", async () => {
    const ledger = createInMemoryBalanceLedger();
    await ledger.credit({
      developerId: "dev-1",
      amountCents: 7000,
      currency: "CNY",
      reason: "LICENSE_SALE",
      externalRef: "ord-1",
    });
    await ledger.credit({
      developerId: "dev-1",
      amountCents: -7000,
      currency: "CNY",
      reason: "LICENSE_REFUND",
      externalRef: "refund:ord-1",
    });

    const balance = await ledger.getBalance("dev-1");
    assert.equal(balance.total, 0);
    assert.equal(balance.available, 0);
  });

  it("freezes recently credited revenue when a hold window is configured", async () => {
    const ledger = createInMemoryBalanceLedger({
      holdDaysResolver: async () => 7,
    });

    await ledger.credit({
      developerId: "dev-1",
      amountCents: 7000,
      currency: "CNY",
      reason: "LICENSE_SALE",
      externalRef: "ord-hold",
    });

    const balance = await ledger.getBalance("dev-1");
    assert.equal(balance.total, 7000);
    assert.equal(balance.frozen, 7000);
    assert.equal(balance.available, 0);
  });

  it("rejects payout submission while all credited revenue is still in the hold window", async () => {
    const ledger = createInMemoryBalanceLedger({
      holdDaysResolver: async () => 7,
    });

    await ledger.credit({
      developerId: "dev-1",
      amountCents: 7000,
      currency: "CNY",
      reason: "LICENSE_SALE",
      externalRef: "ord-hold-submit",
    });

    const submit = await ledger.submitPayout({
      developerId: "dev-1",
      payoutAccountId: "acct-1",
      amountCents: 1000,
    });

    assert.equal(submit.success, false);
    assert.equal(submit.errorCode, "INSUFFICIENT_BALANCE");
  });
});
