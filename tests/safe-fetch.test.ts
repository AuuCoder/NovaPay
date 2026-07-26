import assert from "node:assert/strict";
import test from "node:test";
import {
  createPinnedLookup,
  isBlockedCallbackAddress,
  parseSafeCallbackUrl,
  redactCallbackUrl,
} from "../lib/network/safe-fetch";

test("callback URL policy requires HTTPS on port 443 without userinfo or IP literals", () => {
  assert.throws(() => parseSafeCallbackUrl("http://example.com/callback"), /HTTPS/);
  assert.throws(() => parseSafeCallbackUrl("https://example.com:8443/callback"), /port 443/);
  assert.throws(() => parseSafeCallbackUrl("https://user:pass@example.com/callback"), /user/);
  assert.throws(() => parseSafeCallbackUrl("https://127.0.0.1/callback"), /not allowed/);
  assert.equal(parseSafeCallbackUrl("https://shop.example.com/callback").hostname, "shop.example.com");
});

test("callback address policy blocks private, loopback, link-local and metadata ranges", () => {
  for (const address of [
    "127.0.0.1",
    "10.0.0.1",
    "172.16.0.1",
    "192.168.1.1",
    "169.254.169.254",
    "100.64.0.1",
    "::1",
    "fc00::1",
    "fe80::1",
  ]) {
    assert.equal(isBlockedCallbackAddress(address), true, address);
  }

  assert.equal(isBlockedCallbackAddress("1.1.1.1"), false);
  assert.equal(isBlockedCallbackAddress("2606:4700:4700::1111"), false);
});

test("recorded callback URL drops query strings and fragments", () => {
  assert.equal(
    redactCallbackUrl("https://shop.example.com/callback?sign=secret#fragment"),
    "https://shop.example.com/callback",
  );
});

test("pinned DNS lookup honors Node's all-address callback mode", async () => {
  const lookup = createPinnedLookup({ address: "1.1.1.1", family: 4 });

  await new Promise<void>((resolve, reject) => {
    lookup("example.com", { all: true }, (error, addresses) => {
      if (error) return reject(error);
      assert.deepEqual(addresses, [{ address: "1.1.1.1", family: 4 }]);
      resolve();
    });
  });
});
