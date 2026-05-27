import { NextResponse, type NextRequest } from "next/server";
import { requireRegistryDeveloperRequest } from "../../../../../../../../lib/auth/session";
import { assertPluginOwnership, canDeveloperManagePlugin } from "../../../../../../../../lib/developer/plugin-ownership";
import {
  createPluginVersionTestSession,
  getRegistryRuntime,
  listPluginVersionTestSessions,
} from "../../../../../../../../lib/runtime/state";
import { runPaymentPluginVerification } from "../../../../../../../../lib/testing/payment-verification";
import { apiError } from "../../../../../../../../lib/api/response";

export const runtime = "nodejs";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; version: string }> },
) {
  const auth = await requireRegistryDeveloperRequest(request);
  if (auth.response) {
    return auth.response;
  }

  if (auth.actor.kind === "SESSION" && auth.actor.session.actorKind === "DEVELOPER") {
    if (!(await canDeveloperManagePlugin((await params).slug, auth.actor.session.actorId))) {
      return apiError(request, "NOT_OWNER", 403);
    }
  }

  const { slug, version } = await params;
  const state = await getRegistryRuntime();
  const sessions = listPluginVersionTestSessions({
    state,
    pluginSlug: slug,
    version,
  });

  return NextResponse.json({ sessions });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; version: string }> },
) {
  const auth = await requireRegistryDeveloperRequest(request);
  if (auth.response) {
    return auth.response;
  }

  if (auth.actor.kind !== "SESSION" || auth.actor.session.actorKind !== "DEVELOPER") {
    return apiError(request, "DEVELOPER_ACCOUNT_REQUIRED", 403);
  }

  const { slug, version } = await params;
  try {
    await assertPluginOwnership(slug, auth.actor.session.actorId);
  } catch {
    return apiError(request, "NOT_OWNER", 403);
  }
  const state = await getRegistryRuntime();
  const bundle = state.demoBundles.get(`${slug}@${version}`);

  if (!bundle) {
    return apiError(request, "BUNDLE_NOT_FOUND", 404, { slug, version });
  }

  const verificationProfile = bundle.pipelineResult.manifest.verificationProfile;
  if (!verificationProfile) {
    return apiError(request, "VERIFICATION_PROFILE_MISSING", 400);
  }

  const body = (await request.json().catch(() => null)) as
    | { config?: Record<string, string> }
    | null;
  const submittedConfig = body?.config ?? {};

  const session = createPluginVersionTestSession({
    state,
    pluginSlug: slug,
    version,
    verificationProfile,
    submittedConfig,
  });

  const completed = await runPaymentPluginVerification({
    state,
    session,
  });

  return NextResponse.json({ session: completed });
}
