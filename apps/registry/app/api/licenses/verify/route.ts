/**
 * POST /licenses/verify
 *
 * Verifies a compact Ed25519 JWS license against the configured signing key
 * and revocation list. Returns structured `valid` + `reason` per Req 18.
 *
 * Phase 3 placeholder: uses in-memory key store. Production wiring will
 * resolve the SigningKeyStore from Prisma.
 */

import { NextResponse, type NextRequest } from "next/server";
import { createInMemorySigningKeyStore } from "../../../../lib/signing/key-store";
import { createInMemoryRevocationStore } from "../../../../lib/licensing/revocation";
import { verifyLicense } from "../../../../lib/licensing/verifier";

export const runtime = "nodejs";

const keyStore = createInMemorySigningKeyStore();
const revocationStore = createInMemoryRevocationStore();

export async function POST(request: NextRequest) {
  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      { valid: false, reason: "INVALID_FORMAT", message: "Request body must be JSON." },
      { status: 400 },
    );
  }

  const jwsCompact = typeof body.licenseKey === "string" ? body.licenseKey : null;
  if (!jwsCompact) {
    return NextResponse.json(
      { valid: false, reason: "INVALID_FORMAT", message: "licenseKey is required." },
      { status: 400 },
    );
  }

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
    keyStore,
    revocationStore,
  );

  return NextResponse.json(result, {
    status: result.valid ? 200 : 200,
    headers: { "Cache-Control": "no-store" },
  });
}
