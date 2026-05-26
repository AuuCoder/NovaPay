import { NextResponse, type NextRequest } from "next/server";
import { requireRegistryAdminRequest } from "../../../../../../../../lib/auth/session";
import {
  getPluginVersionRecord,
  getRegistryRuntime,
  updatePluginVersionReviewState,
} from "../../../../../../../../lib/runtime/state";
import { assertReviewTransition } from "../../../../../../../../lib/review/state-machine";
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

  if (!record) {
    return apiError(request, "VERSION_NOT_FOUND", 404, { slug, version });
  }

  try {
    assertReviewTransition(record.reviewState, "APPROVED");
  } catch (error) {
    return apiError(request, "INVALID_TRANSITION", 409);
  }

  const updated = updatePluginVersionReviewState({
    state,
    slug,
    version,
    reviewState: "APPROVED",
  });

  return NextResponse.json({ version: updated });
}
