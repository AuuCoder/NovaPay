/**
 * Audit log writer for the Registry (Req 3.2, 19.1, 22.3).
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

export interface AuditLogger {
  write(entry: Omit<AuditLogEntry, "createdAt">): Promise<void>;
  list(options?: { limit?: number }): Promise<AuditLogEntry[]>;
}

export function createInMemoryAuditLogger(): AuditLogger {
  const entries: AuditLogEntry[] = [];

  return {
    async write(entry) {
      entries.push({ ...entry, createdAt: new Date() });
    },
    async list(options) {
      const limit = options?.limit ?? 100;
      return entries.slice(-limit);
    },
  };
}
