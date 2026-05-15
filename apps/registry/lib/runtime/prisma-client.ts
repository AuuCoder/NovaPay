/**
 * Lazy accessor for the Registry's Prisma client.
 *
 * Avoids importing `../../generated/prisma/client` at module-evaluation time
 * so the rest of the runtime works in environments where `prisma generate`
 * hasn't been run yet (test fixtures, fresh checkouts).
 *
 * Usage:
 *   const prisma = await getPrismaClient();
 *   const dev = await prisma.developer.findUnique(...);
 */

type PrismaClientLike = unknown;

let cached: PrismaClientLike | null = null;
let cachedPromise: Promise<PrismaClientLike> | null = null;

/**
 * Returns the Prisma client, loading it lazily on first call.
 * Returns null when the generated client cannot be loaded (in which case
 * callers should fall back to in-memory stores).
 */
export async function getPrismaClient(): Promise<PrismaClientLike | null> {
  if (cached) return cached;
  if (cachedPromise) return cachedPromise;

  cachedPromise = loadClient();
  cached = await cachedPromise;
  return cached;
}

async function loadClient(): Promise<PrismaClientLike | null> {
  try {
    // The generated client lives at ../../generated/prisma/client relative
    // to apps/registry/lib/runtime/. We dynamic-import it so the module
    // doesn't fail at parse time when generation hasn't run.
    const mod = await import("../../generated/prisma/client" as string).catch(() => null);
    if (!mod) return null;

    const PrismaClientCtor =
      (mod as { PrismaClient?: new () => PrismaClientLike }).PrismaClient;
    if (!PrismaClientCtor) return null;

    return new PrismaClientCtor();
  } catch {
    return null;
  }
}

/**
 * Force-resets the cached client (for testing only).
 */
export function __resetPrismaClient() {
  cached = null;
  cachedPromise = null;
}
