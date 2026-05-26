/**
 * Shared helper for public API routes to authenticate the calling NovaPay
 * instance via `x-novapay-registry-app-id` / `x-novapay-registry-app-key`.
 *
 * Returns the authenticated consumer result or a NextResponse 401 that the
 * route can immediately return.
 *
 * Usage in a route handler:
 *   const auth = await requireConsumer(request);
 *   if (auth.response) return auth.response;
 *   // auth.consumer is now available
 */

import { NextResponse } from "next/server";
import {
  authenticateConsumer,
  type ConsumerAuthResult,
} from "./consumer-app-key";
import { getRegistryRuntime } from "../runtime/state";
import { apiError } from "../api/response";

export interface RequireConsumerSuccess {
  response: null;
  consumer: ConsumerAuthResult;
}

export interface RequireConsumerFailure {
  response: NextResponse;
  consumer: null;
}

export type RequireConsumerOutcome =
  | RequireConsumerSuccess
  | RequireConsumerFailure;

/**
 * When `REGISTRY_AUTH_DISABLED=1` (dev only), authentication is skipped and
 * a stub consumer is returned. This lets the main NovaPay app sync without
 * configuring appId/appKey during local development.
 *
 * In production (NODE_ENV=production) the bypass is ignored and a CRITICAL
 * log warns about the misconfiguration — same pattern as
 * NOVAPAY_DISABLE_LICENSE_CHECK on the main app side.
 */
function isAuthDisabled(): boolean {
  if (process.env.REGISTRY_AUTH_DISABLED !== "1") return false;

  if (process.env.NODE_ENV === "production") {
    console.error(
      "[registry-auth] CRITICAL: REGISTRY_AUTH_DISABLED=1 is set in production. " +
        "Ignoring and enforcing real consumer authentication.",
    );
    return false;
  }

  return true;
}

export async function requireConsumer(
  request: Request,
): Promise<RequireConsumerOutcome> {
  if (isAuthDisabled()) {
    return {
      response: null,
      consumer: {
        authenticated: true,
        instanceId: "inst_anonymous-dev",
        appId: "anonymous",
        rateLimitPerMin: 600,
      },
    };
  }

  const state = await getRegistryRuntime();
  const result = await authenticateConsumer(
    new Headers(request.headers),
    state.consumers,
  );

  if (!result.authenticated) {
    return {
      response: apiError(
        request,
        result.errorCode,
        401,
        undefined,
      ),
      consumer: null,
    };
  }

  return { response: null, consumer: result };
}
