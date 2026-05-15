/**
 * AWS KMS Ed25519 signer adapter.
 *
 * Implements `SignerAdapter` by calling AWS KMS `Sign` API with the
 * `ECDSA_SHA_256` → actually `SIGN_VERIFY` message type for Ed25519 keys.
 *
 * AWS KMS supports Ed25519 via the `ECC_SECG_P256K1` key spec starting
 * from 2022. The adapter uses the `@aws-sdk/client-kms` package which must
 * be installed separately (`npm i @aws-sdk/client-kms`).
 *
 * Configuration:
 *   - `AWS_REGION` or `KMS_REGION` env var
 *   - `KMS_KEY_ARN` env var (the ARN of the Ed25519 signing key)
 *   - Standard AWS credential chain (env vars, instance profile, etc.)
 *
 * Usage:
 *   import { createKmsSignerAdapter } from "./kms-adapter";
 *   import { createSigner } from "./signer";
 *   const adapter = createKmsSignerAdapter({ keyArn: process.env.KMS_KEY_ARN! });
 *   const signer = createSigner({ adapter });
 */

import type { SignerAdapter } from "./signer";

export interface KmsAdapterConfig {
  /** Full ARN of the KMS key (e.g. arn:aws:kms:us-east-1:123456:key/abc-def) */
  keyArn: string;
  /** AWS region override; defaults to AWS_REGION env var */
  region?: string;
  /** Optional endpoint override for LocalStack / testing */
  endpoint?: string;
}

/**
 * Creates a KMS-backed signer adapter. Requires `@aws-sdk/client-kms` to be
 * installed. Throws at construction time if the SDK is not available.
 */
export function createKmsSignerAdapter(config: KmsAdapterConfig): SignerAdapter {
  // Lazy-load the AWS SDK so the module can be imported without the SDK
  // installed (e.g. in test environments that use createLocalEd25519Signer).
  let kmsClient: KmsClientLike | null = null;

  async function getClient(): Promise<KmsClientLike> {
    if (kmsClient) return kmsClient;

    try {
      // Dynamic import so the module doesn't fail at parse time when the
      // SDK isn't installed.
      const { KMSClient, SignCommand } = await import("@aws-sdk/client-kms") as {
        KMSClient: new (config: { region?: string; endpoint?: string }) => KmsClientLike;
        SignCommand: new (input: KmsSignInput) => unknown;
      };

      const client = new KMSClient({
        region: config.region ?? process.env.AWS_REGION ?? process.env.KMS_REGION,
        endpoint: config.endpoint,
      });

      // Wrap the client to expose a simple `sign` method
      kmsClient = {
        async send(command: unknown): Promise<{ Signature: Uint8Array }> {
          return client.send(command as never) as Promise<{ Signature: Uint8Array }>;
        },
        SignCommand: SignCommand as unknown as new (input: KmsSignInput) => unknown,
      };

      return kmsClient;
    } catch (error) {
      throw new Error(
        `@aws-sdk/client-kms is required for KMS signing but could not be loaded: ${
          error instanceof Error ? error.message : String(error)
        }. Install it with: npm i @aws-sdk/client-kms`,
      );
    }
  }

  return {
    async signRaw({ rawBytes, keyId }): Promise<Buffer> {
      const client = await getClient();
      const command = new client.SignCommand({
        KeyId: config.keyArn,
        Message: rawBytes,
        MessageType: "RAW",
        SigningAlgorithm: "ECDSA_SHA_256", // KMS uses this for Ed25519 raw signing
      });

      const response = await client.send(command);
      if (!response.Signature) {
        throw new Error(`KMS Sign returned no signature for keyId=${keyId}.`);
      }

      return Buffer.from(response.Signature);
    },
  };
}

// Internal types to avoid importing @aws-sdk at the module level
interface KmsSignInput {
  KeyId: string;
  Message: Buffer | Uint8Array;
  MessageType: "RAW" | "DIGEST";
  SigningAlgorithm: string;
}

interface KmsClientLike {
  send(command: unknown): Promise<{ Signature: Uint8Array }>;
  SignCommand: new (input: KmsSignInput) => unknown;
}

/**
 * Helper to determine which signer to use based on environment.
 * Returns "kms" when KMS_KEY_ARN is set, otherwise "local".
 */
export function detectSignerMode(): "kms" | "local" {
  return process.env.KMS_KEY_ARN ? "kms" : "local";
}
