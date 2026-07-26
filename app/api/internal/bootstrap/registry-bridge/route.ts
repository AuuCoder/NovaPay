import { NextResponse } from "next/server";
import { provisionRegistryBridgeFromMainSite } from "@/lib/platform-bootstrap";
import { isAuthorizedInternalRequest } from "@/lib/internal-auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!(await isAuthorizedInternalRequest(request))) {
    return NextResponse.json({ success: false, error: "NOT_FOUND" }, { status: 404 });
  }

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
