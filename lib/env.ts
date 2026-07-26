import { getOptionalUrl } from "@/lib/payments/utils";

const DEV_PUBLIC_BASE_URL = "http://localhost:3000";
const DEV_DATA_ENCRYPTION_KEY = "novapay-dev-data-encryption-key";

function shouldEnforceProductionEnv() {
  return (
    process.env.NODE_ENV === "production" &&
    process.env.NEXT_PHASE !== "phase-production-build"
  );
}

function hasText(value: string | undefined) {
  return typeof value === "string" && value.trim().length > 0;
}

function readRequired(
  name: string,
  options?: {
    developmentDefault?: string;
    message?: string;
  },
) {
  const value = process.env[name];

  if (hasText(value)) {
    return value as string;
  }

  if (!shouldEnforceProductionEnv() && options?.developmentDefault !== undefined) {
    return options.developmentDefault;
  }

  throw new Error(options?.message ?? `Missing environment variable ${name}.`);
}

function assertNotLocalhost(url: string, name: string) {
  const hostname = new URL(url).hostname;

  if (["localhost", "127.0.0.1", "0.0.0.0"].includes(hostname)) {
    throw new Error(`${name} must point to a public production domain instead of localhost.`);
  }
}

export function getPublicBaseUrl() {
  const configured = readRequired("NOVAPAY_PUBLIC_BASE_URL", {
    developmentDefault: DEV_PUBLIC_BASE_URL,
    message: "NOVAPAY_PUBLIC_BASE_URL is required.",
  });
  const normalized = getOptionalUrl(configured);

  if (!normalized) {
    throw new Error("NOVAPAY_PUBLIC_BASE_URL must be a valid http(s) URL.");
  }

  if (shouldEnforceProductionEnv()) {
    assertNotLocalhost(normalized, "NOVAPAY_PUBLIC_BASE_URL");
  }

  return normalized;
}

/**
 * Only an explicit development/test environment is allowed to fall back to
 * public source-code default secrets. Any other NODE_ENV value — including the
 * common case where NODE_ENV is unset (custom servers, PM2, some Docker setups)
 * — is treated as production for secret purposes and must supply real secrets.
 */
export function isDevLikeEnv() {
  return process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test";
}

const WEAK_ENCRYPTION_KEYS = new Set([
  "CHANGE_TO_A_32_BYTE_SECRET_KEY",
  DEV_DATA_ENCRYPTION_KEY,
]);

function assertStrongEncryptionKey(key: string) {
  if (WEAK_ENCRYPTION_KEYS.has(key) || key.length < 24) {
    throw new Error(
      "NOVAPAY_DATA_ENCRYPTION_KEY must be a high-entropy secret (>= 24 chars, not a known default).",
    );
  }
}

export function getDataEncryptionKey() {
  const configured = process.env.NOVAPAY_DATA_ENCRYPTION_KEY?.trim();

  if (configured) {
    if (!isDevLikeEnv()) {
      assertStrongEncryptionKey(configured);
    }
    return configured;
  }

  // No key configured: only fall back to the public dev default in an explicit
  // development/test environment. Everywhere else, fail fast instead of
  // silently protecting every stored secret with a source-code constant.
  if (isDevLikeEnv()) {
    return DEV_DATA_ENCRYPTION_KEY;
  }

  throw new Error(
    "NOVAPAY_DATA_ENCRYPTION_KEY is required (no dev fallback outside NODE_ENV=development/test).",
  );
}
