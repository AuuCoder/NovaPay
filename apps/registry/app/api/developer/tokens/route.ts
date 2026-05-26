import { NextResponse, type NextRequest } from "next/server";
import {
  createPat,
  createPersistentPatStore,
} from "../../../../lib/auth/developer-pat";
import { requireRegistryDeveloperSessionRequest } from "../../../../lib/auth/session";
import { apiError } from "../../../../lib/api/response";

export const runtime = "nodejs";

function serializeToken(record: Awaited<ReturnType<ReturnType<typeof createPersistentPatStore>["listByDeveloper"]>>[number]) {
  return {
    id: record.id,
    name: record.name,
    tokenPreview: record.tokenPreview,
    status: record.status,
    lastUsedAt: record.lastUsedAt?.toISOString() ?? null,
    createdAt: record.createdAt.toISOString(),
    revokedAt: record.revokedAt?.toISOString() ?? null,
  };
}

export async function GET(request: NextRequest) {
  const auth = await requireRegistryDeveloperSessionRequest(request);
  if (auth.response) {
    return auth.response;
  }

  const store = createPersistentPatStore();
  const tokens = await store.listByDeveloper(auth.session.actorId);
  return NextResponse.json({ tokens: tokens.map(serializeToken) });
}

export async function POST(request: NextRequest) {
  const auth = await requireRegistryDeveloperSessionRequest(request);
  if (auth.response) {
    return auth.response;
  }

  const body = (await request.json().catch(() => null)) as { name?: string } | null;
  const name = typeof body?.name === "string" ? body.name.trim() : "";

  if (!name) {
    return apiError(request, "NAME_REQUIRED", 400);
  }

  const store = createPersistentPatStore();
  const created = createPat({
    developerId: auth.session.actorId,
    name,
  });
  await store.create(created.record);

  return NextResponse.json({
    token: created.token,
    record: serializeToken(created.record),
  });
}
