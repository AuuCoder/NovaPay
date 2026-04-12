import assert from "node:assert/strict";
import test from "node:test";
import {
  buildMerchantChannelCallbackPath,
  buildMerchantChannelCallbackUrl,
  generateMerchantChannelCallbackToken,
  getMerchantChannelTemplates,
} from "../lib/merchant-channel-accounts";

test("merchant channel callback token uses stable prefix", () => {
  const token = generateMerchantChannelCallbackToken();

  assert.match(token, /^mct_[A-Za-z0-9_-]+$/);
});

test("merchant channel callback path matches channel type", () => {
  assert.equal(
    buildMerchantChannelCallbackPath("alipay.page", "acct_alipay", "token_a"),
    "/api/payments/callback/alipay/acct_alipay/token_a",
  );
  assert.equal(
    buildMerchantChannelCallbackPath("wxpay.native", "acct_wxpay", "token_b"),
    "/api/payments/callback/wxpay/acct_wxpay/token_b",
  );
});

test("merchant channel callback url uses public base url", () => {
  const previousBaseUrl = process.env.NOVAPAY_PUBLIC_BASE_URL;
  process.env.NOVAPAY_PUBLIC_BASE_URL = "https://gateway.example.com";

  try {
    assert.equal(
      buildMerchantChannelCallbackUrl("alipay.page", "acct_123", "token_456"),
      "https://gateway.example.com/api/payments/callback/alipay/acct_123/token_456",
    );
  } finally {
    if (previousBaseUrl === undefined) {
      delete process.env.NOVAPAY_PUBLIC_BASE_URL;
    } else {
      process.env.NOVAPAY_PUBLIC_BASE_URL = previousBaseUrl;
    }
  }
});

test("merchant channel templates do not expose gateway endpoint overrides to merchants", () => {
  for (const locale of ["zh", "en"] as const) {
    const templates = getMerchantChannelTemplates(locale);

    for (const template of templates) {
      const keys = template.fields.map((field) => field.key);

      assert.equal(keys.includes("gatewayUrl"), false);
      assert.equal(keys.includes("apiBaseUrl"), false);
    }
  }
});
