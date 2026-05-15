/**
 * NovaPay-side License client (Req 13.3, 13.4, 13.7, 13.9, 18.1).
 *
 * Calls the Registry's `POST /licenses/verify` endpoint to validate paid
 * plugin licenses. Replaces the previous manual `purchasedAt` flag with
 * cryptographic verification.
 *
 * Environment switches:
 *   - `NOVAPAY_DISABLE_LICENSE_CHECK` — when non-empty in non-production,
 *     skips remote verification and emits a console.warn. In production
 *     the switch is ignored (real verification still runs) and a CRITICAL
 *     log warns about the misconfiguration.
 */

import { createHash } from "node:crypto";

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
  | "UNKNOWN_KEY"
  | "TRANSPORT_ERROR";

export interface VerifyLicenseInput {
  /** Compact JWS license issued by the Registry */
  licenseKey: string;
  /** Slug of the plugin we're about to install/enable */
  pluginSlug: string;
  /** Plugin version */
  version: string;
  /** This NovaPay instance's ID */
  instanceId: string;
  /** Optional merchant ID for merchant-scoped licenses */
  merchantId?: string;
  /** Registry base URL (per `PluginRegistrySource.baseUrl`) */
  registryBaseUrl: string;
  /** Registry app credentials (decrypted from `appKeyCiphertext`) */
  appId: string;
  appKey: string;
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

export interface VerifyLicenseSuccess {
  valid: true;
  claims: LicenseClaims;
  licenseKeyHash: string;
  licenseExpiresAt: Date | null;
  signingKeyId: string;
}

export interface VerifyLicenseFailure {
  valid: false;
  reason: LicenseVerifyReason;
  message: string;
}

export type VerifyLicenseResult = VerifyLicenseSuccess | VerifyLicenseFailure;

const LICENSE_CHECK_DISABLED_ENV = "NOVAPAY_DISABLE_LICENSE_CHECK";

function isLicenseCheckDisabled(): boolean {
  const value = process.env[LICENSE_CHECK_DISABLED_ENV];
  if (!value) return false;
  if (process.env.NODE_ENV === "production") {
    console.error(
      `[license-client] CRITICAL: ${LICENSE_CHECK_DISABLED_ENV} is set in production. Ignoring and running real verification.`,
    );
    return false;
  }
  console.warn(
    `[license-client] ${LICENSE_CHECK_DISABLED_ENV} is set; skipping remote license verification (non-production only).`,
  );
  return true;
}

function buildVerifyUrl(baseUrl: string): string {
  return new URL("/api/licenses/verify", baseUrl).toString();
}

export async function verifyLicense(
  input: VerifyLicenseInput,
): Promise<VerifyLicenseResult> {
  if (isLicenseCheckDisabled()) {
    const now = Math.floor(Date.now() / 1000);
    return {
      valid: true,
      claims: {
        jti: "stub-jti",
        pluginSlug: input.pluginSlug,
        version: input.version,
        pricingPlanKind: "PER_INSTANCE_ONE_TIME",
        instanceId: input.instanceId,
        merchantId: input.merchantId,
        scope: input.merchantId ? "MERCHANT" : "INSTANCE",
        iat: now,
      },
      licenseKeyHash: createHash("sha256")
        .update(input.licenseKey)
        .digest("hex"),
      licenseExpiresAt: null,
      signingKeyId: "stub-key",
    };
  }

  let response: Response;
  try {
    response = await fetch(buildVerifyUrl(input.registryBaseUrl), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-novapay-registry-app-id": input.appId,
        "x-novapay-registry-app-key": input.appKey,
      },
      body: JSON.stringify({
        licenseKey: input.licenseKey,
        expectedSlug: input.pluginSlug,
        expectedVersion: input.version,
        expectedInstanceId: input.instanceId,
        expectedMerchantId: input.merchantId,
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
  } catch (error) {
    return {
      valid: false,
      reason: "TRANSPORT_ERROR",
      message:
        error instanceof Error ? error.message : "License verify request failed.",
    };
  }

  if (!response.ok) {
    return {
      valid: false,
      reason: "TRANSPORT_ERROR",
      message: `License verify HTTP ${response.status}`,
    };
  }

  const body = (await response.json()) as
    | { valid: true; claims: LicenseClaims; licenseKeyHash: string; signingKeyId: string }
    | { valid: false; reason: LicenseVerifyReason; message: string };

  if (body.valid) {
    return {
      valid: true,
      claims: body.claims,
      licenseKeyHash: body.licenseKeyHash,
      licenseExpiresAt: body.claims.exp ? new Date(body.claims.exp * 1000) : null,
      signingKeyId: body.signingKeyId,
    };
  }

  return {
    valid: false,
    reason: body.reason,
    message: body.message,
  };
}

/**
 * Periodic (e.g. 24-hour) revalidation of installed paid plugin licenses
 * (Req 13.7, 13.8). Iterates `MarketplacePlugin` rows with `purchasedAt` set,
 * re-runs `verifyLicense`, and disables plugins whose licenses are now
 * REVOKED or EXPIRED while preserving the install path so admins can appeal.
 *
 * Phase 3 stub: returns 0; full implementation lands when Prisma + scheduled
 * job runner are wired together.
 */
export async function revalidateInstalledLicenses(): Promise<{
  inspected: number;
  disabled: number;
}> {
  return { inspected: 0, disabled: 0 };
}
