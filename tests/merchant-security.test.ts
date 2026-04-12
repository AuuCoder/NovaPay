import assert from "node:assert/strict";
import test from "node:test";
import { createHmac } from "node:crypto";
import {
  assertMerchantRequestIpAllowed,
  parseIpWhitelist,
} from "../lib/merchants/security";
import { createMerchantRequestSignature } from "../lib/merchants/signature";

test("merchant request signature uses timestamp nonce and raw body", () => {
  const secret = "nps_test_secret";
  const timestamp = "2026-04-11T10:00:00Z";
  const nonce = "nonce_20260411_0001";
  const rawBody = '{"merchantCode":"m1","amount":"88.00"}';
  const expected = createHmac("sha256", secret)
    .update(`${timestamp}.${nonce}.${rawBody}`)
    .digest("hex");

  assert.equal(
    createMerchantRequestSignature(secret, timestamp, rawBody, nonce),
    expected,
  );
  assert.notEqual(
    createMerchantRequestSignature(secret, timestamp, rawBody, `${nonce}_other`),
    expected,
  );
});

test("ip whitelist parser normalizes ipv4 mapped addresses", () => {
  assert.deepEqual(parseIpWhitelist("127.0.0.1\n10.0.0.8, ::ffff:192.168.1.9"), [
    "127.0.0.1",
    "10.0.0.8",
    "192.168.1.9",
  ]);
});

test("ip whitelist rejects non-whitelisted client ip", () => {
  assert.throws(
    () =>
      assertMerchantRequestIpAllowed({
        merchantCode: "merchant-prod",
        clientIp: "10.0.0.8",
        apiIpWhitelist: "127.0.0.1",
      }),
    /rejected request IP 10.0.0.8/,
  );
});

test("ip whitelist allows matching client ip", () => {
  assert.doesNotThrow(() =>
    assertMerchantRequestIpAllowed({
      merchantCode: "merchant-prod",
      clientIp: "127.0.0.1",
      apiIpWhitelist: "127.0.0.1\n10.0.0.8",
    }),
  );
});
