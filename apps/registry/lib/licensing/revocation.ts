/**
 * License revocation store and verifier cache invalidation (Req 13.8, 18.2).
 *
 * Production uses the Prisma-backed implementation. The in-memory variant is
 * kept for unit tests.
 */

import type { RevocationLookup } from "./verifier";

export interface RevocationRecord {
  licenseId: string;
  licenseKeyHash: string;
  reason: string;
  revokedById: string;
  revokedAt: Date;
  note?: string | null;
}

export interface RevocationStore extends RevocationLookup {
  add(record: RevocationRecord): Promise<void>;
  list(): Promise<RevocationRecord[]>;
  invalidateCache(): void;
}

export function createInMemoryRevocationStore(): RevocationStore {
  const byHash = new Map<string, RevocationRecord>();

  return {
    async add(record) {
      byHash.set(record.licenseKeyHash, { ...record });
    },
    async isRevoked(licenseKeyHash) {
      return byHash.has(licenseKeyHash);
    },
    async list() {
      return [...byHash.values()]
        .sort((left, right) => right.revokedAt.getTime() - left.revokedAt.getTime())
        .map((r) => ({ ...r }));
    },
    invalidateCache() {
      // No-op for in-memory; production stores wire this to their cache layer.
    },
  };
}

interface PrismaRevocationLike {
  licenseRevocation: {
    findFirst(args: unknown): Promise<unknown>;
    findMany(args: unknown): Promise<unknown[]>;
    upsert(args: unknown): Promise<unknown>;
  };
  license: {
    findUnique(args: unknown): Promise<unknown>;
    update(args: unknown): Promise<unknown>;
  };
}

interface RevocationRow {
  id: string;
  licenseId: string;
  reason: string;
  revokedById: string;
  revokedAt: Date;
  note: string | null;
}

interface LicenseHashRow {
  licenseKeyHash: string;
  state: string;
}

const REVOCATION_CACHE_TTL_MS = 30_000;

export function createPrismaRevocationStore(
  prisma: PrismaRevocationLike,
): RevocationStore {
  // Cache the set of revoked license-key hashes; invalidate on add() and
  // every TTL_MS for safety against multi-process drift.
  let cachedAt = 0;
  let cache: Set<string> | null = null;

  async function getCache(): Promise<Set<string>> {
    if (cache && Date.now() - cachedAt < REVOCATION_CACHE_TTL_MS) {
      return cache;
    }
    const rows = (await prisma.licenseRevocation.findMany({
      select: {
        license: { select: { licenseKeyHash: true, state: true } },
      },
    })) as Array<{ license: LicenseHashRow }>;
    cache = new Set(
      rows
        .filter((row) => row.license)
        .map((row) => row.license.licenseKeyHash),
    );
    cachedAt = Date.now();
    return cache;
  }

  return {
    async add(record) {
      // Look up license by hash to associate the revocation.
      const license = (await prisma.license.findUnique({
        where: { licenseKeyHash: record.licenseKeyHash },
        select: { id: true },
      })) as { id: string } | null;

      if (!license) {
        throw new Error(`License not found for hash ${record.licenseKeyHash}`);
      }

      await prisma.licenseRevocation.upsert({
        where: { licenseId: license.id },
        create: {
          licenseId: license.id,
          reason: record.reason,
          revokedById: record.revokedById,
          revokedAt: record.revokedAt,
          note: record.note ?? null,
        },
        update: {
          reason: record.reason,
          revokedById: record.revokedById,
          revokedAt: record.revokedAt,
          note: record.note ?? null,
        },
      });

      await prisma.license.update({
        where: { id: license.id },
        data: { state: "REVOKED" },
      });

      cache = null;
    },
    async isRevoked(licenseKeyHash) {
      const set = await getCache();
      return set.has(licenseKeyHash);
    },
    async list() {
      const rows = (await prisma.licenseRevocation.findMany({
        orderBy: { revokedAt: "desc" },
        include: {
          license: { select: { licenseKeyHash: true } },
        },
      })) as Array<RevocationRow & { license: LicenseHashRow | null }>;
      return rows.map((row) => ({
        licenseId: row.licenseId,
        licenseKeyHash: row.license?.licenseKeyHash ?? "",
        reason: row.reason,
        revokedById: row.revokedById,
        revokedAt: row.revokedAt,
        note: row.note,
      }));
    },
    invalidateCache() {
      cache = null;
    },
  };
}

export type RevokeLicenseErrorCode =
  | "LICENSE_NOT_FOUND"
  | "ALREADY_REVOKED"
  | "REASON_REQUIRED";

export interface RevokeLicenseInput {
  licenseId: string;
  licenseKeyHash: string;
  reason: string;
  revokedById: string;
  note?: string | null;
}

export interface RevokeLicenseResult {
  success: boolean;
  errorCode?: RevokeLicenseErrorCode;
  record?: RevocationRecord;
}

export async function revokeLicense(
  input: RevokeLicenseInput,
  store: RevocationStore,
): Promise<RevokeLicenseResult> {
  if (!input.reason.trim()) {
    return { success: false, errorCode: "REASON_REQUIRED" };
  }
  const existing = await store.isRevoked(input.licenseKeyHash);
  if (existing) {
    return { success: false, errorCode: "ALREADY_REVOKED" };
  }

  const record: RevocationRecord = {
    licenseId: input.licenseId,
    licenseKeyHash: input.licenseKeyHash,
    reason: input.reason.trim(),
    revokedById: input.revokedById,
    revokedAt: new Date(),
    note: input.note ?? null,
  };

  await store.add(record);
  store.invalidateCache();
  return { success: true, record };
}
