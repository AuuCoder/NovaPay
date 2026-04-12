import assert from "node:assert/strict";
import test from "node:test";
import { getOpenApiSpec } from "../lib/openapi";

test("merchant payment endpoints publish nonce-based signature headers", () => {
  const spec = getOpenApiSpec();
  const parameters = spec.paths["/api/payment-orders"]?.post?.parameters ?? [];
  const headerNames = parameters.map((parameter) => parameter.name);
  const signatureHeader = parameters.find(
    (parameter) => parameter.name === "x-novapay-signature",
  );
  const idempotencyHeader = parameters.find(
    (parameter) => parameter.name === "Idempotency-Key",
  );

  assert.deepEqual(headerNames, [
    "x-novapay-key",
    "x-novapay-timestamp",
    "x-novapay-nonce",
    "x-novapay-signature",
    "Idempotency-Key",
  ]);
  assert.match(String(signatureHeader?.description ?? ""), /\{timestamp\}\.\{nonce\}\.\{rawBody\}/);
  assert.match(String(idempotencyHeader?.description ?? ""), /幂等|idempotency/i);
});

test("merchant payment schemas expose fee and net amount fields", () => {
  const spec = getOpenApiSpec();
  const orderSchema =
    spec.components.schemas.PaymentOrderResponse.properties.order.properties;
  const refundSchema =
    spec.components.schemas.PaymentRefundResponse.properties.refund.properties;

  assert.ok(orderSchema.feeRate);
  assert.ok(orderSchema.feeAmount);
  assert.ok(orderSchema.netAmount);
  assert.ok(orderSchema.merchantChannelAccountId);
  assert.ok(orderSchema.channelAccountSource);
  assert.ok(refundSchema.feeAmount);
  assert.ok(refundSchema.netAmountImpact);
  assert.ok(refundSchema.merchantChannelAccountId);
  assert.ok(refundSchema.channelAccountSource);
  assert.equal("providerAccountId" in orderSchema, false);
  assert.equal("providerAccountId" in refundSchema, false);
});

test("merchant order request forbids public notifyUrl and documents dynamic callbacks", () => {
  const spec = getOpenApiSpec();
  const createOrderSchema = spec.components.schemas.CreateOrderRequest.properties;

  assert.equal("notifyUrl" in createOrderSchema, false);
  assert.ok(spec.paths["/api/payment-orders"]);
  assert.ok(spec.paths["/api/payment-orders/{orderReference}"]);
  assert.ok(spec.paths["/api/payment-orders/{orderReference}/close"]);
  assert.ok(spec.paths["/api/payment-orders/{orderReference}/refunds"]);
  assert.ok(spec.paths["/api/payment-refunds/{refundReference}"]);
  assert.ok(spec.paths["/api/payments/callback/alipay/{accountId}/{token}"]);
  assert.ok(spec.paths["/api/payments/callback/wxpay/{accountId}/{token}"]);
  assert.equal("/api/payments/callback/alipay" in spec.paths, false);
  assert.equal("/api/payments/callback/wxpay" in spec.paths, false);
  assert.equal("/api/payments/orders" in spec.paths, false);
  assert.equal("/api/payments/orders/query" in spec.paths, false);
  assert.equal("/api/payments/orders/close" in spec.paths, false);
  assert.equal("/api/payments/refunds" in spec.paths, false);
  assert.equal("/api/payments/refunds/query" in spec.paths, false);
  assert.equal("/api/admin/provider-accounts" in spec.paths, false);
});

test("openapi spec localizes docs-facing summaries and descriptions", () => {
  const zhSpec = getOpenApiSpec("zh");
  const enSpec = getOpenApiSpec("en");

  assert.equal(zhSpec.paths["/api/health"]?.get?.summary, "健康检查");
  assert.equal(enSpec.paths["/api/health"]?.get?.summary, "Health check");
  assert.equal(
    zhSpec.paths["/api/payment-orders/{orderReference}/refunds"]?.post?.summary,
    "创建退款",
  );
  assert.equal(
    enSpec.paths["/api/payment-orders/{orderReference}/refunds"]?.post?.summary,
    "Create refund",
  );
  assert.equal(zhSpec.servers[0]?.description, "当前 NovaPay 环境");
  assert.equal(enSpec.servers[0]?.description, "Current NovaPay environment");
});
