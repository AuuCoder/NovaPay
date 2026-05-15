/**
 * License JWS verifier (Req 18.1–18.5).
 *
 * Verifies a compact Ed25519 JWS license against:
 *   1. JWS structural integrity
 *   2. Header `kid` resolving to a known SigningKey
 *   3. Ed25519 signature validity
 *   4. Expiration (`exp`)
 *   5. Revocation (License.state)
 *   6. Caller-supplied bindings (slug / version / instanceId / merchantId)
 *
 * Returns a structured result with explicit reason codes covering all
 * VERIFICATION_REASON values listed in the requirements.
 */

import { createHash, createPublicKey, verify as cryptoVerify } from "node:crypto";
import type { SigningKeyStore } from "../signing/key-store";

export type LicenseVerifyReason =
  | "SIGNATURE_INVALID"
  | "EXPIRED"
  | "REVOKED"
  | "INSTANCE_MISMATCH"
  | "MERCHANT_MISMATCH"
  | "SLUG_MISMATCH"
  | "VERSION_MISMATCH"
  | "UNKNOWN_LICENSE"
  | "INVALID_FORMAT"
  | "UNKNOWN_KEY";

export interface LicenseVerifyInput {
  jwsCompact: string;
  /** Expected plugin slug; verifier rejects mismatching licenses */
  expectedSlug?: string;
  /** Expected version; "*" wildcard licenses pass any version */
  expectedVersion?: string;
  /** Expected NovaPay instance ID */
  expectedInstanceId?: string;
  /** Expected merchant ID; omit when checking instance-scoped licenses */
  expectedMerchantId?: string;
  /** Override clock for testing (epoch seconds) */
  now?: number;
}

export interface LicenseClaims {
  jti: string;
  pluginSlug: string;
  version: string;
  pricingPlanKind: string;
  instanceId: string;
  merchantId?: string;
  scope: "INSTANCE" | "MERCHANT";
  iat: number;
  exp?: number;
  iss?: string;
}

export interface LicenseVerifySuccess {
  valid: true;
  claims: LicenseClaims;
  licenseKeyHash: string;
  signingKeyId: string;
}

export interface LicenseVerifyFailure {
  valid: false;
  reason: LicenseVerifyReason;
  message: string;
  /** Populated when claims could be parsed before the failure */
  claims?: LicenseClaims;
}

export type LicenseVerifyResult = LicenseVerifySuccess | LicenseVerifyFailure;

const ED25519_SPKI_PREFIX = Buffer.from([
  0x30, 0x2a, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x03, 0x21, 0x00,
]);

function base64UrlDecode(input: string): Buffer | null {
  try {
    const buf = Buffer.from(input, "base64url");
    return buf;
  } catch {
    return null;
  }
}

function buildPublicKey(rawB64Url: string) {
  const raw = base64UrlDecode(rawB64Url);
  if (!raw || raw.length !== 32) return null;
  try {
    return createPublicKey({
      key: Buffer.concat([ED25519_SPKI_PREFIX, raw]),
      format: "der",
      type: "spki",
    });
  } catch {
    return null;
  }
}

function parseJwsCompact(jwsCompact: string): {
  header: Record<string, unknown>;
  claims: LicenseClaims;
  signingInput: Buffer;
  signatureBytes: Buffer;
} | null {
  const parts = jwsCompact.split(".");
  if (parts.length !== 3) return null;
  const [headerB64, payloadB64, signatureB64] = parts;
  const headerBuf = base64UrlDecode(headerB64!);
  const payloadBuf = base64UrlDecode(payloadB64!);
  const signatureBytes = base64UrlDecode(signatureB64!);
  if (!headerBuf || !payloadBuf || !signatureBytes) return null;

  let header: Record<string, unknown>;
  let claims: LicenseClaims;
  try {
    header = JSON.parse(headerBuf.toString("utf8")) as Record<string, unknown>;
    claims = JSON.parse(payloadBuf.toString("utf8")) as LicenseClaims;
  } catch {
    return null;
  }

  return {
    header,
    claims,
    signingInput: Buffer.from(`${headerB64}.${payloadB64}`, "ascii"),
    signatureBytes,
  };
}

