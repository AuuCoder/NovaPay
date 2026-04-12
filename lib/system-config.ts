import { getPrismaClient } from "@/lib/prisma";

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
    const prisma = getPrismaClient();
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
  const prisma = getPrismaClient();

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

  const prisma = getPrismaClient();

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
