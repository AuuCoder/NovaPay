import { randomUUID } from "node:crypto";

const CACHE_TTL_MS = 30_000;
const cache = new Map<string, { value: string; expiresAt: number }>();

function getCached(key: string) {
  const entry = cache.get(key);

  if (!entry) {
    return undefined;
  }

  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return undefined;
  }

  return entry.value;
}

function setCached(key: string, value: string) {
  cache.set(key, {
    value,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });
}

async function loadPrismaClient() {
  const { getPrismaClient } = await import("@/lib/prisma");
  return getPrismaClient();
}

export function invalidateSystemConfigCache(key?: string) {
  if (key) {
    cache.delete(key);
    return;
  }

  cache.clear();
}

export async function getSystemConfig(key: string) {
  const cached = getCached(key);

  if (cached !== undefined) {
    return cached;
  }

  try {
    const prisma = await loadPrismaClient();
    const row = await prisma.systemConfig.findUnique({
      where: {
        key,
      },
    });

    if (row) {
      setCached(key, row.value);
      return row.value;
    }
  } catch {
    // Fall back to environment values when the DB is unavailable or not migrated yet.
  }

  const envValue = process.env[key];

  if (envValue !== undefined) {
    setCached(key, envValue);
  }

  return envValue;
}

export async function getAllSystemConfigs() {
  const prisma = await loadPrismaClient();

  return prisma.systemConfig.findMany({
    orderBy: [{ group: "asc" }, { key: "asc" }],
  });
}

export async function setSystemConfigs(
  configs: Array<{ key: string; value: string; group?: string; label?: string | null }>,
) {
  if (configs.length === 0) {
    return;
  }

  const prisma = await loadPrismaClient();

  await prisma.$transaction(
    configs.map((config) =>
      prisma.systemConfig.upsert({
        where: {
          key: config.key,
        },
        update: {
          value: config.value,
          ...(config.group !== undefined ? { group: config.group } : {}),
          ...(config.label !== undefined ? { label: config.label } : {}),
        },
        create: {
          key: config.key,
          value: config.value,
          group: config.group ?? "general",
          label: config.label ?? null,
        },
      }),
    ),
  );

  invalidateSystemConfigCache();
}

export const SYSTEM_CONFIG_INSTANCE_ID_KEY = "INSTANCE_ID";
export const SYSTEM_CONFIG_PLUGIN_REGISTRY_GROUP = "plugin-registry";

interface MinimalSystemConfigDelegate {
  findUnique(args: {
    where: { key: string };
  }): Promise<{ key: string; value: string } | null>;
  create(args: {
    data: {
      key: string;
      value: string;
      group?: string;
      label?: string | null;
    };
  }): Promise<{ key: string; value: string }>;
}

interface EnsureInstanceIdPrismaLike {
  systemConfig: MinimalSystemConfigDelegate;
}

/**
 * Boot-time bootstrap for the NovaPay instance identifier persisted in
 * `SystemConfig`. The function is idempotent: when `INSTANCE_ID` already
 * exists the stored value is returned untouched; when missing a fresh
 * `inst_<uuid>` is written exactly once.
 *
 * Callers SHOULD invoke this during process startup (e.g. `instrumentation.ts`
 * or a custom bootstrap) so subsequent reads (`POST /licenses/verify`,
 * registry sync) always observe a stable instance ID.
 *
 * The optional `prisma` argument exists purely so unit tests can inject an
 * in-memory client without spinning up the real Prisma adapter; production
 * callers should rely on the default `getPrismaClient()` resolution.
 */
export async function ensureInstanceId(
  prisma?: EnsureInstanceIdPrismaLike,
): Promise<string> {
  const client = (prisma ?? (await loadPrismaClient())) as EnsureInstanceIdPrismaLike;

  const existing = await client.systemConfig.findUnique({
    where: { key: SYSTEM_CONFIG_INSTANCE_ID_KEY },
  });

  if (existing) {
    setCached(SYSTEM_CONFIG_INSTANCE_ID_KEY, existing.value);
    return existing.value;
  }

  const value = `inst_${randomUUID()}`;
  await client.systemConfig.create({
    data: {
      key: SYSTEM_CONFIG_INSTANCE_ID_KEY,
      value,
      group: SYSTEM_CONFIG_PLUGIN_REGISTRY_GROUP,
      label: "NovaPay Instance ID",
    },
  });
  setCached(SYSTEM_CONFIG_INSTANCE_ID_KEY, value);
  return value;
}
