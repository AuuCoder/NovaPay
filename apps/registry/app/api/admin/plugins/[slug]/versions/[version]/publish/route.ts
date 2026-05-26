import { NextResponse, type NextRequest } from "next/server";
import { requireRegistryAdminRequest } from "../../../../../../../../lib/auth/session";
import {
  getPluginVersionRecord,
  getRegistryRuntime,
  listPluginVersionTestSessions,
  updatePluginVersionReviewState,
} from "../../../../../../../../lib/runtime/state";
import { assertReviewTransition } from "../../../../../../../../lib/review/state-machine";
import { assertVerificationSatisfied } from "../../../../../../../../lib/review/verification-gate";
import { apiError } from "../../../../../../../../lib/api/response";

export const runtime = "nodejs";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; version: string }> },
) {
  const auth = await requireRegistryAdminRequest(request);
  if (auth.response) {
    return auth.response;
  }

  const { slug, version } = await params;
  const state = await getRegistryRuntime();
  const record = getPluginVersionRecord(state, slug, version);
  const bundle = state.demoBundles.get(`${slug}@${version}`) ?? null;

  if (!record) {
    return apiError(request, "VERSION_NOT_FOUND", 404, { slug, version });
  }

  const sessions = listPluginVersionTestSessions({
    state,
    pluginSlug: slug,
    version,
  });

  try {
    assertVerificationSatisfied({
      slug,
      sessions,
      manifest: bundle?.pipelineResult.manifest ?? null,
    });
  } catch (error) {
    return apiError(request, "VERIFICATION_REQUIRED", 409);
  }

  try {
    assertReviewTransition(record.reviewState, "PUBLISHED");
  } catch (error) {
    return apiError(request, "INVALID_TRANSITION", 409);
  }

  const updated = updatePluginVersionReviewState({
    state,
    slug,
    version,
    reviewState: "PUBLISHED",
  });

  return NextResponse.json({ version: updated });
}
