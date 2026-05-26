/**
 * POST /licenses/verify
 *
 * Verifies a compact Ed25519 JWS license against the runtime signing key
 * store and revocation list. Returns structured `valid` + `reason` per Req 18.
 */

import { NextResponse, type NextRequest } from "next/server";
import { getRegistryRuntime } from "../../../../lib/runtime/state";
import { verifyLicense } from "../../../../lib/licensing/verifier";
import { resolveApiMessage, resolveRequestLocale } from "../../../../lib/api/response";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const locale = resolveRequestLocale(request);
  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      {
        valid: false,
        reason: "INVALID_FORMAT",
        message: resolveApiMessage(locale, "INVALID_BODY"),
      },
      { status: 400 },
    );
  }

  const jwsCompact = typeof body.licenseKey === "string" ? body.licenseKey : null;
  if (!jwsCompact) {
    return NextResponse.json(
      {
        valid: false,
        reason: "INVALID_FORMAT",
        message: resolveApiMessage(locale, "LICENSE_KEY_REQUIRED"),
      },
      { status: 400 },
    );
  }

  const state = await getRegistryRuntime();

  const result = await verifyLicense(
    {
      jwsCompact,
      expectedSlug:
        typeof body.expectedSlug === "string" ? body.expectedSlug : undefined,
      expectedVersion:
        typeof body.expectedVersion === "string" ? body.expectedVersion : undefined,
      expectedInstanceId:
        typeof body.expectedInstanceId === "string"
          ? body.expectedInstanceId
          : undefined,
      expectedMerchantId:
        typeof body.expectedMerchantId === "string"
          ? body.expectedMerchantId
          : undefined,
    },
    state.keyStore,
    state.revocations,
    state.licenseStore,
  );

  return NextResponse.json(result, {
    status: 200,
    headers: { "Cache-Control": "no-store" },
  });
}
