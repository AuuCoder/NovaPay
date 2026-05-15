/**
 * GET /registry/packages/:slug/:version
 *
 * Returns a signed download URL (5-minute expiry, Req 17.4) plus the bundle
 * checksum and signature for the requested plugin version.
 *
 * Phase 1: returns placeholder data. Once the object store and signing
 * service are wired to the database, this will generate real presigned URLs.
 */

import { NextResponse, type NextRequest } from "next/server";

export const runtime = "nodejs";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string; version: string }> },
) {
  const { slug, version } = await params;

  // Phase 1 placeholder: in production this queries PluginVersion + PluginAsset
  // and generates a presigned download URL from the object store.
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

  return NextResponse.json({
    slug,
    version,
    downloadUrl: `http://localhost:3000/api/registry/packages/${slug}/${version}/download?expires=${Math.floor(expiresAt.getTime() / 1000)}`,
    downloadUrlExpiresAt: expiresAt.toISOString(),
    checksum: null,
    signature: null,
    signatureKeyId: null,
  });
}
