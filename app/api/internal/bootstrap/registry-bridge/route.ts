import { NextResponse } from "next/server";
import { provisionRegistryBridgeFromMainSite } from "@/lib/platform-bootstrap";

export const runtime = "nodejs";

export async function POST() {
  try {
    const bridge = await provisionRegistryBridgeFromMainSite();
    return NextResponse.json({
      success: true,
      bridge,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to provision registry bridge.",
      },
      { status: 400 },
    );
  }
}
