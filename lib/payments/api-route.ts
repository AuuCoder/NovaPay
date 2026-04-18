import { NextResponse } from "next/server";
import { getPublicBaseUrl } from "@/lib/env";
import { getOptionalUrl } from "@/lib/payments/utils";
import { getRequestClientIp } from "@/lib/request-ip";

export { getRequestClientIp };

export function badRequest(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export function getRequestOrigin(request: Request) {
  const configured = getOptionalUrl(process.env.NOVAPAY_PUBLIC_BASE_URL) ?? getPublicBaseUrl();

  if (configured) {
    return configured;
  }

  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const host = forwardedHost || request.headers.get("host")?.trim();

  if (host) {
    return `${forwardedProto || "http"}://${host}`;
  }

  return new URL(request.url).origin.replace("0.0.0.0", "localhost");
}
