/**
 * Developer Personal Access Token (PAT) management (Req 9.2, 9.3).
 *
 * PATs are used for CI/CD integration via `Authorization: Bearer <token>`.
 * Only the sha256 hash of the token is stored; the raw token is returned
 * exactly once at creation time.
 */

import { createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

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
  token: string; // raw token, shown only once
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
const REGISTRY_PROJECT_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
);
const PAT_STATE_FILE = path.join(
  REGISTRY_PROJECT_ROOT,
  ".tmp",
  "registry-pat-state.json",
);

interface PersistedDeveloperTokenRecord
  extends Omit<DeveloperTokenRecord, "lastUsedAt" | "createdAt" | "revokedAt"> {
  lastUsedAt: string | null;
  createdAt: string;
  revokedAt: string | null;
}

interface PatStateSnapshot {
  tokens: PersistedDeveloperTokenRecord[];
}

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

function loadPatState(): PatStateSnapshot {
  if (!existsSync(PAT_STATE_FILE)) {
    return { tokens: [] };
  }

  try {
    return JSON.parse(readFileSync(PAT_STATE_FILE, "utf8")) as PatStateSnapshot;
  } catch {
    return { tokens: [] };
  }
}

function savePatState(state: PatStateSnapshot) {
  mkdirSync(path.dirname(PAT_STATE_FILE), { recursive: true });
  writeFileSync(PAT_STATE_FILE, JSON.stringify(state, null, 2), "utf8");
}

function toPersistedRecord(record: DeveloperTokenRecord): PersistedDeveloperTokenRecord {
  return {
    ...record,
    lastUsedAt: record.lastUsedAt?.toISOString() ?? null,
    createdAt: record.createdAt.toISOString(),
    revokedAt: record.revokedAt?.toISOString() ?? null,
  };
}

function toTokenRecord(record: PersistedDeveloperTokenRecord): DeveloperTokenRecord {
  return {
    ...record,
    tokenPreview: record.tokenPreview ?? `${TOKEN_PREFIX}******unknown`,
    lastUsedAt: record.lastUsedAt ? new Date(record.lastUsedAt) : null,
    createdAt: new Date(record.createdAt),
    revokedAt: record.revokedAt ? new Date(record.revokedAt) : null,
  };
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

export function createPersistentPatStore(): PatStore {
  return {
    async create(record) {
      const state = loadPatState();
      state.tokens.push(toPersistedRecord(record));
      savePatState(state);
      return { ...record };
    },
    async findByHash(tokenHash) {
      const state = loadPatState();
      const record = state.tokens.find((item) => item.tokenHash === tokenHash);
      return record ? toTokenRecord(record) : null;
    },
    async revoke(id, developerId) {
      const state = loadPatState();
      const index = state.tokens.findIndex(
        (item) => item.id === id && item.developerId === developerId,
      );

      if (index < 0) {
        return null;
      }

      const updated = {
        ...state.tokens[index]!,
        status: "REVOKED" as const,
        revokedAt: new Date().toISOString(),
      };
      state.tokens[index] = updated;
      savePatState(state);
      return toTokenRecord(updated);
    },
    async listByDeveloper(developerId) {
      const state = loadPatState();
      return state.tokens
        .filter((item) => item.developerId === developerId)
        .map((item) => toTokenRecord(item))
        .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime());
    },
    async updateLastUsed(id) {
      const state = loadPatState();
      const index = state.tokens.findIndex((item) => item.id === id);

      if (index < 0) {
        return;
      }

      state.tokens[index] = {
        ...state.tokens[index]!,
        lastUsedAt: new Date().toISOString(),
      };
      savePatState(state);
    },
  };
}
