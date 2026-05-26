import { NextResponse } from "next/server";
import {
  getPlatformBootstrapStatus,
  runPlatformBootstrap,
  type PlatformBootstrapInput,
} from "@/lib/platform-bootstrap";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as PlatformBootstrapInput | null;

  if (!body) {
    return NextResponse.json(
      {
        success: false,
        error: "INVALID_BODY",
      },
      { status: 400 },
    );
  }

  try {
    const result = await runPlatformBootstrap(body);
    const status = await getPlatformBootstrapStatus();
    return NextResponse.json({
      success: true,
      result,
      status,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Bootstrap failed.",
      },
      { status: 400 },
    );
  }
}
