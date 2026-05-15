/**
 * RegistryConsumer authentication middleware for the Public API.
 *
 * Validates `x-novapay-registry-app-id` and `x-novapay-registry-app-key`
 * headers against the `RegistryConsumer` table. Returns structured errors
 * when credentials are missing or invalid (Req 17.5, 17.6, 17.7).
 *
 * Phase 1 note: This module provides a pure-function verifier that can be
 * called from Next.js route handlers. It does NOT use Next.js middleware
 * (which would require a `middleware.ts` at the app root) — instead each
 * public API route calls `authenticateConsumer(request)` at the top.
 */

import { createHash } from "node:crypto";

export interface ConsumerAuthResult {
  authenticated: true;
  instanceId: string;
  appId: string;
  rateLimitPerMin: number;
}

export interface ConsumerAuthError {
  authenticated: false;
  errorCode: "MISSING_CREDENTIALS" | "INVALID_REGISTRY_APP_KEY" | "CONSUMER_DISABLED" | "CONSUMER_NOT_FOUND";
  errorMessage: string;
}

export type ConsumerAuthOutcome = ConsumerAuthResult | ConsumerAuthError;

export interface ConsumerRecord {
  instanceId: string;
  appId: string;
  appKeyHash: string;
  enabled: boolean;
  rateLimitPerMin: number;
}

export interface ConsumerLookup {
  findByAppId(appId: string): Promise<ConsumerRecord | null>;
}

const HEADER_APP_ID = "x-novapay-registry-app-id";
const HEADER_APP_KEY = "x-novapay-registry-app-key";

function hashAppKey(appKey: string): string {
  return createHash("sha256").update(appKey).digest("hex");
}

export function extractConsumerHeaders(headers: Headers): {
  appId: string | null;
  appKey: string | null;
} {
  return {
    appId: headers.get(HEADER_APP_ID)?.trim() || null,
    appKey: headers.get(HEADER_APP_KEY)?.trim() || null,
  };
}

export async function authenticateConsumer(
  headers: Headers,
  lookup: ConsumerLookup,
): Promise<ConsumerAuthOutcome> {
  const { appId, appKey } = extractConsumerHeaders(headers);

  if (!appId || !appKey) {
    return {
      authenticated: false,
      errorCode: "MISSING_CREDENTIALS",
      errorMessage: "x-novapay-registry-app-id and x-novapay-registry-app-key headers are required.",
    };
  }

  const consumer = await lookup.findByAppId(appId);

  if (!consumer) {
    return {
      authenticated: false,
      errorCode: "CONSUMER_NOT_FOUND",
      errorMessage: `No registry consumer found for appId: ${appId}.`,
    };
  }

  if (!consumer.enabled) {
    return {
      authenticated: false,
      errorCode: "CONSUMER_DISABLED",
      errorMessage: `Registry consumer ${appId} is disabled.`,
    };
  }

  const providedHash = hashAppKey(appKey);
  if (providedHash !== consumer.appKeyHash) {
    return {
      authenticated: false,
      errorCode: "INVALID_REGISTRY_APP_KEY",
      errorMessage: "The provided app key does not match.",
    };
  }

  return {
    authenticated: true,
    instanceId: consumer.instanceId,
    appId: consumer.appId,
    rateLimitPerMin: consumer.rateLimitPerMin,
  };
}
