import assert from "node:assert/strict";
import { generateKeyPairSync, sign as cryptoSign } from "node:crypto";
import test from "node:test";
import {
  decodeEd25519SignatureString,
  verifyEd25519Signature,
} from "../lib/plugins/signature-verify";

interface TestKeyMaterial {
  publicKey: string;
  signature: string;
  rawBytes: Buffer;
  rawSignatureBytes: Buffer;
}

function generateSignedFixture(payload: string): TestKeyMaterial {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");

  const spkiDer = publicKey.export({ type: "spki", format: "der" });
  // Ed25519 SPKI DER is exactly 12 bytes of prefix + 32 bytes of key.
  const rawPublicKeyBytes = spkiDer.subarray(spkiDer.length - 32);

  const rawBytes = Buffer.from(payload, "utf8");
  const signatureBytes = cryptoSign(null, rawBytes, privateKey);

  return {
    publicKey: Buffer.from(rawPublicKeyBytes).toString("base64url"),
    signature: `ed25519:${signatureBytes.toString("base64url")}`,
    rawBytes,
    rawSignatureBytes: signatureBytes,
  };
}

test("verifyEd25519Signature returns valid:true for a correct signature", () => {
  const fixture = generateSignedFixture("plugin-bundle-payload");

  const result = verifyEd25519Signature({
    rawBytes: fixture.rawBytes,
    signature: fixture.signature,
    publicKey: fixture.publicKey,
    keyId: "key-2025-q1",
  });

  assert.equal(result.valid, true);
  assert.equal(result.errorCode, undefined);
  assert.equal(result.errorMessage, undefined);
  assert.equal(result.keyId, "key-2025-q1");
});

test("verifyEd25519Signature returns SIGNATURE_MISMATCH when payload is tampered", () => {
  const fixture = generateSignedFixture("plugin-bundle-payload");
  const tamperedBytes = Buffer.from(fixture.rawBytes);
  tamperedBytes[0] = tamperedBytes[0] ^ 0xff;

  const result = verifyEd25519Signature({
    rawBytes: tamperedBytes,
    signature: fixture.signature,
    publicKey: fixture.publicKey,
    keyId: null,
  });

  assert.equal(result.valid, false);
  assert.equal(result.errorCode, "SIGNATURE_MISMATCH");
  assert.equal(result.keyId, null);
});

test("verifyEd25519Signature returns SIGNATURE_FORMAT_INVALID when ed25519: prefix is missing", () => {
  const fixture = generateSignedFixture("plugin-bundle-payload");
  const stripped = fixture.signature.slice("ed25519:".length);

  const result = verifyEd25519Signature({
    rawBytes: fixture.rawBytes,
    signature: stripped,
    publicKey: fixture.publicKey,
  });

  assert.equal(result.valid, false);
  assert.equal(result.errorCode, "SIGNATURE_FORMAT_INVALID");
  assert.equal(result.keyId, null);
});

test("verifyEd25519Signature returns SIGNATURE_FORMAT_INVALID when payload is not base64url", () => {
  const fixture = generateSignedFixture("plugin-bundle-payload");

  const result = verifyEd25519Signature({
    rawBytes: fixture.rawBytes,
    signature: "ed25519:not*valid*base64url!!!",
    publicKey: fixture.publicKey,
  });

  assert.equal(result.valid, false);
  assert.equal(result.errorCode, "SIGNATURE_FORMAT_INVALID");
});

test("verifyEd25519Signature returns PUBLIC_KEY_FORMAT_INVALID when key is the wrong length", () => {
  const fixture = generateSignedFixture("plugin-bundle-payload");
  const shortKey = Buffer.alloc(16, 0x01).toString("base64url");

  const result = verifyEd25519Signature({
    rawBytes: fixture.rawBytes,
    signature: fixture.signature,
    publicKey: shortKey,
  });

  assert.equal(result.valid, false);
  assert.equal(result.errorCode, "PUBLIC_KEY_FORMAT_INVALID");
});

test("verifyEd25519Signature returns PUBLIC_KEY_FORMAT_INVALID for non base64url public key", () => {
  const fixture = generateSignedFixture("plugin-bundle-payload");

  const result = verifyEd25519Signature({
    rawBytes: fixture.rawBytes,
    signature: fixture.signature,
    publicKey: "this is not a key",
  });

  assert.equal(result.valid, false);
  assert.equal(result.errorCode, "PUBLIC_KEY_FORMAT_INVALID");
});

test("verifyEd25519Signature accepts string payloads as utf8", () => {
  const fixture = generateSignedFixture("string-payload-roundtrip");

  const result = verifyEd25519Signature({
    rawBytes: "string-payload-roundtrip",
    signature: fixture.signature,
    publicKey: fixture.publicKey,
  });

  assert.equal(result.valid, true);
});

test("verifyEd25519Signature accepts Uint8Array payloads", () => {
  const fixture = generateSignedFixture("uint8-payload-roundtrip");
  const view = new Uint8Array(fixture.rawBytes);

  const result = verifyEd25519Signature({
    rawBytes: view,
    signature: fixture.signature,
    publicKey: fixture.publicKey,
  });

  assert.equal(result.valid, true);
});

test("verifyEd25519Signature surfaces keyId embedded in the signature string", () => {
  const fixture = generateSignedFixture("with-key-id");
  const embeddedSignature = `ed25519:key-2025-q1:${fixture.rawSignatureBytes.toString("base64url")}`;

  const result = verifyEd25519Signature({
    rawBytes: fixture.rawBytes,
    signature: embeddedSignature,
    publicKey: fixture.publicKey,
    keyId: null,
  });

  assert.equal(result.valid, true);
  assert.equal(result.keyId, "key-2025-q1");
});

test("decodeEd25519SignatureString supports plain ed25519:<b64> form", () => {
  const fixture = generateSignedFixture("decode-plain");
  const decoded = decodeEd25519SignatureString(fixture.signature);

  assert.ok(decoded);
  assert.equal(decoded?.keyId, null);
  assert.equal(decoded?.signatureBytes.length, 64);
  assert.equal(
    decoded?.signatureBytes.toString("base64url"),
    fixture.rawSignatureBytes.toString("base64url"),
  );
});

test("decodeEd25519SignatureString supports ed25519:<keyId>:<b64> form", () => {
  const fixture = generateSignedFixture("decode-with-key-id");
  const value = `ed25519:key-2025-q1:${fixture.rawSignatureBytes.toString("base64url")}`;

  const decoded = decodeEd25519SignatureString(value);

  assert.ok(decoded);
  assert.equal(decoded?.keyId, "key-2025-q1");
  assert.equal(
    decoded?.signatureBytes.toString("base64url"),
    fixture.rawSignatureBytes.toString("base64url"),
  );
});

test("decodeEd25519SignatureString returns null for malformed input", () => {
  assert.equal(decodeEd25519SignatureString("not-ed25519:abc"), null);
  assert.equal(decodeEd25519SignatureString("ed25519:"), null);
  assert.equal(decodeEd25519SignatureString("ed25519::abc"), null);
  assert.equal(decodeEd25519SignatureString("ed25519:keyOnly:"), null);
  assert.equal(decodeEd25519SignatureString("ed25519:!!!not-base64!!!"), null);
});
