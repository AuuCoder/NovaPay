/**
 * GET /.well-known/trust.json
 *
 * Exposes the Registry's current and previous Ed25519 signing public keys so
 * NovaPay instances can verify bundle signatures and license JWS offline.
 *
 * Response shape (Req 19.2, 19.3):
 * {
 *   "currentKey": { keyId, alg, publicKey, notBefore, notAfter },
 *   "previousKeys": [ ... ]
 * }
 *
 * `previousKeys` retains retired keys for at least 30 days after rotation.
 */

import { NextResponse } from "next/server";
import {
  createInMemorySigningKeyStore,
  type SigningKeyRecord,
} from "@/lib/signing/key-store";

export const runtime = "nodejs";

// TODO(phase-1): Replace with a persistent store backed by Prisma once the
// Registry database is provisioned. For now the in-memory store is populated
// from environment variables or seed data at startup.
function getSigningKeyStore() {
  // Placeholder: in production this will be injected via a module-level
  // singleton wired to the Prisma SigningKey model. During phase 1 scaffolding
  // we return an empty store so the route is exercisable without a DB.
  return createInMemorySigningKeyStore();
}

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
  const store = getSigningKeyStore();

  let currentKey: TrustJsonKey | null = null;
  try {
    const active = await store.getActive();
    currentKey = toTrustJsonKey(active);
  } catch {
    // No active key provisioned yet — return empty trust document.
  }

  const now = new Date();
  const anchors = await store.listTrustAnchors(now);
  const previousKeys = anchors
    .filter((record) => record.status === "RETIRED")
    .map(toTrustJsonKey);

  return NextResponse.json(
    {
      currentKey,
      previousKeys,
    },
    {
      headers: {
        "Cache-Control": "public, max-age=300, s-maxage=300",
      },
    },
  );
}
