import { NextResponse, type NextRequest } from "next/server";
import { requireRegistryAdminRequest } from "../../../../../../lib/auth/session";
import { getRegistryRuntime } from "../../../../../../lib/runtime/state";
import { revokeLicense } from "../../../../../../lib/licensing/revocation";
import { apiError } from "../../../../../../lib/api/response";

export const runtime = "nodejs";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireRegistryAdminRequest(request);
  if (auth.response) {
    return auth.response;
  }

  const { id } = await params;
  const body = (await request.json().catch(() => null)) as
    | { reason?: string; note?: string | null }
    | null;

  const reason = typeof body?.reason === "string" ? body.reason.trim() : "";
  const note =
    typeof body?.note === "string" && body.note.trim() ? body.note.trim() : null;

  const state = await getRegistryRuntime();
  const license = await state.licenseStore.findById(id);

  if (!license) {
    return apiError(request, "LICENSE_NOT_FOUND", 404, { id });
  }

  const revoked = await revokeLicense(
    {
      licenseId: license.id,
      licenseKeyHash: license.licenseKeyHash,
      reason,
      revokedById: auth.session.actorId,
      note,
    },
    state.revocations,
  );

  if (!revoked.success) {
    return apiError(
      request,
      revoked.errorCode ?? "ALREADY_REVOKED",
      revoked.errorCode === "REASON_REQUIRED" ? 400 : 409,
    );
  }

  const updatedLicense = await state.licenseStore.markRevoked(license.id);

  return NextResponse.json({
    success: true,
    license: updatedLicense,
    revocation: revoked.record,
  });
}
