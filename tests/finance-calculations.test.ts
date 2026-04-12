import assert from "node:assert/strict";
import test from "node:test";
import {
  addDaysToDayKey,
  buildDailyBalanceSnapshots,
  buildSettlementDigest,
  calculatePaymentFeeSnapshot,
  toShanghaiDayKey,
} from "../lib/finance/calculations";

test("payment fee snapshot stores fee rate fee amount and net amount", () => {
  assert.deepEqual(
    calculatePaymentFeeSnapshot({
      amount: "100.00",
      feeRate: "0.003",
    }),
    {
      feeRate: "0.0030",
      feeAmount: "0.30",
      netAmount: "99.70",
    },
  );
});

test("settlement digest separates gross fee refund adjustment and payout", () => {
  assert.deepEqual(
    buildSettlementDigest([
      { type: "PAYMENT_CAPTURE", direction: "CREDIT", amount: "100.00" },
      { type: "PAYMENT_FEE", direction: "DEBIT", amount: "0.30" },
      { type: "REFUND", direction: "DEBIT", amount: "20.00" },
      { type: "ADJUSTMENT", direction: "CREDIT", amount: "5.00" },
      { type: "SETTLEMENT_PAYOUT", direction: "DEBIT", amount: "70.00" },
    ]),
    {
      grossAmount: "100.00",
      refundAmount: "20.00",
      feeAmount: "0.30",
      adjustmentAmount: "5.00",
      netAmount: "84.70",
      payoutAmount: "70.00",
    },
  );
});

test("daily balance snapshots roll opening and closing balances by merchant", () => {
  assert.deepEqual(
    buildDailyBalanceSnapshots([
      {
        merchantId: "m1",
        currency: "CNY",
        dayKey: "2026-04-10",
        creditAmount: "100.00",
        debitAmount: "20.00",
      },
      {
        merchantId: "m1",
        currency: "CNY",
        dayKey: "2026-04-11",
        creditAmount: "50.00",
        debitAmount: "10.00",
      },
    ]),
    [
      {
        merchantId: "m1",
        currency: "CNY",
        dayKey: "2026-04-10",
        creditAmount: "100.00",
        debitAmount: "20.00",
        openingBalance: "0.00",
        closingBalance: "80.00",
        totalCredit: "100.00",
        totalDebit: "20.00",
      },
      {
        merchantId: "m1",
        currency: "CNY",
        dayKey: "2026-04-11",
        creditAmount: "50.00",
        debitAmount: "10.00",
        openingBalance: "80.00",
        closingBalance: "120.00",
        totalCredit: "50.00",
        totalDebit: "10.00",
      },
    ],
  );
});

test("shanghai day helpers keep local business day stable", () => {
  assert.equal(toShanghaiDayKey("2026-04-10T16:30:00.000Z"), "2026-04-11");
  assert.equal(addDaysToDayKey("2026-04-11", -1), "2026-04-10");
});
