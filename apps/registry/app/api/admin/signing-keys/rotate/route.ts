/**
 * POST /admin/signing-keys/rotate (Req 19.2, 19.3)
 *
 * Rotates the active Ed25519 signing key in the runtime state, demoting the
 * current ACTIVE key to RETIRED with notAfter ≥ now + 30d, and bumps the
 * trust.json cache version so consumers refetch immediately.
 */

import { NextResponse, type NextRequest } from "next/server";
import { getRegistryRuntime } from "../../../../../lib/runtime/state";
import {
  createLocalKeyPairAdapter,
  rotateSigningKey,
} from "../../../../../lib/signing/rotation";

export const runtime = "nodejs";

interface RotateRequestBody {
  keyId?: string;
  minRetiredGraceMs?: number;
}

function generateDefaultKeyId(): string {
  const now = new Date();
  const year = now.getFullYear();
  const quarter = Math.floor(now.getMonth() / 3) + 1;
  return `key-${year}-q${quarter}-${Date.now().toString(36)}`;
}

export async function POST(request: NextRequest) {
  let body: RotateRequestBody = {};
  try {
    body = (await request.json()) as RotateRequestBody;
  } catch {
    body = {};
  }

  const keyId = body.keyId?.trim() || generateDefaultKeyId();
  const state = await getRegistryRuntime();
  const adapter = createLocalKeyPairAdapter();

  try {
    const result = await rotateSigningKey(
      {
        keyId,
        minRetiredGraceMs: body.minRetiredGraceMs,
      },
      state.keyStore,
      adapter,
    );

    return NextResponse.json({
      success: true,
      newActive: {
        keyId: result.newActive.keyId,
        publicKey: result.newActive.publicKey,
        notBefore: result.newActive.notBefore.toISOString(),
        notAfter: result.newActive.notAfter.toISOString(),
        status: result.newActive.status,
      },
      retired: result.retired
        ? {
            keyId: result.retired.keyId,
            notAfter: result.retired.notAfter.toISOString(),
            status: result.retired.status,
          }
        : null,
      trustJsonCacheVersion: result.trustJsonCacheVersion,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 400 },
    );
  }
}
