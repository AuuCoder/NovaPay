import { NextResponse } from "next/server";
import { readMerchantQrImageObject } from "@/lib/merchant-qr-storage";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ key: string[] }> },
) {
  const params = await context.params;
  const key = params.key.join("/");
  const result = await readMerchantQrImageObject(key);

  if (!result) {
    return NextResponse.json(
      {
        ok: false,
        message: "merchant qr image not found",
      },
      { status: 404 },
    );
  }

  return new NextResponse(result.body, {
    status: 200,
    headers: {
      "content-type": result.contentType,
      "content-length": String(result.contentLength),
      "cache-control": "private, max-age=300",
    },
  });
}
