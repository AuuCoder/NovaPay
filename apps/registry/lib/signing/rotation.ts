/**
 * Signing key rotation orchestration (Req 19.2, 19.3).
 *
 * Wraps `SigningKeyStore.rotate` so the admin route can:
 *   - generate a fresh Ed25519 keypair
 *   - persist the public key + KMS reference
 *   - mark the previous ACTIVE key RETIRED with notAfter ≥ now + 30d
 *   - bump the trust.json cache version so consumers refetch immediately
 *
 * Phase 3 keeps private-key generation in process for tests; production
 * deployments will swap `generateKeyPairAdapter` to call the configured KMS.
 */

import { generateKeyPairSync, type KeyObject } from "node:crypto";
import {
  DEFAULT_RETIRED_KEY_GRACE_MS,
  type RotationResult,
  type SigningKeyStore,
} from "./key-store";
import { bumpTrustJsonCacheVersion } from "./rotation-cache";

export interface RotationKeyPair {
  keyId: string;
  /** base64url raw 32-byte Ed25519 public key */
  publicKey: string;
  /** Optional KMS / Vault Transit identifier; null for local in-process keys */
  kmsKeyArn: string | null;
  /** Optional KeyObject when the key was generated locally (for testing) */
  privateKey?: KeyObject;
}

export interface KeyPairAdapter {
  generate(input: { keyId: string }): Promise<RotationKeyPair>;
}

export interface RotateSigningKeyInput {
  keyId: string;
  notBefore?: Date;
  notAfter?: Date;
  /**
   * Force a minimum grace window for the previous ACTIVE key. Defaults to
   * 30 days, satisfying Req 19.3.
   */
  minRetiredGraceMs?: number;
}

export interface RotateSigningKeyResult extends RotationResult {
  /** Bumped after the rotation succeeds; consumers can use this for ETag-based cache busting. */
  trustJsonCacheVersion: number;
}

/**
 * Local key-pair adapter — generates an Ed25519 key pair in process.
 * NOT FOR PRODUCTION. Production deployments must inject a KMS-backed adapter.
 */
export function createLocalKeyPairAdapter(): KeyPairAdapter {
  return {
    async generate({ keyId }) {
      const { publicKey, privateKey } = generateKeyPairSync("ed25519");
      const spkiDer = publicKey.export({ type: "spki", format: "der" });
      // Last 32 bytes of the SPKI DER are the raw public key.
      const rawPublicKey = Buffer.from(spkiDer.subarray(spkiDer.length - 32));
      return {
        keyId,
        publicKey: rawPublicKey.toString("base64url"),
        kmsKeyArn: null,
        privateKey,
      };
    },
  };
}

/**
 * Default validity window for newly minted signing keys: 90 days. Production
 * deployments can override via `input.notAfter`.
 */
const DEFAULT_KEY_VALIDITY_MS = 90 * 24 * 60 * 60 * 1000;

export async function rotateSigningKey(
  input: RotateSigningKeyInput,
  store: SigningKeyStore,
  adapter: KeyPairAdapter,
): Promise<RotateSigningKeyResult & { keyPair: RotationKeyPair }> {
  const now = new Date();
  const notBefore = input.notBefore ?? now;
  const notAfter =
    input.notAfter ?? new Date(notBefore.getTime() + DEFAULT_KEY_VALIDITY_MS);

  const keyPair = await adapter.generate({ keyId: input.keyId });

  const rotation = await store.rotate({
    newKey: {
      keyId: keyPair.keyId,
      alg: "Ed25519",
      publicKey: keyPair.publicKey,
      kmsKeyArn: keyPair.kmsKeyArn,
      notBefore,
      notAfter,
    },
    minRetiredGraceMs: input.minRetiredGraceMs ?? DEFAULT_RETIRED_KEY_GRACE_MS,
  });

  const trustJsonCacheVersion = bumpTrustJsonCacheVersion();

  return {
    ...rotation,
    trustJsonCacheVersion,
    keyPair,
  };
}
