import { NextResponse, type NextRequest } from "next/server";
import {
  getEffectiveDeveloperId,
  requireRegistryDeveloperRequest,
} from "../../../../../../../../lib/auth/session";
import { assertPluginOwnership } from "../../../../../../../../lib/developer/plugin-ownership";
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
  const auth = await requireRegistryDeveloperRequest(request);
  if (auth.response) {
    return auth.response;
  }

  const developerId = getEffectiveDeveloperId(auth.actor);
  if (!developerId) {
    return apiError(request, "DEVELOPER_ACCOUNT_REQUIRED", 403);
  }

  const { slug, version } = await params;
  try {
    await assertPluginOwnership(slug, developerId);
  } catch {
    return apiError(request, "NOT_OWNER", 403);
  }
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
    assertReviewTransition(record.reviewState, "SUBMITTED");
  } catch (error) {
    return apiError(request, "INVALID_TRANSITION", 409);
  }

  const updated = updatePluginVersionReviewState({
    state,
    slug,
    version,
    reviewState: "SUBMITTED",
  });

  return NextResponse.json({ version: updated });
}
