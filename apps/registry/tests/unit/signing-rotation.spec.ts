import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { sign as cryptoSign, verify as cryptoVerify, createPublicKey } from "node:crypto";

import {
  DEFAULT_RETIRED_KEY_GRACE_MS,
  createInMemorySigningKeyStore,
} from "../../lib/signing/key-store";
import {
  createLocalKeyPairAdapter,
  rotateSigningKey,
} from "../../lib/signing/rotation";
import { getTrustJsonCacheVersion } from "../../lib/signing/rotation-cache";

const ED25519_SPKI_PREFIX = Buffer.from([
  0x30, 0x2a, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x03, 0x21, 0x00,
]);

function rebuildPublicKeyFromBase64Url(b64url: string) {
  const raw = Buffer.from(b64url, "base64url");
  return createPublicKey({
    key: Buffer.concat([ED25519_SPKI_PREFIX, raw]),
    format: "der",
    type: "spki",
  });
}

describe("rotateSigningKey", () => {
  it("provisions the first ACTIVE key when the store is empty", async () => {
    const store = createInMemorySigningKeyStore();
    const adapter = createLocalKeyPairAdapter();

    const result = await rotateSigningKey({ keyId: "key-test-1" }, store, adapter);

    assert.equal(result.newActive.keyId, "key-test-1");
    assert.equal(result.newActive.status, "ACTIVE");
    assert.equal(result.retired, null);
    assert.ok(result.trustJsonCacheVersion >= 1);
  });

  it("retires the previous ACTIVE key with notAfter ≥ now + 30d", async () => {
    const store = createInMemorySigningKeyStore();
    const adapter = createLocalKeyPairAdapter();

    await rotateSigningKey({ keyId: "key-old" }, store, adapter);
    const before = Date.now();
    const result = await rotateSigningKey({ keyId: "key-new" }, store, adapter);

    assert.ok(result.retired, "previous key must be retired");
    assert.equal(result.retired?.keyId, "key-old");
    assert.equal(result.retired?.status, "RETIRED");
    const minNotAfter = before + DEFAULT_RETIRED_KEY_GRACE_MS - 1_000;
    assert.ok(
      (result.retired?.notAfter.getTime() ?? 0) >= minNotAfter,
      `notAfter must be ≥ now+30d (got ${result.retired?.notAfter.toISOString()})`,
    );
  });

  it("generates a usable Ed25519 key pair (sign + verify roundtrip)", async () => {
    const store = createInMemorySigningKeyStore();
    const adapter = createLocalKeyPairAdapter();

    const result = await rotateSigningKey({ keyId: "key-roundtrip" }, store, adapter);

    assert.ok(result.keyPair.privateKey, "local adapter must expose private key");
    const data = Buffer.from("rotation-roundtrip-payload");
    const sig = cryptoSign(null, data, result.keyPair.privateKey!);
    const pub = rebuildPublicKeyFromBase64Url(result.keyPair.publicKey);
    assert.equal(cryptoVerify(null, data, pub, sig), true);
  });

  it("bumps the trust.json cache version on every rotation", async () => {
    const store = createInMemorySigningKeyStore();
    const adapter = createLocalKeyPairAdapter();
    const baseline = getTrustJsonCacheVersion();

    const r1 = await rotateSigningKey({ keyId: `key-cache-${Date.now()}-1` }, store, adapter);
    const r2 = await rotateSigningKey({ keyId: `key-cache-${Date.now()}-2` }, store, adapter);

    assert.ok(r2.trustJsonCacheVersion > r1.trustJsonCacheVersion);
    assert.ok(r1.trustJsonCacheVersion > baseline);
  });

  it("rejects rotation with a duplicate keyId", async () => {
    const store = createInMemorySigningKeyStore();
    const adapter = createLocalKeyPairAdapter();

    await rotateSigningKey({ keyId: "key-dup" }, store, adapter);

    await assert.rejects(
      () => rotateSigningKey({ keyId: "key-dup" }, store, adapter),
      /Signing key already exists: key-dup/,
    );
  });
});
