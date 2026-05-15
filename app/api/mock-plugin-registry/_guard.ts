import { NextResponse } from "next/server";

/**
 * Returns a 404 response when the application is running in production so the
 * mock plugin registry routes never serve real traffic. Returns `null` in any
 * other environment so the caller can proceed with normal handling.
 */
export function mockRegistryProductionGuard(): NextResponse | null {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json(
      { error: "mock_registry_disabled_in_production" },
      { status: 404 },
    );
  }
  return null;
}
