import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCloseOrderIdempotencySummary,
  buildCreateOrderIdempotencySummary,
  buildCreateRefundIdempotencySummary,
} from "../lib/idempotency/fingerprint";

test("create order idempotency hash is stable for object key order", () => {
  const first = buildCreateOrderIdempotencySummary({
    merchantCode: "mch_demo",
    channelCode: "alipay.page",
    externalOrderId: "ORDER-001",
    amount: "88.00",
    currency: "CNY",
    subject: "Demo Order",
    metadata: {
      nested: {
        beta: "2",
        alpha: "1",
      },
      top: "value",
    },
  });
  const second = buildCreateOrderIdempotencySummary({
    merchantCode: "mch_demo",
    channelCode: "alipay.page",
    externalOrderId: "ORDER-001",
    amount: "88.00",
    currency: "CNY",
    subject: "Demo Order",
    metadata: {
      top: "value",
      nested: {
        alpha: "1",
        beta: "2",
      },
    },
  });

  assert.equal(first.requestHash, second.requestHash);
});

test("refund idempotency hash stays aligned between legacy and rest semantics", () => {
  const legacy = buildCreateRefundIdempotencySummary({
    merchantCode: "mch_demo",
    orderReference: "ORDER-001",
    externalRefundId: "REFUND-001",
    amount: "8.80",
    reason: "customer",
    metadata: {
      reasonCode: "C01",
    },
  });
  const rest = buildCreateRefundIdempotencySummary({
    merchantCode: "mch_demo",
    orderReference: "ORDER-001",
    externalRefundId: "REFUND-001",
    amount: "8.80",
    reason: "customer",
    metadata: {
      reasonCode: "C01",
    },
  });

  assert.equal(legacy.requestHash, rest.requestHash);
});

test("close order idempotency hash changes when order reference changes", () => {
  const first = buildCloseOrderIdempotencySummary({
    merchantCode: "mch_demo",
    orderReference: "ORDER-001",
  });
  const second = buildCloseOrderIdempotencySummary({
    merchantCode: "mch_demo",
    orderReference: "ORDER-002",
  });

  assert.notEqual(first.requestHash, second.requestHash);
});
