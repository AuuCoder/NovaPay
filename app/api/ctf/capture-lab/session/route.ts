import { NextResponse } from "next/server";
import { createCtfCaptureLabSession } from "@/lib/ctf-capture-lab/app";
import { isRecord } from "@/lib/payments/utils";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let body: unknown = {};
  try {
    body = await request.json();
  } catch {}

  const session = createCtfCaptureLabSession({
    deviceId: isRecord(body) && typeof body.deviceId === "string" ? body.deviceId : null,
  });

  return NextResponse.json({
    ok: true,
    appName: "NovaPay CTF Capture Lab App",
    sessionId: session.sessionId,
    deviceId: session.deviceId,
    // 这个 secret 故意发给前端沙箱 App；训练者可通过抓包/Hook/逆向前端逻辑拿到签名材料。
    deviceSecret: session.deviceSecret,
    signatureBase: "METHOD\\nPATH\\nTIMESTAMP_MS\\nNONCE\\nRAW_BODY",
  });
}
