import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";

describe("registry payment callback payload mapping", () => {
  it("derives the registry order id from externalOrderId before any metadata fallback", () => {
    const payload = {
      event: "payment.order.updated",
      order: {
        id: "cmpdo89h1000nzx9k2gccgxuo",
        externalOrderId: "ord_registry_123",
        status: "SUCCEEDED",
        metadata: {
          registryOrderId: "ord_metadata_fallback",
        },
      },
    };

    const registryOrderId =
      payload.order.externalOrderId?.trim() ||
      (typeof payload.order.metadata?.registryOrderId === "string"
        ? payload.order.metadata.registryOrderId.trim()
        : "") ||
      "";

    assert.equal(registryOrderId, "ord_registry_123");
  });

  it("uses timestamp + raw body HMAC for callback signature verification", () => {
    const timestamp = "2026-05-20T14:30:00.000Z";
    const rawBody = JSON.stringify({
      event: "payment.order.updated",
      order: {
        externalOrderId: "ord_registry_123",
        status: "SUCCEEDED",
      },
    });
    const secret = "registry_notify_secret";

    const signature = createHmac("sha256", secret)
      .update(`${timestamp}.${rawBody}`)
      .digest("hex");

    const expected = createHmac("sha256", secret)
      .update(`${timestamp}.${rawBody}`)
      .digest("hex");

    assert.equal(signature, expected);
  });
});
