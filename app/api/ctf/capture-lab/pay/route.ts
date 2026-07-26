import { NextResponse } from "next/server";
import { isAppError } from "@/lib/errors";
import {
  createCtfCaptureLabBill,
  encodeCtfCaptureLabEnvelope,
  parseCtfCaptureLabPaymentInput,
  toCtfCaptureLabBillJson,
  verifyCtfCaptureLabSignedRequest,
} from "@/lib/ctf-capture-lab/app";

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
    const input = parseCtfCaptureLabPaymentInput(JSON.parse(rawBody || "{}"));
    const bill = createCtfCaptureLabBill({
      sessionId: session.sessionId,
      ...input,
    });

    return NextResponse.json({
      ok: true,
      message: "CTF lab bill created. Capture /api/ctf/capture-lab/bills or hook the app decoder.",
      billPreview: {
        externalBillId: bill.externalBillId,
        amount: bill.amount,
        paidAt: bill.paidAt.toISOString(),
      },
      envelope: encodeCtfCaptureLabEnvelope([bill]),
      decodedHint: toCtfCaptureLabBillJson(bill),
    });
  } catch (error) {
    return fail(
      isAppError(error) ? error.status : 400,
      error instanceof Error ? error.message : "invalid CTF lab payment request",
    );
  }
}
