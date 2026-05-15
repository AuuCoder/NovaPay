import { createPublicKey, verify as cryptoVerify } from "node:crypto";

export type SignatureVerifyErrorCode =
  | "SIGNATURE_FORMAT_INVALID"
  | "PUBLIC_KEY_FORMAT_INVALID"
  | "SIGNATURE_MISMATCH"
  | "VERIFY_INTERNAL_ERROR";

export interface SignatureVerifyResult {
  valid: boolean;
  errorCode?: SignatureVerifyErrorCode;
  errorMessage?: string;
  keyId?: string | null;
}

export interface VerifyEd25519SignatureInput {
  rawBytes: Buffer | Uint8Array | string;
  signature: string;
  publicKey: string;
  keyId?: string | null;
}

const ED25519_SIGNATURE_PREFIX = "ed25519:";
const ED25519_PUBLIC_KEY_BYTE_LENGTH = 32;
const ED25519_SIGNATURE_BYTE_LENGTH = 64;

// SPKI DER prefix for an Ed25519 public key (12 bytes), followed by the raw 32-byte key.
const ED25519_SPKI_PREFIX = Buffer.from([
  0x30, 0x2a, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x03, 0x21, 0x00,
]);

function isLikelyBase64Url(value: string) {
  return /^[A-Za-z0-9_-]+$/.test(value);
}

function decodeBase64Url(value: string): Buffer | null {
  if (!value || !isLikelyBase64Url(value)) {
    return null;
  }

  try {
    const buffer = Buffer.from(value, "base64url");

    if (buffer.length === 0) {
      return null;
    }

    return buffer;
  } catch {
    return null;
  }
}

function toBuffer(rawBytes: Buffer | Uint8Array | string): Buffer {
  if (typeof rawBytes === "string") {
    return Buffer.from(rawBytes, "utf8");
  }

  if (Buffer.isBuffer(rawBytes)) {
    return rawBytes;
  }

  return Buffer.from(rawBytes.buffer, rawBytes.byteOffset, rawBytes.byteLength);
}

/**
 * Parses a signature string of the form `ed25519:<base64url>` or
 * `ed25519:<keyId>:<base64url>`. Returns null if the format is not recognised.
 */
export function decodeEd25519SignatureString(
  value: string,
): { keyId: string | null; signatureBytes: Buffer } | null {
  if (typeof value !== "string" || !value.startsWith(ED25519_SIGNATURE_PREFIX)) {
    return null;
  }

  const remainder = value.slice(ED25519_SIGNATURE_PREFIX.length);

  if (!remainder) {
    return null;
  }

  const colonIndex = remainder.indexOf(":");

  if (colonIndex === -1) {
    const signatureBytes = decodeBase64Url(remainder);

    if (!signatureBytes) {
      return null;
    }

    return { keyId: null, signatureBytes };
  }

  const keyId = remainder.slice(0, colonIndex);
  const signaturePart = remainder.slice(colonIndex + 1);

  if (!keyId || !signaturePart) {
    return null;
  }

  const signatureBytes = decodeBase64Url(signaturePart);

  if (!signatureBytes) {
    return null;
  }

  return { keyId, signatureBytes };
}

function buildEd25519PublicKey(rawPublicKey: string) {
  const rawBytes = decodeBase64Url(rawPublicKey);

  if (!rawBytes || rawBytes.length !== ED25519_PUBLIC_KEY_BYTE_LENGTH) {
    return null;
  }

  const derBytes = Buffer.concat([ED25519_SPKI_PREFIX, rawBytes]);

  try {
    return createPublicKey({ key: derBytes, format: "der", type: "spki" });
  } catch {
    return null;
  }
}

export function verifyEd25519Signature(
  input: VerifyEd25519SignatureInput,
): SignatureVerifyResult {
  const keyId = input.keyId ?? null;

  if (typeof input.signature !== "string" || !input.signature.startsWith(ED25519_SIGNATURE_PREFIX)) {
    return {
      valid: false,
      errorCode: "SIGNATURE_FORMAT_INVALID",
      errorMessage: "Signature must start with the 'ed25519:' prefix.",
      keyId,
    };
  }

  const decoded = decodeEd25519SignatureString(input.signature);

  if (!decoded) {
    return {
      valid: false,
      errorCode: "SIGNATURE_FORMAT_INVALID",
      errorMessage: "Signature payload is not valid base64url.",
      keyId,
    };
  }

  if (decoded.signatureBytes.length !== ED25519_SIGNATURE_BYTE_LENGTH) {
    return {
      valid: false,
      errorCode: "SIGNATURE_FORMAT_INVALID",
      errorMessage: `Ed25519 signature must be ${ED25519_SIGNATURE_BYTE_LENGTH} bytes; got ${decoded.signatureBytes.length}.`,
      keyId: decoded.keyId ?? keyId,
    };
  }

  const publicKey = buildEd25519PublicKey(input.publicKey);

  if (!publicKey) {
    return {
      valid: false,
      errorCode: "PUBLIC_KEY_FORMAT_INVALID",
      errorMessage: `Public key must be a base64url-encoded raw ${ED25519_PUBLIC_KEY_BYTE_LENGTH}-byte Ed25519 key.`,
      keyId: decoded.keyId ?? keyId,
    };
  }

  const data = toBuffer(input.rawBytes);
  const resolvedKeyId = decoded.keyId ?? keyId;

  try {
    const isValid = cryptoVerify(null, data, publicKey, decoded.signatureBytes);

    if (!isValid) {
      return {
        valid: false,
        errorCode: "SIGNATURE_MISMATCH",
        errorMessage: "Ed25519 signature does not match the provided payload and public key.",
        keyId: resolvedKeyId,
      };
    }

    return { valid: true, keyId: resolvedKeyId };
  } catch (error) {
    return {
      valid: false,
      errorCode: "VERIFY_INTERNAL_ERROR",
      errorMessage: error instanceof Error ? error.message : String(error),
      keyId: resolvedKeyId,
    };
  }
}
