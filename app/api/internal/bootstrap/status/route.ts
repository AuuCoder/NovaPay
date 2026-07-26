import { NextResponse } from "next/server";
import { getPlatformBootstrapStatus } from "@/lib/platform-bootstrap";
import { isAuthorizedInternalRequest } from "@/lib/internal-auth";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const status = await getPlatformBootstrapStatus();

  // Before setup the wizard needs the full status. After setup completes, only
  // expose the detailed configuration flags to authorized callers so the
  // endpoint can't be used for reconnaissance.
  if (status.setupComplete && !(await isAuthorizedInternalRequest(request))) {
    return NextResponse.json({ setupComplete: true });
  }

  return NextResponse.json(status);
}

