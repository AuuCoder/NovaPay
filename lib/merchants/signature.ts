import { createHmac, timingSafeEqual } from "node:crypto";
import { AppError } from "@/lib/errors";
import { revealMerchantCredentialSecret } from "@/lib/merchant-credentials";
import { getPrismaClient } from "@/lib/prisma";
import { getSystemConfig } from "@/lib/system-config";

const DEFAULT_MAX_AGE_SECONDS = 300;

function parseTimestamp(input: string) {
  const trimmed = input.trim();

  if (/^\d+$/.test(trimmed)) {
    const numeric = Number(trimmed);

    if (!Number.isFinite(numeric)) {
      return NaN;
    }

    return trimmed.length <= 10 ? numeric * 1000 : numeric;
  }

  return Date.parse(trimmed);
}

function createSharedSignature(
  secret: string,
  timestamp: string,
  rawBody: string,
  nonce?: string | null,
) {
  const payload = nonce ? `${timestamp}.${nonce}.${rawBody}` : `${timestamp}.${rawBody}`;
  return createHmac("sha256", secret).update(payload).digest("hex");
}

function safeEqualHex(left: string, right: string) {
  const leftBuffer = Buffer.from(left, "hex");
  const rightBuffer = Buffer.from(right, "hex");

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

export function createMerchantRequestSignature(
  secret: string,
  timestamp: string,
  rawBody: string,
  nonce: string,
) {
  return createSharedSignature(secret, timestamp, rawBody, nonce);
}

export function createMerchantCallbackSignature(secret: string, timestamp: string, rawBody: string) {
  return createSharedSignature(secret, timestamp, rawBody);
}

export async function verifyMerchantRequestSignature(input: {
  request: Request;
  rawBody: string;
  merchant: {
    id: string;
    code: string;
    apiCredentials?: Array<{
      id: string;
      keyId: string;
      secretCiphertext: string;
      enabled: boolean;
      expiresAt: Date | null;
    }>;
  };
}) {
  const apiKeyHeader = input.request.headers.get("x-novapay-key")?.trim() || "";
  const enabledCredentials = (input.merchant.apiCredentials ?? []).filter(
    (credential) => credential.enabled && (!credential.expiresAt || credential.expiresAt > new Date()),
  );
  const selectedCredential = apiKeyHeader
    ? enabledCredentials.find((credential) => credential.keyId === apiKeyHeader)
    : null;

  if (!apiKeyHeader) {
    throw new AppError(
      "API_KEY_REQUIRED",
      `Merchant ${input.merchant.code} requires x-novapay-key.`,
      401,
    );
  }

  if (!selectedCredential) {
    throw new AppError("INVALID_API_KEY", "Merchant API credential was not found or is inactive.", 401);
  }

  const timestamp = input.request.headers.get("x-novapay-timestamp")?.trim();
  const signature = input.request.headers.get("x-novapay-signature")?.trim();
  const nonce = input.request.headers.get("x-novapay-nonce")?.trim();

  if (!timestamp || !signature || !nonce) {
    throw new AppError(
      "SIGNATURE_REQUIRED",
      `Merchant ${input.merchant.code} requires x-novapay-timestamp, x-novapay-nonce and x-novapay-signature headers.`,
      401,
    );
  }

  if (!/^[A-Za-z0-9._:-]{8,128}$/.test(nonce)) {
    throw new AppError("INVALID_SIGNATURE_NONCE", "Signature nonce is invalid.", 401);
  }

  const maxAgeSeconds = Number(
    (await getSystemConfig("MERCHANT_SIGNATURE_MAX_AGE_SECONDS")) ?? DEFAULT_MAX_AGE_SECONDS,
  );
  const timestampMs = parseTimestamp(timestamp);

  if (!Number.isFinite(timestampMs)) {
    throw new AppError("INVALID_SIGNATURE_TIMESTAMP", "Signature timestamp is invalid.", 401);
  }

  if (Math.abs(Date.now() - timestampMs) > maxAgeSeconds * 1000) {
    throw new AppError("SIGNATURE_EXPIRED", "Signature timestamp has expired.", 401);
  }

  const signingSecret = revealMerchantCredentialSecret(selectedCredential.secretCiphertext);

  if (!signingSecret) {
    throw new AppError("INVALID_CREDENTIAL_SECRET", "Merchant API credential secret is unavailable.", 401);
  }

  const expected = createMerchantRequestSignature(signingSecret, timestamp, input.rawBody, nonce);

  if (!/^[0-9a-f]+$/i.test(signature) || !safeEqualHex(expected, signature.toLowerCase())) {
    throw new AppError("INVALID_SIGNATURE", "Merchant request signature verification failed.", 401);
  }

  const prisma = getPrismaClient();
  const expiresAt = new Date(timestampMs + maxAgeSeconds * 1000);

  await prisma.merchantRequestNonce.deleteMany({
    where: {
      merchantId: input.merchant.id,
      expiresAt: {
        lt: new Date(),
      },
    },
  });

  try {
    await prisma.merchantRequestNonce.create({
      data: {
        merchantId: input.merchant.id,
        apiCredentialId: selectedCredential.id,
        nonce,
        expiresAt,
      },
    });
  } catch {
    throw new AppError(
      "NONCE_REPLAYED",
      "Merchant request nonce has already been used.",
      409,
      { nonce },
    );
  }

  return {
    verified: true,
    skipped: false,
    keyId: selectedCredential.keyId,
    credentialId: selectedCredential.id,
    nonce,
  };
}
