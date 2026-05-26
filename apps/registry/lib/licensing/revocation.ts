/**
 * License revocation store and verifier cache invalidation (Req 13.8, 18.2).
 *
 * The Registry now supports both file-backed persistence for local/dev flows
 * and Prisma-backed persistence via `createPrismaRevocationStore`.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
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

interface PersistedRevocationRecord extends Omit<RevocationRecord, "revokedAt"> {
  revokedAt: string;
}

function toPersisted(record: RevocationRecord): PersistedRevocationRecord {
  return {
    ...record,
    revokedAt: record.revokedAt.toISOString(),
  };
}

function fromPersisted(record: PersistedRevocationRecord): RevocationRecord {
  return {
    ...record,
    revokedAt: new Date(record.revokedAt),
  };
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

export function createPersistentRevocationStore(filePath: string): RevocationStore {
  function load() {
    if (!existsSync(filePath)) {
      return [] as PersistedRevocationRecord[];
    }

    try {
      return JSON.parse(readFileSync(filePath, "utf8")) as PersistedRevocationRecord[];
    } catch {
      return [] as PersistedRevocationRecord[];
    }
  }

  function save(records: RevocationRecord[]) {
    mkdirSync(path.dirname(filePath), { recursive: true });
    writeFileSync(filePath, JSON.stringify(records.map(toPersisted), null, 2), "utf8");
  }

  const records = load().map(fromPersisted);
  const byHash = new Map(records.map((record) => [record.licenseKeyHash, record]));

  function ordered() {
    return [...byHash.values()].sort(
      (left, right) => right.revokedAt.getTime() - left.revokedAt.getTime(),
    );
  }

  return {
    async add(record) {
      byHash.set(record.licenseKeyHash, { ...record });
      save(ordered());
    },
    async isRevoked(licenseKeyHash) {
      return byHash.has(licenseKeyHash);
    },
    async list() {
      return ordered().map((record) => ({ ...record }));
    },
    invalidateCache() {
      // File-backed store has no additional cache layer.
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
