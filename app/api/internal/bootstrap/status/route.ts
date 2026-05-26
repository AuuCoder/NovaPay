import { NextResponse } from "next/server";
import { getPlatformBootstrapStatus } from "@/lib/platform-bootstrap";

export const runtime = "nodejs";

export async function GET() {
  const status = await getPlatformBootstrapStatus();
  return NextResponse.json(status);
}

