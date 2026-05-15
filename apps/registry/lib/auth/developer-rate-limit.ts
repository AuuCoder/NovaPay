/**
 * Developer API rate limiting (Req 9.4, 9.5).
 *
 * Default: 60 requests per minute per developer.
 * Exceeding returns HTTP 429 with Retry-After header.
 */

import { createInMemoryRateLimiter, type RateLimiter } from "../rate-limit/index";

export const DEVELOPER_RATE_LIMIT_PER_MIN = 60;

let developerRateLimiter: RateLimiter | null = null;

export function getDeveloperRateLimiter(): RateLimiter {
  if (!developerRateLimiter) {
    developerRateLimiter = createInMemoryRateLimiter({
      maxRequests: DEVELOPER_RATE_LIMIT_PER_MIN,
      windowMs: 60_000,
    });
  }
  return developerRateLimiter;
}
