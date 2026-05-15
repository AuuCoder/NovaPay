/**
 * Developer authentication logic (Req 5.1–5.4).
 *
 * Provides register, login, email verification, and session management for
 * plugin developers. Phase 2 uses in-memory stores for testing; Prisma
 * integration will be wired once the Registry database is provisioned.
 */

import { createHash, randomBytes, randomUUID } from "node:crypto";

export type DeveloperAccountStatus = "EMAIL_UNVERIFIED" | "ACTIVE" | "SUSPENDED";

export interface DeveloperRecord {
  id: string;
  email: string;
  passwordHash: string;
  displayName: string;
  contact: Record<string, unknown>;
  status: DeveloperAccountStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface RegisterInput {
  email: string;
  password: string;
  displayName: string;
  contact: Record<string, unknown>;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface DeveloperAuthStore {
  findByEmail(email: string): Promise<DeveloperRecord | null>;
  findById(id: string): Promise<DeveloperRecord | null>;
  create(record: DeveloperRecord): Promise<DeveloperRecord>;
  updateStatus(id: string, status: DeveloperAccountStatus): Promise<DeveloperRecord>;
}

export interface EmailVerificationStore {
  createToken(developerId: string): Promise<string>;
  consumeToken(token: string): Promise<string | null>; // returns developerId or null
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = createHash("sha256").update(`${salt}:${password}`).digest("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const computed = createHash("sha256").update(`${salt}:${password}`).digest("hex");
  return computed === hash;
}

export type RegisterErrorCode =
  | "EMAIL_ALREADY_EXISTS"
  | "INVALID_EMAIL"
  | "PASSWORD_TOO_SHORT"
  | "MISSING_DISPLAY_NAME"
  | "MISSING_CONTACT";

export interface RegisterResult {
  success: boolean;
  developer?: DeveloperRecord;
  errorCode?: RegisterErrorCode;
}

export type LoginErrorCode =
  | "INVALID_CREDENTIALS"
  | "ACCOUNT_SUSPENDED"
  | "ACCOUNT_NOT_FOUND";

export interface LoginResult {
  success: boolean;
  developer?: DeveloperRecord;
  errorCode?: LoginErrorCode;
}

export type VerifyEmailErrorCode =
  | "INVALID_TOKEN"
  | "ALREADY_VERIFIED"
  | "DEVELOPER_NOT_FOUND";

export interface VerifyEmailResult {
  success: boolean;
  developer?: DeveloperRecord;
  errorCode?: VerifyEmailErrorCode;
}

const MIN_PASSWORD_LENGTH = 8;

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function registerDeveloper(
  input: RegisterInput,
  store: DeveloperAuthStore,
  emailStore: EmailVerificationStore,
): Promise<RegisterResult> {
  if (!isValidEmail(input.email)) {
    return { success: false, errorCode: "INVALID_EMAIL" };
  }
  if (input.password.length < MIN_PASSWORD_LENGTH) {
    return { success: false, errorCode: "PASSWORD_TOO_SHORT" };
  }
  if (!input.displayName.trim()) {
    return { success: false, errorCode: "MISSING_DISPLAY_NAME" };
  }
  if (!input.contact || Object.keys(input.contact).length === 0) {
    return { success: false, errorCode: "MISSING_CONTACT" };
  }

  const existing = await store.findByEmail(input.email);
  if (existing) {
    return { success: false, errorCode: "EMAIL_ALREADY_EXISTS" };
  }

  const now = new Date();
  const developer: DeveloperRecord = {
    id: randomUUID(),
    email: input.email.trim().toLowerCase(),
    passwordHash: hashPassword(input.password),
    displayName: input.displayName.trim(),
    contact: input.contact,
    status: "EMAIL_UNVERIFIED",
    createdAt: now,
    updatedAt: now,
  };

  const created = await store.create(developer);
  await emailStore.createToken(created.id);

  return { success: true, developer: created };
}

export async function loginDeveloper(
  input: LoginInput,
  store: DeveloperAuthStore,
): Promise<LoginResult> {
  const developer = await store.findByEmail(input.email.trim().toLowerCase());
  if (!developer) {
    return { success: false, errorCode: "ACCOUNT_NOT_FOUND" };
  }
  if (developer.status === "SUSPENDED") {
    return { success: false, errorCode: "ACCOUNT_SUSPENDED" };
  }
  if (!verifyPassword(input.password, developer.passwordHash)) {
    return { success: false, errorCode: "INVALID_CREDENTIALS" };
  }
  return { success: true, developer };
}

export async function verifyDeveloperEmail(
  token: string,
  store: DeveloperAuthStore,
  emailStore: EmailVerificationStore,
): Promise<VerifyEmailResult> {
  const developerId = await emailStore.consumeToken(token);
  if (!developerId) {
    return { success: false, errorCode: "INVALID_TOKEN" };
  }

  const developer = await store.findById(developerId);
  if (!developer) {
    return { success: false, errorCode: "DEVELOPER_NOT_FOUND" };
  }
  if (developer.status === "ACTIVE") {
    return { success: false, errorCode: "ALREADY_VERIFIED" };
  }

  const updated = await store.updateStatus(developerId, "ACTIVE");
  return { success: true, developer: updated };
}

// In-memory implementations for testing

export function createInMemoryDeveloperAuthStore(): DeveloperAuthStore {
  const records = new Map<string, DeveloperRecord>();

  return {
    async findByEmail(email) {
      for (const record of records.values()) {
        if (record.email === email.trim().toLowerCase()) return { ...record };
      }
      return null;
    },
    async findById(id) {
      const record = records.get(id);
      return record ? { ...record } : null;
    },
    async create(record) {
      records.set(record.id, { ...record });
      return { ...record };
    },
    async updateStatus(id, status) {
      const record = records.get(id);
      if (!record) throw new Error(`Developer not found: ${id}`);
      record.status = status;
      record.updatedAt = new Date();
      return { ...record };
    },
  };
}

export function createInMemoryEmailVerificationStore(): EmailVerificationStore {
  const tokens = new Map<string, string>(); // token → developerId

  return {
    async createToken(developerId) {
      const token = randomUUID();
      tokens.set(token, developerId);
      return token;
    },
    async consumeToken(token) {
      const developerId = tokens.get(token);
      if (!developerId) return null;
      tokens.delete(token);
      return developerId;
    },
  };
}
