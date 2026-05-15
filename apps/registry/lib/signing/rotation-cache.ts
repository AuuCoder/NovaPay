/**
 * Trust.json cache invalidation hook (Req 19.2, 19.3).
 *
 * The `/.well-known/trust.json` route caches the public key set with
 * `Cache-Control: public, max-age=300`. After a rotation we want consumers
 * (NovaPay instances) to pick up the new currentKey + previousKeys quickly,
 * so we expose a process-local cache version that the route includes in its
 * ETag and the rotation handler bumps.
 */

let trustJsonCacheVersion = 0;

export function bumpTrustJsonCacheVersion(): number {
  trustJsonCacheVersion += 1;
  return trustJsonCacheVersion;
}

export function getTrustJsonCacheVersion(): number {
  return trustJsonCacheVersion;
}
