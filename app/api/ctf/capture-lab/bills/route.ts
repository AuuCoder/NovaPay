import { NextResponse } from "next/server";
import { isAppError } from "@/lib/errors";
import {
  encodeCtfCaptureLabEnvelope,
  listCtfCaptureLabBills,
  verifyCtfCaptureLabSignedRequest,
} from "@/lib/ctf-capture-lab/app";
import { isRecord } from "@/lib/payments/utils";

export const runtime = "nodejs";

function fail(status: number, message: string) {
  return NextResponse.json({ ok: false, message }, { status });
}

export async function POST(request: Request) {
  const rawBody = await request.text();

  try {
    const session = verifyCtfCaptureLabSignedRequest({
      method: request.method,
      path: new URL(request.url).pathname,
      body: rawBody,
      headers: request.headers,
    });
    const body = JSON.parse(rawBody || "{}");
    const limit = isRecord(body) && typeof body.limit === "number" ? body.limit : 10;
    const bills = listCtfCaptureLabBills(session.sessionId, limit);

    return NextResponse.json({
      ok: true,
      algorithm: "base64url(json({version,issuedAt,rows}))",
      count: bills.length,
      envelope: encodeCtfCaptureLabEnvelope(bills),
    });
  } catch (error) {
    return fail(
      isAppError(error) ? error.status : 400,
      error instanceof Error ? error.message : "invalid CTF lab bill-list request",
    );
  }
}
