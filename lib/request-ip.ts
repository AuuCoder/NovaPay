import { isIP } from "node:net";

/**
 * Resolve the client IP for allowlist checks and audit.
 *
 * `X-Forwarded-For` is client-controllable, so trusting its left-most value
 * lets an attacker spoof the IP (bypassing merchant IP allowlists / poisoning
 * audit records). Preference order:
 *   1. A configured trusted header (`TRUSTED_CLIENT_IP_HEADER`) injected and
 *      overwritten by the edge proxy.
 *   2. `X-Forwarded-For`: take the entry `TRUSTED_PROXY_COUNT` hops from the
 *      right (default 1 = what the nearest trusted proxy observed), NOT the
 *      spoofable left-most value.
 *
 * Note: this is only trustworthy when the origin exclusively accepts traffic
 * from the trusted edge/proxy. Enforce that at the network layer as well.
 */
export function getRequestClientIp(request: Request) {
  const configuredHeader = process.env.TRUSTED_CLIENT_IP_HEADER?.trim().toLowerCase();
  if (configuredHeader) {
    return normalizeIp(request.headers.get(configuredHeader));
  }

  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    const parts = forwardedFor
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);

    if (parts.length > 0) {
      const proxyCount = Number(process.env.TRUSTED_PROXY_COUNT?.trim() || "1");
      const hops = Number.isInteger(proxyCount) && proxyCount > 0 ? proxyCount : 1;
      const index = Math.max(0, parts.length - hops);
      return normalizeIp(parts[index] ?? parts[parts.length - 1]);
    }
  }

  return null;
}

function normalizeIp(value: string | null | undefined) {
  const trimmed = value?.trim() ?? "";
  const normalized = trimmed.startsWith("::ffff:")
    ? trimmed.slice("::ffff:".length)
    : trimmed;

  return isIP(normalized) ? normalized : null;
}
