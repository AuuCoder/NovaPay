import { NextResponse } from "next/server";
import { listAvailablePaymentChannels } from "@/lib/payments/registry";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({
    channels: await listAvailablePaymentChannels(),
  });
}
