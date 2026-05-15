/**
 * Ed25519 signer abstractions for the Registry.
 *
 * Production deployments inject a `SignerAdapter` backed by a KMS / Vault
 * Transit driver so the private key never leaves the HSM. Tests and local
 * development can use `createLocalEd25519Signer`, which holds a private key
 * in process memory.
 *
 * Output contract: signatures are returned as base64url strings WITHOUT the
 * `ed25519:` prefix. Callers prefix the signature when persisting (e.g. into
 * `PluginAsset.signature`) to align with the parsing convention enforced by
 * NovaPay's `lib/plugins/signature-verify.ts`.
 */

import { sign as cryptoSign, type KeyObject } from "node:crypto";

export interface SignInput {
  rawBytes: Buffer | Uint8Array;
  keyId: string;
}

export interface SignResult {
  /** base64url encoded raw signature bytes */
  signature: string;
  keyId: string;
}

export interface Ed25519Signer {
  sign(input: SignInput): Promise<SignResult>;
}

export interface SignerAdapter {
  signRaw(input: { rawBytes: Buffer; keyId: string }): Promise<Buffer>;
}

export interface CreateSignerOptions {
  adapter: SignerAdapter;
}

function toBuffer(rawBytes: Buffer | Uint8Array): Buffer {
  return Buffer.isBuffer(rawBytes)
    ? rawBytes
    : Buffer.from(rawBytes.buffer, rawBytes.byteOffset, rawBytes.byteLength);
}

export function createSigner(options: CreateSignerOptions): Ed25519Signer {
  const { adapter } = options;
  return {
    async sign(input: SignInput): Promise<SignResult> {
      const rawBytes = toBuffer(input.rawBytes);
      const signatureBytes = await adapter.signRaw({
        rawBytes,
        keyId: input.keyId,
      });
      return {
        signature: signatureBytes.toString("base64url"),
        keyId: input.keyId,
      };
    },
  };
}

export interface CreateLocalEd25519SignerInput {
  keyId: string;
  privateKey: KeyObject;
}

/**
 * Test/dev only. Holds the private key in memory; never use in production.
 */
export function createLocalEd25519Signer(
  input: CreateLocalEd25519SignerInput,
): Ed25519Signer {
  const adapter: SignerAdapter = {
    async signRaw({ rawBytes, keyId }) {
      if (keyId !== input.keyId) {
        throw new Error(
          `Local signer is configured for keyId ${input.keyId} but received ${keyId}.`,
        );
      }
      // Ed25519 requires `algorithm` to be `null` per Node's crypto API.
      return cryptoSign(null, rawBytes, input.privateKey);
    },
  };
  return createSigner({ adapter });
}
