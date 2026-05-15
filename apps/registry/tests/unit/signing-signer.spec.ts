import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, verify as cryptoVerify } from "node:crypto";

import {
  createLocalEd25519Signer,
  createSigner,
  type SignerAdapter,
} from "../../lib/signing/signer";

function generateEd25519KeyPair() {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  return { publicKey, privateKey };
}

describe("createLocalEd25519Signer", () => {
  it("produces a signature that verifies against the matching public key", async () => {
    const { publicKey, privateKey } = generateEd25519KeyPair();
    const signer = createLocalEd25519Signer({
      keyId: "key-test",
      privateKey,
    });

    const rawBytes = Buffer.from("plugin-bundle-payload", "utf8");
    const result = await signer.sign({ rawBytes, keyId: "key-test" });

    assert.equal(result.keyId, "key-test");
    const signatureBytes = Buffer.from(result.signature, "base64url");
    const valid = cryptoVerify(null, rawBytes, publicKey, signatureBytes);
    assert.equal(valid, true);
  });

  it("rejects verification when the payload is tampered", async () => {
    const { publicKey, privateKey } = generateEd25519KeyPair();
    const signer = createLocalEd25519Signer({
      keyId: "key-test",
      privateKey,
    });

    const rawBytes = Buffer.from("plugin-bundle-payload", "utf8");
    const result = await signer.sign({ rawBytes, keyId: "key-test" });
    const signatureBytes = Buffer.from(result.signature, "base64url");

    const tampered = Buffer.from(rawBytes);
    tampered[0] = tampered[0]! ^ 0xff;

    const valid = cryptoVerify(null, tampered, publicKey, signatureBytes);
    assert.equal(valid, false);
  });

  it("throws when local signer is asked to sign with a different keyId", async () => {
    const { privateKey } = generateEd25519KeyPair();
    const signer = createLocalEd25519Signer({
      keyId: "key-a",
      privateKey,
    });

    await assert.rejects(
      () => signer.sign({ rawBytes: Buffer.from("payload"), keyId: "key-b" }),
      /Local signer is configured for keyId key-a but received key-b/,
    );
  });
});

describe("createSigner with custom adapter", () => {
  it("delegates to the adapter and returns base64url signature with passthrough keyId", async () => {
    const fixedSignature = Buffer.alloc(64, 0x07);
    const adapter: SignerAdapter = {
      async signRaw({ rawBytes, keyId }) {
        assert.ok(Buffer.isBuffer(rawBytes));
        assert.equal(keyId, "key-fixed");
        return fixedSignature;
      },
    };
    const signer = createSigner({ adapter });

    const result = await signer.sign({
      rawBytes: new Uint8Array([1, 2, 3, 4]),
      keyId: "key-fixed",
    });

    assert.equal(result.keyId, "key-fixed");
    assert.equal(result.signature, fixedSignature.toString("base64url"));
    assert.match(result.signature, /^[A-Za-z0-9_-]+$/);
  });
});
