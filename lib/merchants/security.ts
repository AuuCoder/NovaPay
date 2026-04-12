import { AppError } from "@/lib/errors";

function normalizeIp(value: string) {
  const trimmed = value.trim();

  if (trimmed.startsWith("::ffff:")) {
    return trimmed.slice("::ffff:".length);
  }

  return trimmed;
}

export function parseIpWhitelist(rawValue: string | null | undefined) {
  if (!rawValue) {
    return [];
  }

  return Array.from(
    new Set(
      rawValue
        .split(/[\n,\s]+/)
        .map((value) => normalizeIp(value))
        .filter(Boolean),
    ),
  );
}

export function assertMerchantRequestIpAllowed(input: {
  merchantCode: string;
  clientIp: string | null;
  apiIpWhitelist?: string | null;
}) {
  const whitelist = parseIpWhitelist(input.apiIpWhitelist);

  if (whitelist.length === 0) {
    return;
  }

  if (!input.clientIp) {
    throw new AppError(
      "CLIENT_IP_UNAVAILABLE",
      `Merchant ${input.merchantCode} requires client IP detection for whitelist validation.`,
      403,
    );
  }

  const normalizedClientIp = normalizeIp(input.clientIp);

  if (!whitelist.includes(normalizedClientIp)) {
    throw new AppError(
      "IP_NOT_ALLOWED",
      `Merchant ${input.merchantCode} rejected request IP ${normalizedClientIp}.`,
      403,
      {
        clientIp: normalizedClientIp,
      },
    );
  }
}
