/**
 * GET /registry/packages/:slug/:version/download
 *
 * Streams the actual bundle bytes (JSON-encoded for phase 1). Consumers
 * verify integrity using the sha256 + signature returned by the metadata
 * endpoint above.
 */

import { NextResponse, type NextRequest } from "next/server";
import {
  getDemoBundleRawBytes,
  getRegistryRuntime,
} from "../../../../../../../lib/runtime/state";

export const runtime = "nodejs";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string; version: string }> },
) {
  const { slug, version } = await params;
  const state = await getRegistryRuntime();
  const raw = getDemoBundleRawBytes(state, slug, version);
  if (!raw) {
    return NextResponse.json(
      { error: "BUNDLE_NOT_FOUND", message: `No bundle for ${slug}@${version}` },
      { status: 404 },
    );
  }

  return new NextResponse(new Uint8Array(raw), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Content-Length": String(raw.length),
      "Cache-Control": "public, max-age=60",
    },
  });
}
