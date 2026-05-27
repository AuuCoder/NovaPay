export function resolveRequestOrigin(request: Request): string {
  const headers = request.headers;
  const forwardedHost = headers.get("x-forwarded-host");
  const host = forwardedHost?.split(",")[0]?.trim() || headers.get("host");
  const forwardedProto = headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const proto = forwardedProto || new URL(request.url).protocol.replace(":", "");
  if (host) {
    return `${proto}://${host}`;
  }
  return new URL(request.url).origin;
}
