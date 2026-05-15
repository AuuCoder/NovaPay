/**
 * GET /registry/plugins
 *
 * Returns the plugin catalog in a format byte-compatible with the NovaPay
 * mock registry (`app/api/mock-plugin-registry/registry/plugins/route.ts`).
 * New fields are placed exclusively under `metadata.*` to preserve backward
 * compatibility with `parseRemotePluginRecord` (Req 23.1, 25.2).
 *
 * The catalog is sourced from `lib/runtime/state.ts`, which signs the demo
 * bundles at boot so the checksum/signature returned here are real and
 * verifiable by consumers using `/.well-known/trust.json`.
 */

import { NextResponse } from "next/server";
import { getRegistryRuntime } from "../../../../lib/runtime/state";
import { requireConsumer } from "../../../../lib/auth/require-consumer";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = await requireConsumer(request);
  if (auth.response) return auth.response;

  const url = new URL(request.url);
  const downloadOrigin = `${url.origin}/api/registry/packages`;
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