export interface RevocationLookup {
  /**
   * Returns true when the license (by jti or licenseKeyHash) has been
   * revoked. Should be cheap (in-memory cache backed by License.state).
   */
  isRevoked(licenseKeyHash: string): Promise<boolean>;
}

export async function verifyLicense(
  input: LicenseVerifyInput,
  keyStore: SigningKeyStore,
  revocations?: RevocationLookup,
): Promise<LicenseVerifyResult> {
  const parsed = parseJwsCompact(input.jwsCompact);
  if (!parsed) {
    return {
      valid: false,
      reason: "INVALID_FORMAT",
      message: "License JWS is not in compact form (header.payload.signature).",
    };
  }

  const { header, claims, signingInput, signatureBytes } = parsed;
  const kid = typeof header.kid === "string" ? header.kid : null;
  if (!kid) {
    return {
      valid: false,
      reason: "INVALID_FORMAT",
      message: "License JWS header is missing kid.",
      claims,
    };
  }

  const key = await keyStore.getByKeyId(kid);
  if (!key) {
    return {
      valid: false,
      reason: "UNKNOWN_KEY",
      message: `No registered signing key for kid=${kid}.`,
      claims,
    };
  }

  const pub = buildPublicKey(key.publicKey);
  if (!pub) {
    return {
      valid: false,
      reason: "UNKNOWN_KEY",
      message: "Registered signing key has invalid public key bytes.",
      claims,
    };
  }

  const sigOk = cryptoVerify(null, signingInput, pub, signatureBytes);
  if (!sigOk) {
    return {
      valid: false,
      reason: "SIGNATURE_INVALID",
      message: "Ed25519 signature does not match the license payload.",
      claims,
    };
  }

  const now = input.now ?? Math.floor(Date.now() / 1000);
  if (typeof claims.exp === "number" && claims.exp < now) {
    return {
      valid: false,
      reason: "EXPIRED",
      message: `License expired at ${new Date(claims.exp * 1000).toISOString()}.`,
      claims,
    };
  }

  if (input.expectedSlug && claims.pluginSlug !== input.expectedSlug) {
    return {
      valid: false,
      reason: "SLUG_MISMATCH",
      message: `License slug=${claims.pluginSlug} does not match expected=${input.expectedSlug}.`,
      claims,
    };
  }

  if (
    input.expectedVersion &&
    claims.version !== "*" &&
    claims.version !== input.expectedVersion
  ) {
    return {
      valid: false,
      reason: "VERSION_MISMATCH",
      message: `License version=${claims.version} does not match expected=${input.expectedVersion}.`,
      claims,
    };
  }

  if (input.expectedInstanceId && claims.instanceId !== input.expectedInstanceId) {
    return {
      valid: false,
      reason: "INSTANCE_MISMATCH",
      message: `License instanceId mismatch.`,
      claims,
    };
  }

  if (
    claims.scope === "MERCHANT" &&
    input.expectedMerchantId &&
    claims.merchantId !== input.expectedMerchantId
  ) {
    return {
      valid: false,
      reason: "MERCHANT_MISMATCH",
      message: `License merchantId mismatch.`,
      claims,
    };
  }

  const licenseKeyHash = createHash("sha256")
    .update(input.jwsCompact)
    .digest("hex");

  if (revocations) {
    const revoked = await revocations.isRevoked(licenseKeyHash);
    if (revoked) {
      return {
        valid: false,
        reason: "REVOKED",
        message: "License has been revoked by the Registry.",
        claims,
      };
    }
  }

  return {
    valid: true,
    claims,
    licenseKeyHash,
    signingKeyId: kid,
  };
}
