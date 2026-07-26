import { promises as dns } from "node:dns";
import { request as httpsRequest } from "node:https";
import { BlockList, isIP, type LookupFunction } from "node:net";
import type { LookupAddress } from "node:dns";

const blockedAddresses = new BlockList();

for (const [network, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const) {
  blockedAddresses.addSubnet(network, prefix, "ipv4");
}

for (const [network, prefix] of [
  ["::", 128],
  ["::1", 128],
  ["64:ff9b::", 96],
  ["100::", 64],
  ["2001:db8::", 32],
  ["2002::", 16],
  ["::", 96],
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8],
] as const) {
  blockedAddresses.addSubnet(network, prefix, "ipv6");
}

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "metadata",
  "metadata.google.internal",
  "metadata.google",
  "instance-data",
]);

export interface SafeFetchOptions {
  method: "GET" | "POST";
  headers?: Record<string, string>;
  body?: string;
  timeoutMs: number;
  maxResponseBytes?: number;
}

export function isBlockedCallbackAddress(address: string) {
  const family = isIP(address);
  if (family === 4) {
    return blockedAddresses.check(address, "ipv4");
  }
  if (family === 6) {
    if (address.toLowerCase().startsWith("::ffff:")) {
      return true;
    }
    return blockedAddresses.check(address, "ipv6");
  }
  return true;
}

export function parseSafeCallbackUrl(rawUrl: string) {
  let url: URL;

  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error("Callback URL is invalid.");
  }

  if (url.protocol !== "https:") {
    throw new Error("Callback URL must use HTTPS.");
  }
  if (url.username || url.password) {
    throw new Error("Callback URL must not contain user information.");
  }
  if (url.port && url.port !== "443") {
    throw new Error("Callback URL must use port 443.");
  }

  const hostname = url.hostname
    .toLowerCase()
    .replace(/^\[|\]$/g, "")
    .replace(/\.$/, "");
  if (
    !hostname ||
    isIP(hostname) !== 0 ||
    BLOCKED_HOSTNAMES.has(hostname) ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local")
  ) {
    throw new Error("Callback URL hostname is not allowed.");
  }

  return { url, hostname };
}

async function resolveSafeCallbackAddress(hostname: string) {
  const addresses = await dns.lookup(hostname, { all: true, verbatim: true });
  if (addresses.length === 0) {
    throw new Error("Callback hostname did not resolve.");
  }

  const blocked = addresses.find((item) => isBlockedCallbackAddress(item.address));
  if (blocked) {
    throw new Error(`Callback hostname resolved to a blocked address (${blocked.address}).`);
  }

  return (addresses.find((item) => item.family === 4) ?? addresses[0])!;
}

export function createPinnedLookup(selectedAddress: LookupAddress): LookupFunction {
  return (_hostname, lookupOptions, callback) => {
    if (lookupOptions.all) {
      callback(null, [selectedAddress]);
      return;
    }
    callback(null, selectedAddress.address, selectedAddress.family);
  };
}

export async function safeFetch(rawUrl: string, options: SafeFetchOptions) {
  const { url, hostname } = parseSafeCallbackUrl(rawUrl);
  const selectedAddress = await resolveSafeCallbackAddress(hostname);
  const maxResponseBytes = options.maxResponseBytes ?? 8 * 1024;

  return new Promise<Response>((resolve, reject) => {
    const request = httpsRequest(
      {
        protocol: "https:",
        hostname,
        port: 443,
        path: `${url.pathname}${url.search}`,
        method: options.method,
        headers: {
          ...options.headers,
          host: url.host,
        },
        agent: false,
        lookup: createPinnedLookup(selectedAddress),
      },
      (response) => {
        const chunks: Buffer[] = [];
        let size = 0;

        response.on("data", (chunk: Buffer | string) => {
          const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
          size += buffer.length;
          if (size > maxResponseBytes) {
            response.destroy(new Error("Callback response exceeded the size limit."));
            return;
          }
          chunks.push(buffer);
        });
        response.on("error", reject);
        response.on("end", () => {
          const headers = new Headers();
          for (const [name, value] of Object.entries(response.headers)) {
            if (Array.isArray(value)) {
              for (const item of value) headers.append(name, item);
            } else if (value !== undefined) {
              headers.set(name, String(value));
            }
          }
          resolve(
            new Response(Buffer.concat(chunks), {
              status: response.statusCode ?? 500,
              headers,
            }),
          );
        });
      },
    );

    request.setTimeout(options.timeoutMs, () => {
      request.destroy(new Error("Callback request timed out."));
    });
    request.on("error", reject);
    if (options.body) request.write(options.body);
    request.end();
  });
}

/**
 * Validate that an arbitrary outbound URL points to a public host, rejecting
 * loopback / private / link-local / carrier-grade-NAT / metadata targets.
 *
 * Unlike `safeFetch`, this does not cap the response body or force port 443 —
 * it is a pre-fetch guard for callers that must use a plain `fetch` (plugin
 * bundle downloads, merchant-configured upstream gateways). Note: it validates
 * at check-time; full DNS-rebinding safety additionally requires pinning the
 * resolved address into the actual connection.
 */
export async function assertPublicHttpUrl(
  rawUrl: string,
  options?: { allowHttp?: boolean },
) {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error("URL is invalid.");
  }

  const allowHttp = options?.allowHttp ?? false;
  if (url.protocol !== "https:" && !(allowHttp && url.protocol === "http:")) {
    throw new Error("URL must use HTTPS.");
  }
  if (url.username || url.password) {
    throw new Error("URL must not contain user information.");
  }

  const hostname = url.hostname
    .toLowerCase()
    .replace(/^\[|\]$/g, "")
    .replace(/\.$/, "");

  if (
    !hostname ||
    BLOCKED_HOSTNAMES.has(hostname) ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local")
  ) {
    throw new Error("URL hostname is not allowed.");
  }

  if (isIP(hostname) !== 0) {
    if (isBlockedCallbackAddress(hostname)) {
      throw new Error("URL points to a blocked address.");
    }
    return url;
  }

  const addresses = await dns.lookup(hostname, { all: true, verbatim: true });
  if (addresses.length === 0) {
    throw new Error("URL hostname did not resolve.");
  }
  const blocked = addresses.find((item) => isBlockedCallbackAddress(item.address));
  if (blocked) {
    throw new Error(`URL resolves to a blocked address (${blocked.address}).`);
  }

  return url;
}

export function redactCallbackUrl(rawUrl: string) {
  try {
    const url = new URL(rawUrl);
    return `${url.origin}${url.pathname}`;
  } catch {
    return "<invalid-callback-url>";
  }
}
