import { NextResponse, type NextRequest } from "next/server";
import { createPersistentPatStore } from "../../../../../lib/auth/developer-pat";
import { requireRegistryDeveloperSessionRequest } from "../../../../../lib/auth/session";
import { apiError } from "../../../../../lib/api/response";

export const runtime = "nodejs";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireRegistryDeveloperSessionRequest(request);
  if (auth.response) {
    return auth.response;
  }

  const { id } = await params;
  const store = createPersistentPatStore();
  const revoked = await store.revoke(id, auth.session.actorId);

  if (!revoked) {
    return apiError(request, "TOKEN_NOT_FOUND", 404);
  }

  return NextResponse.json({
    token: {
      id: revoked.id,
      name: revoked.name,
      tokenPreview: revoked.tokenPreview,
      status: revoked.status,
      lastUsedAt: revoked.lastUsedAt?.toISOString() ?? null,
      createdAt: revoked.createdAt.toISOString(),
      revokedAt: revoked.revokedAt?.toISOString() ?? null,
    },
  });
}
