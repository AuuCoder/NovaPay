/**
 * GET /.well-known/trust.json
 *
 * Exposes the Registry's current and previous Ed25519 signing public keys so
 * NovaPay instances can verify bundle signatures and license JWS offline.
 *
 * Response shape (Req 19.2, 19.3):
 * {
 *   "currentKey":   { keyId, alg, publicKey, notBefore, notAfter },
 *   "previousKeys": [ ... ]
 * }
 *
 * Sourced from `lib/runtime/state.ts`, which seeds an ACTIVE key on first
 * boot. `previousKeys` retains retired keys for at least 30 days after
 * rotation.
 */

import { NextResponse } from "next/server";
import type { SigningKeyRecord } from "../../../../lib/signing/key-store";
import { getRegistryRuntime } from "../../../../lib/runtime/state";
import { getTrustJsonCacheVersion } from "../../../../lib/signing/rotation-cache";

export const runtime = "nodejs";

interface TrustJsonKey {
  keyId: string;
  alg: string;
  publicKey: string;
  notBefore: string;
  notAfter: string;
}

function toTrustJsonKey(record: SigningKeyRecord): TrustJsonKey {
  return {
    keyId: record.keyId,
    alg: record.alg,
    publicKey: record.publicKey,
    notBefore: record.notBefore.toISOString(),
    notAfter: record.notAfter.toISOString(),
  };
}

export async function GET() {
  const state = await getRegistryRuntime();

  let currentKey: TrustJsonKey | null = null;
  try {
    const active = await state.keyStore.getActive();
    currentKey = toTrustJsonKey(active);
  } catch {
    currentKey = null;
  }

  const now = new Date();
  const anchors = await state.keyStore.listTrustAnchors(now);
  const previousKeys = anchors
    .filter((record) => record.status === "RETIRED")
    .map(toTrustJsonKey);

  return NextResponse.json(
    {
      currentKey,
      previousKeys,
      cacheVersion: getTrustJsonCacheVersion(),
    },
    {
      headers: {
        "Cache-Control": "public, max-age=300, s-maxage=300",
        ETag: `W/"trust-${getTrustJsonCacheVersion()}"`,
      },
    },
  );
}
