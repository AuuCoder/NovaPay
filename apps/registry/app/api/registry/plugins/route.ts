/**
 * GET /registry/plugins
 *
 * Returns the plugin catalog in the remote marketplace format consumed by
 * NovaPay. Structured pricing fields are now emitted alongside the legacy
 * `priceLabel` so registries can create real paid orders instead of relying
 * on display-only text.
 *
 * The catalog is sourced from `lib/runtime/state.ts`, which signs the demo
 * bundles at boot so the checksum/signature returned here are real and
 * verifiable by consumers using `/.well-known/trust.json`.
 */

import { NextResponse } from "next/server";
import { getRegistryRuntime } from "../../../../lib/runtime/state";
import { requireConsumer } from "../../../../lib/auth/require-consumer";
import { resolveRequestOrigin } from "../../../../lib/api/request-origin";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = await requireConsumer(request);
  if (auth.response) return auth.response;

  const downloadOrigin = `${resolveRequestOrigin(request)}/api/registry/packages`;
  const state = await getRegistryRuntime();

  const plugins = state.catalog.map((entry) => {
    const bundle = state.demoBundles.get(`${entry.slug}@${entry.version}`);
    return {
      ...entry,
      downloadUrl: `${downloadOrigin}/${entry.slug}/${entry.version}/download`,
      checksum: bundle ? `sha256:${bundle.pipelineResult.sha256}` : null,
      signature: bundle ? bundle.pipelineResult.signature : null,
    };
  });

  return NextResponse.json({ plugins }, {
    headers: {
      "Cache-Control": "public, max-age=60, s-maxage=60",
    },
  });
}
