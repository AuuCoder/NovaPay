/**
 * Rate limiting middleware for the Registry Public API (Req 17.8).
 *
 * Phase 1 implementation: in-memory sliding-window counter keyed by
 * `x-novapay-instance-id`. Production deployments should replace this with
 * a Redis-backed store for multi-instance consistency.
 *
 * Default limit: 600 requests per minute per instance (Req 17.8).
 */

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: Date;
  retryAfterSeconds: number | null;
}

export interface RateLimiter {
  check(key: string): RateLimitResult;
  consume(key: string): RateLimitResult;
}

export interface RateLimiterConfig {
  windowMs?: number;
  maxRequests?: number;
}

const DEFAULT_WINDOW_MS = 60_000;
const DEFAULT_MAX_REQUESTS = 600;

interface WindowEntry {
  count: number;
  windowStart: number;
}

export function createInMemoryRateLimiter(
  config: RateLimiterConfig = {},
): RateLimiter {
  const windowMs = config.windowMs ?? DEFAULT_WINDOW_MS;
  const maxRequests = config.maxRequests ?? DEFAULT_MAX_REQUESTS;
  const windows = new Map<string, WindowEntry>();

  function getOrCreateWindow(key: string, now: number): WindowEntry {
    const existing = windows.get(key);
    if (existing && now - existing.windowStart < windowMs) {
      return existing;
    }
    const entry: WindowEntry = { count: 0, windowStart: now };
    windows.set(key, entry);
    return entry;
  }

  function buildResult(entry: WindowEntry, now: number): RateLimitResult {
    const resetAt = new Date(entry.windowStart + windowMs);
    const remaining = Math.max(0, maxRequests - entry.count);
    const allowed = entry.count <= maxRequests;
    const retryAfterSeconds = allowed
      ? null
      : Math.ceil((entry.windowStart + windowMs - now) / 1000);
    return { allowed, remaining, resetAt, retryAfterSeconds };
  }

  return {
    check(key: string): RateLimitResult {
      const now = Date.now();
      const entry = getOrCreateWindow(key, now);
      return buildResult(entry, now);
    },
    consume(key: string): RateLimitResult {
      const now = Date.now();
      const entry = getOrCreateWindow(key, now);
      entry.count += 1;
      return buildResult(entry, now);
    },
  };
}
