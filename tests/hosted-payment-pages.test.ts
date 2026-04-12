import assert from "node:assert/strict";
import test from "node:test";
import {
  buildHostedPaymentReturnPath,
  buildHostedPaymentReturnUrl,
} from "../lib/payments/hosted-pages";

test("hosted payment return path targets the NovaPay hosted result page", () => {
  assert.equal(buildHostedPaymentReturnPath("ord_123"), "/pay/ord_123/return");
});

test("hosted payment return url uses public base url", () => {
  const previousBaseUrl = process.env.NOVAPAY_PUBLIC_BASE_URL;
  process.env.NOVAPAY_PUBLIC_BASE_URL = "https://gateway.example.com";

  try {
    assert.equal(
      buildHostedPaymentReturnUrl("ord_456"),
      "https://gateway.example.com/pay/ord_456/return",
    );
  } finally {
    if (previousBaseUrl === undefined) {
      delete process.env.NOVAPAY_PUBLIC_BASE_URL;
    } else {
      process.env.NOVAPAY_PUBLIC_BASE_URL = previousBaseUrl;
    }
  }
});
