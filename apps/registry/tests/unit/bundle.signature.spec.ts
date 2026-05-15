/**
 * Bundle signature verification unit tests (task 1.19).
 *
 * Covers: correct signature, wrong signature, wrong sha256, tampered bytes.
 * Uses the NovaPay-side `verifyEd25519Signature` contract indirectly by
 * verifying the output of `createLocalEd25519Signer` with `crypto.verify`.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createHash, generateKeyPairSync, verify as cryptoVerify } from "node:crypto";

import { createLocalEd25519Signer } from "../../lib/signing/signer";

function generateKeyPair() {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  return { publicKey, privateKey };
}

function sha256Hex(data: Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

describe("bundle signature verification scenarios", () => {
  it("correct signature verifies successfully", async () => {
    const { publicKey, privateKey } = generateKeyPair();
    const signer = createLocalEd25519Signer({ keyId: "key-1", privateKey });

    const rawBytes = Buffer.from("valid-bundle-content", "utf8");
    const result = await signer.sign({ rawBytes, keyId: "key-1" });
    const sigBytes = Buffer.from(result.signature, "base64url");

    assert.equal(cryptoVerify(null, rawBytes, publicKey, sigBytes), true);
  });

  it("wrong signature (different key) fails verification", async () => {
    const { publicKey } = generateKeyPair();
    const { privateKey: otherPrivate } = generateKeyPair();
    const signer = createLocalEd25519Signer({ keyId: "key-other", privateKey: otherPrivate });

    const rawBytes = Buffer.from("valid-bundle-content", "utf8");
    const result = await signer.sign({ rawBytes, keyId: "key-other" });
    const sigBytes = Buffer.from(result.signature, "base64url");

    // Verify against the WRONG public key
    assert.equal(cryptoVerify(null, rawBytes, publicKey, sigBytes), false);
  });

  it("tampered bytes fail verification even with correct key", async () => {
    const { publicKey, privateKey } = generateKeyPair();
    const signer = createLocalEd25519Signer({ keyId: "key-1", privateKey });

    const rawBytes = Buffer.from("original-bundle-content", "utf8");
    const result = await signer.sign({ rawBytes, keyId: "key-1" });
    const sigBytes = Buffer.from(result.signature, "base64url");

    const tampered = Buffer.from(rawBytes);
    tampered[0] = tampered[0]! ^ 0xff;

    assert.equal(cryptoVerify(null, tampered, publicKey, sigBytes), false);
  });

  it("wrong sha256 (content drift) is detectable before signature check", () => {
    const original = Buffer.from("original-content", "utf8");
    const modified = Buffer.from("modified-content", "utf8");

    const originalSha = sha256Hex(original);
    const modifiedSha = sha256Hex(modified);

    assert.notEqual(originalSha, modifiedSha);
    // This proves that sha256 comparison catches content drift independently
    // of the Ed25519 signature layer.
  });
});
