import { NextResponse } from "next/server";
import { listPaymentChannels } from "@/lib/payments/registry";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({
    channels: listPaymentChannels(),
  });
}
