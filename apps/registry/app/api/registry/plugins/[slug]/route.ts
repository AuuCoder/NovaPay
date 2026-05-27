/**
 * GET /registry/plugins/:slug
 *
 * Returns a single plugin record with its published version list. Sourced
 * from the runtime catalog so the checksum/signature stay in sync with the
 * `/registry/plugins` listing.
 */

import { NextResponse, type NextRequest } from "next/server";
import { getRegistryRuntime } from "../../../../../lib/runtime/state";
import { requireConsumer } from "../../../../../lib/auth/require-consumer";
import { apiError } from "../../../../../lib/api/response";
import { resolveRequestOrigin } from "../../../../../lib/api/request-origin";

export const runtime = "nodejs";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const auth = await requireConsumer(request);
  if (auth.response) return auth.response;

  const { slug } = await params;
  const state = await getRegistryRuntime();
  const entry = state.catalog.find((p) => p.slug === slug);
  if (!entry) {
    return apiError(request, "PLUGIN_NOT_FOUND", 404, { slug });
  }

  const url = resolveRequestOrigin(request);
  const bundle = state.demoBundles.get(`${entry.slug}@${entry.version}`);
  const plugin = {
    ...entry,
    downloadUrl: `${url}/api/registry/packages/${entry.slug}/${entry.version}/download`,
    checksum: bundle ? `sha256:${bundle.pipelineResult.sha256}` : null,
    signature: bundle ? bundle.pipelineResult.signature : null,
  };

  const versions = bundle
    ? [
        {
          version: entry.version,
          publishedAt: new Date().toISOString(),
          checksum: `sha256:${bundle.pipelineResult.sha256}`,
          signature: bundle.pipelineResult.signature,
        },
      ]
    : [];

  return NextResponse.json({ plugin, versions });
}
