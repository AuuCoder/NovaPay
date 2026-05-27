/**
 * Developer Personal Access Token (PAT) management (Req 9.2, 9.3).
 *
 * PATs are used for CI/CD integration via `Authorization: Bearer <token>`.
 * Only the sha256 hash of the token is stored; the raw token is returned
 * exactly once at creation time.
 */

import { createHash, randomBytes } from "node:crypto";
import { getPrismaClient } from "../runtime/prisma-client";

export interface DeveloperTokenRecord {
  id: string;
  developerId: string;
  tokenHash: string;
  tokenPreview: string;
  name: string;
  status: "ACTIVE" | "REVOKED";
  lastUsedAt: Date | null;
  createdAt: Date;
  revokedAt: Date | null;
}

export interface PatStore {
  create(record: DeveloperTokenRecord): Promise<DeveloperTokenRecord>;
  findByHash(tokenHash: string): Promise<DeveloperTokenRecord | null>;
  revoke(id: string, developerId: string): Promise<DeveloperTokenRecord | null>;
  listByDeveloper(developerId: string): Promise<DeveloperTokenRecord[]>;
  updateLastUsed(id: string): Promise<void>;
}

export interface CreatePatInput {
  developerId: string;
  name: string;
}

export interface CreatePatResult {
  token: string;
  record: DeveloperTokenRecord;
}

export interface AuthenticatePatResult {
  authenticated: true;
  developerId: string;
  tokenId: string;
}

export interface AuthenticatePatError {
  authenticated: false;
  errorCode: "MISSING_TOKEN" | "INVALID_TOKEN" | "TOKEN_REVOKED";
}

export type PatAuthOutcome = AuthenticatePatResult | AuthenticatePatError;

const TOKEN_PREFIX = "nvreg_";
const TOKEN_BYTE_LENGTH = 32;

export function generateRawToken(): string {
  return `${TOKEN_PREFIX}${randomBytes(TOKEN_BYTE_LENGTH).toString("hex")}`;
}

export function hashToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

export function maskTokenForDisplay(rawToken: string): string {
  const suffix = rawToken.slice(-4);
  return `${TOKEN_PREFIX}******${suffix}`;
}

export function createPat(input: CreatePatInput): CreatePatResult {
  const rawToken = generateRawToken();
  const now = new Date();
  const record: DeveloperTokenRecord = {
    id: `tok_${randomBytes(12).toString("hex")}`,
    developerId: input.developerId,
    tokenHash: hashToken(rawToken),
    tokenPreview: maskTokenForDisplay(rawToken),
    name: input.name,
    status: "ACTIVE",
    lastUsedAt: null,
    createdAt: now,
    revokedAt: null,
  };
  return { token: rawToken, record };
}

export async function authenticatePat(
  authHeader: string | null,
  store: PatStore,
): Promise<PatAuthOutcome> {
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return { authenticated: false, errorCode: "MISSING_TOKEN" };
  }

  const rawToken = authHeader.slice("Bearer ".length).trim();
  if (!rawToken) {
    return { authenticated: false, errorCode: "MISSING_TOKEN" };
  }

  const tokenHash = hashToken(rawToken);
  const record = await store.findByHash(tokenHash);

  if (!record) {
    return { authenticated: false, errorCode: "INVALID_TOKEN" };
  }

  if (record.status === "REVOKED") {
    return { authenticated: false, errorCode: "TOKEN_REVOKED" };
  }

  await store.updateLastUsed(record.id);

  return {
    authenticated: true,
    developerId: record.developerId,
    tokenId: record.id,
  };
}

// In-memory store for testing

export function createInMemoryPatStore(): PatStore {
  const records = new Map<string, DeveloperTokenRecord>();

  return {
    async create(record) {
      records.set(record.id, { ...record });
      return { ...record };
    },
    async findByHash(tokenHash) {
      for (const record of records.values()) {
        if (record.tokenHash === tokenHash) return { ...record };
      }
      return null;
    },
    async revoke(id, developerId) {
      const record = records.get(id);
      if (!record || record.developerId !== developerId) return null;
      record.status = "REVOKED";
      record.revokedAt = new Date();
      return { ...record };
    },
    async listByDeveloper(developerId) {
      return [...records.values()]
        .filter((r) => r.developerId === developerId)
        .map((r) => ({ ...r }));
    },
    async updateLastUsed(id) {
      const record = records.get(id);
      if (record) record.lastUsedAt = new Date();
    },
  };
}

interface DeveloperTokenRow {
  id: string;
  developerId: string;
  tokenHash: string;
  tokenPreview: string;
  name: string;
  status: "ACTIVE" | "REVOKED";
  lastUsedAt: Date | null;
  createdAt: Date;
  revokedAt: Date | null;
}

function fromRow(row: DeveloperTokenRow): DeveloperTokenRecord {
  return {
    id: row.id,
    developerId: row.developerId,
    tokenHash: row.tokenHash,
    tokenPreview: row.tokenPreview,
    name: row.name,
    status: row.status,
    lastUsedAt: row.lastUsedAt,
    createdAt: row.createdAt,
    revokedAt: row.revokedAt,
  };
}

export function createPersistentPatStore(): PatStore {
  return {
    async create(record) {
      const prisma = (await getPrismaClient()) as unknown as {
        developerToken: { create(args: unknown): Promise<DeveloperTokenRow> };
      } | null;
      if (!prisma) throw new Error("Registry database not available.");
      const row = await prisma.developerToken.create({
        data: {
          id: record.id,
          developerId: record.developerId,
          tokenHash: record.tokenHash,
          tokenPreview: record.tokenPreview,
          name: record.name,
          status: record.status,
          lastUsedAt: record.lastUsedAt,
          createdAt: record.createdAt,
          revokedAt: record.revokedAt,
        },
      });
      return fromRow(row);
    },
    async findByHash(tokenHash) {
      const prisma = (await getPrismaClient()) as unknown as {
        developerToken: { findUnique(args: unknown): Promise<DeveloperTokenRow | null> };
      } | null;
      if (!prisma) return null;
      const row = await prisma.developerToken.findUnique({
        where: { tokenHash },
      });
      return row ? fromRow(row) : null;
    },
    async revoke(id, developerId) {
      const prisma = (await getPrismaClient()) as unknown as {
        developerToken: {
          findUnique(args: unknown): Promise<DeveloperTokenRow | null>;
          update(args: unknown): Promise<DeveloperTokenRow>;
        };
      } | null;
      if (!prisma) return null;

      const existing = await prisma.developerToken.findUnique({ where: { id } });
      if (!existing || existing.developerId !== developerId) return null;

      const updated = await prisma.developerToken.update({
        where: { id },
        data: {
          status: "REVOKED",
          revokedAt: new Date(),
        },
      });
      return fromRow(updated);
    },
    async listByDeveloper(developerId) {
      const prisma = (await getPrismaClient()) as unknown as {
        developerToken: { findMany(args: unknown): Promise<DeveloperTokenRow[]> };
      } | null;
      if (!prisma) return [];
      const rows = await prisma.developerToken.findMany({
        where: { developerId },
        orderBy: { createdAt: "desc" },
      });
      return rows.map(fromRow);
    },
    async updateLastUsed(id) {
      const prisma = (await getPrismaClient()) as unknown as {
        developerToken: { update(args: unknown): Promise<DeveloperTokenRow> };
      } | null;
      if (!prisma) return;
      await prisma.developerToken.update({
        where: { id },
        data: { lastUsedAt: new Date() },
      }).catch(() => null);
    },
  };
}
