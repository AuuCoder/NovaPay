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

export function getDataEncryptionKey() {
  const key = readRequired("NOVAPAY_DATA_ENCRYPTION_KEY", {
    developmentDefault: DEV_DATA_ENCRYPTION_KEY,
    message: "NOVAPAY_DATA_ENCRYPTION_KEY is required.",
  }).trim();

  if (
    shouldEnforceProductionEnv() &&
    ["CHANGE_TO_A_32_BYTE_SECRET_KEY", DEV_DATA_ENCRYPTION_KEY].includes(key)
  ) {
    throw new Error(
      "NOVAPAY_DATA_ENCRYPTION_KEY must be replaced with a high-entropy production secret.",
    );
  }

  return key;
}
