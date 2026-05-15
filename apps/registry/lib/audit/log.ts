/**
 * Audit log writer for the Registry (Req 3.2, 19.1, 22.3, 13.13).
 *
 * Phase 1 provides an in-memory implementation for testing. The Prisma-backed
 * writer will be wired once the Registry database is provisioned.
 */

export interface AuditLogEntry {
  actorType: "ADMIN" | "DEVELOPER" | "SYSTEM";
  actorId: string;
  action: string;
  targetKind?: string | null;
  targetId?: string | null;
  payload?: Record<string, unknown> | null;
  ip?: string | null;
  createdAt: Date;
}

/**
 * Standard action constants for cross-cutting audit events. Phase 3 introduces
 * the LICENSE_*, PAYOUT_*, and SIGNING_KEY_ROTATE actions (Req 13.13).
 */
export const AUDIT_ACTIONS = {
  // Plugin lifecycle (Phase 1)
  PLUGIN_PUBLISHED: "PLUGIN_PUBLISHED",
  PLUGIN_TAKEN_DOWN: "PLUGIN_TAKEN_DOWN",
  PLUGIN_RESTORED: "PLUGIN_RESTORED",
  TRUST_KEY_MISMATCH: "TRUST_KEY_MISMATCH",

  // License lifecycle (Phase 3, Req 13.13)
  LICENSE_ISSUED: "LICENSE_ISSUED",
  LICENSE_REVOKED: "LICENSE_REVOKED",

  // Payouts (Phase 3, Req 4.4, 4.5)
  PAYOUT_APPROVED: "PAYOUT_APPROVED",
  PAYOUT_REJECTED: "PAYOUT_REJECTED",

  // Signing keys (Phase 3, Req 19.3)
  SIGNING_KEY_ROTATED: "SIGNING_KEY_ROTATED",
} as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS] | string;

export interface AuditLogger {
  write(entry: Omit<AuditLogEntry, "createdAt">): Promise<void>;
  list(options?: { limit?: number; action?: AuditAction }): Promise<AuditLogEntry[]>;
}

export function createInMemoryAuditLogger(): AuditLogger {
  const entries: AuditLogEntry[] = [];

  return {
    async write(entry) {
      entries.push({ ...entry, createdAt: new Date() });
    },
    async list(options) {
      const limit = options?.limit ?? 100;
      const filtered = options?.action
        ? entries.filter((e) => e.action === options.action)
        : entries;
      return filtered.slice(-limit);
    },
  };
}
