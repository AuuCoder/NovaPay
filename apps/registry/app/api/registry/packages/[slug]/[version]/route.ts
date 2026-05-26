/**
 * GET /registry/packages/:slug/:version
 *
 * Returns checksum + Ed25519 signature plus a short-lived download URL
 * pointing to `/api/registry/packages/:slug/:version/download` where the
 * actual bundle bytes are served. The download link expires in 5 minutes
 * (Req 17.4); for the in-memory dev store this is encoded in the URL.
 */

import { NextResponse, type NextRequest } from "next/server";
import {
  describeDemoBundle,
  getRegistryRuntime,
} from "../../../../../../lib/runtime/state";
import { requireConsumer } from "../../../../../../lib/auth/require-consumer";
import { apiError } from "../../../../../../lib/api/response";

export const runtime = "nodejs";

const DOWNLOAD_EXPIRY_SECONDS = 5 * 60;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; version: string }> },
) {
  const auth = await requireConsumer(request);
  if (auth.response) return auth.response;

  const { slug, version } = await params;
  const state = await getRegistryRuntime();
  const bundle = describeDemoBundle(state, slug, version);
  if (!bundle) {
    return apiError(request, "BUNDLE_NOT_FOUND", 404, { slug, version });
  }

  const url = new URL(request.url);
  const expiresAt = new Date(Date.now() + DOWNLOAD_EXPIRY_SECONDS * 1000);
  const downloadUrl = `${url.origin}/api/registry/packages/${slug}/${version}/download?expires=${Math.floor(expiresAt.getTime() / 1000)}`;

  return NextResponse.json({
    slug,
    version,
    sha256: bundle.sha256,
    sizeBytes: bundle.sizeBytes,
    checksum: `sha256:${bundle.sha256}`,
    signature: bundle.signature,
    signatureKeyId: bundle.signatureKeyId,
    downloadUrl,
    downloadUrlExpiresAt: expiresAt.toISOString(),
  });
}
