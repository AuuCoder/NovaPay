import { NextResponse } from "next/server";
import { isAppError } from "@/lib/errors";
import {
  assertCtfCollectorSecret,
  ingestCtfBillCaptureEvent,
  parseCtfBillCapturePayloadForAccount,
} from "@/lib/ctf-bill-capture/service";
import { getCtfBillCaptureAccountBySecureRoute } from "@/lib/payments/provider-accounts";

export const runtime = "nodejs";

function failureResponse(status: number, message: string) {
  return NextResponse.json(
    {
      ok: false,
      message,
    },
    { status },
  );
}

async function readJsonPayload(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    return request.json();
  }

  const text = await request.text();
  if (!text.trim()) {
    return {};
  }

  try {
    return JSON.parse(text);
  } catch {
    return Object.fromEntries(new URLSearchParams(text).entries());
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ accountId: string; token: string }> },
) {
  try {
    const routeParams = await context.params;
    const runtimeAccount = await getCtfBillCaptureAccountBySecureRoute({
      accountId: routeParams.accountId,
      callbackToken: routeParams.token,
    });

    if (!runtimeAccount) {
      return failureResponse(404, "merchant channel account not found");
    }

    assertCtfCollectorSecret({
      account: runtimeAccount,
      providedSecret: request.headers.get("x-ctf-capture-secret"),
    });

    const payload = await parseCtfBillCapturePayloadForAccount({
      raw: await readJsonPayload(request),
      account: runtimeAccount,
    });
    const result = await ingestCtfBillCaptureEvent({
      account: runtimeAccount,
      payload,
      matchImmediately: true,
    });

    return NextResponse.json({
      ok: true,
      ...result,
    });
  } catch (error) {
    return failureResponse(
      isAppError(error) ? error.status : 400,
      error instanceof Error ? error.message : "invalid CTF bill capture payload",
    );
  }
}
