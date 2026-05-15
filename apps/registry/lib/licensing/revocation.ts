/**
 * License revocation store and verifier cache invalidation (Req 13.8, 18.2).
 *
 * Phase 3 ships an in-memory revocation set so the License verifier can
 * short-circuit before signature verification. Production deployments will
 * back this with the LicenseRevocation Prisma table and trigger cache
 * invalidation on every revocation event.
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
      return [...byHash.values()].map((r) => ({ ...r }));
    },
    invalidateCache() {
      // No-op for in-memory; production stores wire this to their cache layer.
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
