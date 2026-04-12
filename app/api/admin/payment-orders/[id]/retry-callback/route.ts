import { NextResponse } from "next/server";
import { ensureAdminApiPermission } from "@/lib/admin-route-auth";
import { dispatchMerchantCallback } from "@/lib/callbacks/service";
import { isAppError } from "@/lib/errors";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await ensureAdminApiPermission("callback:write");

  if (!auth.ok) {
    return auth.response;
  }

  const { id } = await context.params;

  try {
    const result = await dispatchMerchantCallback(id, true);

    return NextResponse.json(result);
  } catch (error) {
    if (isAppError(error)) {
      return NextResponse.json(
        {
          error: error.message,
          code: error.code,
        },
        { status: error.status },
      );
    }

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to retry callback.",
      },
      { status: 500 },
    );
  }
}
