/**
 * License JWS issuer (Req 13.2, 18.1, 19.1).
 *
 * Issues compact Ed25519 JWS tokens (RFC 7515) representing licenses bound to
 * a specific NovaPay instance and (optionally) merchant. The Registry signs
 * with the active SigningKey; consumers verify offline using public keys
 * served via /.well-known/trust.json.
 *
 * The JWS payload is the canonical license JSON (sorted keys, base64url
 * encoded). The header carries `alg: "EdDSA"` and the `kid` matches the
 * SigningKey.keyId so verifiers can pick the right public key.
 */

import { createHash, randomUUID } from "node:crypto";
import type { Ed25519Signer } from "../signing/signer";
import type { SigningKeyStore } from "../signing/key-store";

export type LicenseScope = "INSTANCE" | "MERCHANT";

export interface LicenseClaims {
  /** Unique license id (cuid-like) */
  jti: string;
  /** Plugin slug */
  pluginSlug: string;
  /** Plugin version this license is bound to (or "*" for any version) */
  version: string;
  /** Pricing plan kind */
  pricingPlanKind:
    | "PER_INSTANCE_ONE_TIME"
    | "PER_MERCHANT_SUBSCRIPTION"
    | "PER_USAGE";
  /** NovaPay instance ID this license is bound to */
  instanceId: string;
  /** NovaPay merchant ID (only when scope=MERCHANT) */
  merchantId?: string;
  /** License scope */
  scope: LicenseScope;
  /** Issued-at timestamp (epoch seconds) */
  iat: number;
  /** Expiration timestamp (epoch seconds, optional for perpetual licenses) */
  exp?: number;
  /** Issuer (Registry domain) */
  iss?: string;
}

export interface IssueLicenseInput {
  pluginSlug: string;
  version: string;
  pricingPlanKind: LicenseClaims["pricingPlanKind"];
  instanceId: string;
  merchantId?: string;
  /** TTL in seconds; omit for perpetual licenses */
  expiresInSeconds?: number;
  issuer?: string;
}

export interface IssueLicenseResult {
  jti: string;
  jwsCompact: string;
  licenseKeyHash: string;
  claims: LicenseClaims;
  signingKeyId: string;
}

function base64UrlEncode(input: Buffer | string): string {
  return (typeof input === "string" ? Buffer.from(input, "utf8") : input)
    .toString("base64url");
}

function canonicalStringify(obj: Record<string, unknown>): string {
  // RFC 7515 doesn't mandate canonical JSON, but we sort keys for
  // deterministic license keys (so licenseKeyHash is stable for replay
  // detection).
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(obj).sort()) {
    if (obj[key] !== undefined) {
      sorted[key] = obj[key];
    }
  }
  return JSON.stringify(sorted);
}

export async function issueLicense(
  input: IssueLicenseInput,
  signer: Ed25519Signer,
  keyStore: SigningKeyStore,
): Promise<IssueLicenseResult> {
  if (input.merchantId && input.merchantId.trim() === "") {
    throw new Error("merchantId, when provided, must be non-empty.");
  }

  const activeKey = await keyStore.getActive();
  const now = Math.floor(Date.now() / 1000);
  const scope: LicenseScope = input.merchantId ? "MERCHANT" : "INSTANCE";
  const jti = randomUUID();

  const claims: LicenseClaims = {
    jti,
    pluginSlug: input.pluginSlug,
    version: input.version,
    pricingPlanKind: input.pricingPlanKind,
    instanceId: input.instanceId,
    scope,
    iat: now,
    ...(input.merchantId ? { merchantId: input.merchantId } : {}),
    ...(input.expiresInSeconds
      ? { exp: now + input.expiresInSeconds }
      : {}),
    ...(input.issuer ? { iss: input.issuer } : {}),
  };

  const headerJson = canonicalStringify({
    alg: "EdDSA",
    typ: "license+jws",
    kid: activeKey.keyId,
  });
  const payloadJson = canonicalStringify(
    claims as unknown as Record<string, unknown>,
  );
  const headerB64 = base64UrlEncode(headerJson);
  const payloadB64 = base64UrlEncode(payloadJson);
  const signingInput = `${headerB64}.${payloadB64}`;

  const signResult = await signer.sign({
    rawBytes: Buffer.from(signingInput, "ascii"),
    keyId: activeKey.keyId,
  });

  const jwsCompact = `${signingInput}.${signResult.signature}`;
  const licenseKeyHash = createHash("sha256").update(jwsCompact).digest("hex");

  return {
    jti,
    jwsCompact,
    licenseKeyHash,
    claims,
    signingKeyId: activeKey.keyId,
  };
}
