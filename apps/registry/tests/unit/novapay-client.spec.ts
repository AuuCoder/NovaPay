import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { NovaPayClient } from "../../lib/payments/novapay-client";

describe("NovaPayClient", () => {
  it("verifies callback signatures using timestamp + body HMAC", () => {
    const client = new NovaPayClient({
      baseUrl: "http://localhost:3000",
      merchantId: "merchant-registry",
      apiKeyId: "key-id",
      apiKeySecret: "test-secret",
    });

    const payload = {
      externalOrderId: "ord_123",
      novapayOrderId: "np_123",
      status: "PAID" as const,
      amountCents: 9900,
      paidAt: "2026-05-20T10:00:00.000Z",
      timestamp: "2026-05-20T10:00:01.000Z",
    };

    const body = JSON.stringify(payload);
    const signature = createHmac("sha256", "test-secret")
      .update(`${payload.timestamp}.${body}`)
      .digest("hex");

    assert.equal(client.verifyCallbackSignature(payload, signature), true);
    assert.equal(client.verifyCallbackSignature(payload, "deadbeef"), false);
  });
});
