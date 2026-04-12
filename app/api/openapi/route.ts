import { NextResponse } from "next/server";
import { getCurrentLocale } from "@/lib/i18n-server";
import { getOpenApiSpec } from "@/lib/openapi";

export const runtime = "nodejs";

export async function GET() {
  const locale = await getCurrentLocale();
  return NextResponse.json(getOpenApiSpec(locale));
}
