import assert from "node:assert/strict";
import test from "node:test";
import {
  getIdempotencyScopeLabel,
  getIdempotencyStatusLabel,
  getIdempotencyStatusTone,
} from "../app/admin/support";

test("idempotency status labels are localized", () => {
  assert.equal(getIdempotencyStatusLabel("PROCESSING", "zh"), "处理中");
  assert.equal(getIdempotencyStatusLabel("SUCCEEDED", "en"), "Succeeded");
  assert.equal(getIdempotencyStatusLabel("FAILED_FINAL", "zh"), "最终失败");
  assert.equal(getIdempotencyStatusLabel("FAILED_RETRYABLE", "en"), "Retryable Failure");
});

test("idempotency status tone maps each lifecycle state", () => {
  assert.equal(getIdempotencyStatusTone("PROCESSING"), "info");
  assert.equal(getIdempotencyStatusTone("SUCCEEDED"), "success");
  assert.equal(getIdempotencyStatusTone("FAILED_FINAL"), "danger");
  assert.equal(getIdempotencyStatusTone("FAILED_RETRYABLE"), "warning");
});

test("idempotency scope labels stay readable for supported write operations", () => {
  assert.equal(getIdempotencyScopeLabel("payment_order.create", "zh"), "创建支付订单");
  assert.equal(getIdempotencyScopeLabel("payment_order.close", "en"), "Close Payment Order");
  assert.equal(getIdempotencyScopeLabel("payment_refund.create", "zh"), "创建退款");
});
