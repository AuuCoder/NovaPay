import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import test from "node:test";
import { alipayPageProvider } from "../lib/payments/providers/alipay-page";

const { privateKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
});

const privateKeyPem = privateKey.export({
  type: "pkcs8",
  format: "pem",
});

test("alipay page checkout url keeps charset and sign in the query string", async () => {
  const result = await alipayPageProvider.createPayment({
    orderId: "ord_test_001",
    merchant: {
      id: "mch_001",
      code: "mch_test",
      name: "Test Merchant",
      callbackBase: null,
    },
    amount: "0.01",
    currency: "CNY",
    subject: "Test Payment",
    notifyUrl: "https://gateway.example.com/api/payments/callback/alipay/acct/token",
    returnUrl: "https://merchant.example.com/payment/return",
    account: {
      id: "acct_001",
      providerKey: "alipay",
      channelCode: "alipay.page",
      displayName: "Test Alipay",
      config: {
        appId: "2026000000000000",
        privateKey: String(privateKeyPem),
      },
    },
  });

  const checkoutUrl = new URL(result.checkoutUrl);

  assert.equal(checkoutUrl.origin, "https://openapi.alipay.com");
  assert.equal(checkoutUrl.pathname, "/gateway.do");
  assert.equal(checkoutUrl.searchParams.get("charset"), "UTF-8");
  assert.equal(checkoutUrl.searchParams.get("sign_type"), "RSA2");
  assert.equal(
    checkoutUrl.searchParams.get("notify_url"),
    "https://gateway.example.com/api/payments/callback/alipay/acct/token",
  );
  assert.equal(
    checkoutUrl.searchParams.get("return_url"),
    "https://merchant.example.com/payment/return",
  );
  assert.ok(checkoutUrl.searchParams.get("sign"));
});
