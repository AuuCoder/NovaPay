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
 */
function isAuthDisabled(): boolean {
  return process.env.REGISTRY_AUTH_DISABLED === "1";
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
      response: NextResponse.json(
        {
          error: result.errorCode,
          message: result.errorMessage,
        },
        { status: 401 },
      ),
      consumer: null,
    };
  }

  return { response: null, consumer: result };
}
