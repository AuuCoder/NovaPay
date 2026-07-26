import { NextResponse } from "next/server";
import {
  getPlatformBootstrapStatus,
  runPlatformBootstrap,
  type PlatformBootstrapInput,
} from "@/lib/platform-bootstrap";
import { isAuthorizedInternalRequest } from "@/lib/internal-auth";

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

  // Bootstrap is only open before the platform is initialized. After setup, it
  // requires an authenticated SUPER_ADMIN session or the internal service token
  // (enforced together with the "already initialized" guard in the service).
  const authorized = await isAuthorizedInternalRequest(request);

  try {
    const result = await runPlatformBootstrap(body, { allowWhenInitialized: authorized });
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
