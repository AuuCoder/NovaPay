/**
 * GET /registry/packages/:slug/:version/download
 *
 * Streams the actual bundle bytes (JSON-encoded for phase 1). Consumers
 * verify integrity using the sha256 + signature returned by the metadata
 * endpoint above.
 */

import { NextResponse, type NextRequest } from "next/server";
import {
  describeDemoBundle,
  getDemoBundleRawBytes,
  getRegistryRuntime,
} from "../../../../../../../lib/runtime/state";
import { apiError } from "../../../../../../../lib/api/response";

export const runtime = "nodejs";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; version: string }> },
) {
  const { slug, version } = await params;
  const state = await getRegistryRuntime();
  const bundle = describeDemoBundle(state, slug, version);
  const raw = getDemoBundleRawBytes(state, slug, version);
  const stored = bundle && state.objectStore.get
    ? await state.objectStore.get(bundle.storageKey)
    : null;
  const responseBody = raw ?? stored?.body ?? null;

  if (!responseBody) {
    return apiError(request, "BUNDLE_NOT_FOUND", 404, { slug, version });
  }

  return new NextResponse(new Uint8Array(responseBody), {
    status: 200,
    headers: {
      "Content-Type": stored?.contentType ?? "application/json",
      "Content-Length": String(responseBody.length),
      "Cache-Control": "public, max-age=60",
    },
  });
}
