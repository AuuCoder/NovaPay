import { createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { apiError, resolveApiMessage, resolveRequestLocale } from "../api/response";
import type {
  DeveloperAccountStatus,
  DeveloperRecord,
  DeveloperAuthStore,
  EmailVerificationStore,
} from "./developer-auth";
import {
  loginDeveloper,
  registerDeveloper,
  verifyPassword,
} from "./developer-auth";
import {
  authenticatePat,
  createPersistentPatStore,
  type AuthenticatePatError,
  type AuthenticatePatResult,
} from "./developer-pat";

const REGISTRY_SESSION_COOKIE = "nvreg_session";
const REGISTRY_SESSION_MAX_AGE_SECONDS = 60 * 60 * 12;
const REGISTRY_PROJECT_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
);
const AUTH_STATE_FILE = path.join(
  REGISTRY_PROJECT_ROOT,
  ".tmp",
  "registry-auth-state.json",
);

export type RegistrySessionActorKind = "DEVELOPER" | "ADMIN_SSO";

export interface RegistrySessionRecord {
  id: string;
  actorKind: RegistrySessionActorKind;
  actorId: string;
  email: string;
  displayName: string;
  role: string | null;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
}

interface PersistedDeveloperRecord extends Omit<DeveloperRecord, "createdAt" | "updatedAt"> {
  createdAt: string;
  updatedAt: string;
}

interface PersistedEmailVerificationToken {
  token: string;
  developerId: string;
}

interface RegistryAuthStateSnapshot {
  developers: PersistedDeveloperRecord[];
  emailVerificationTokens: PersistedEmailVerificationToken[];
  sessions: RegistrySessionRecord[];
}

export interface RegistrySession {
  id: string;
  actorKind: RegistrySessionActorKind;
  actorId: string;
  email: string;
  displayName: string;
  role: string | null;
  createdAt: Date;
  lastSeenAt: Date;
  expiresAt: Date;
}

export type RegistryDeveloperRequestActor =
  | {
      kind: "SESSION";
      session: RegistrySession;
    }
  | {
      kind: "PAT";
      developerId: string;
      tokenId: string;
    };

export interface RegistryDeveloperRegistrationInput {
  email: string;
  password: string;
  displayName: string;
  contact: Record<string, unknown>;
}

function hashSessionToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function loadAuthState(): RegistryAuthStateSnapshot {
  if (!existsSync(AUTH_STATE_FILE)) {
    return {
      developers: [],
      emailVerificationTokens: [],
      sessions: [],
    };
  }

  try {
    return JSON.parse(readFileSync(AUTH_STATE_FILE, "utf8")) as RegistryAuthStateSnapshot;
  } catch {
    return {
      developers: [],
      emailVerificationTokens: [],
      sessions: [],
    };
  }
}

function saveAuthState(state: RegistryAuthStateSnapshot) {
  mkdirSync(path.dirname(AUTH_STATE_FILE), { recursive: true });
  writeFileSync(AUTH_STATE_FILE, JSON.stringify(state, null, 2), "utf8");
}

function toDeveloperRecord(record: PersistedDeveloperRecord): DeveloperRecord {
  return {
    ...record,
    createdAt: new Date(record.createdAt),
    updatedAt: new Date(record.updatedAt),
  };
}

function toPersistedDeveloperRecord(record: DeveloperRecord): PersistedDeveloperRecord {
  return {
    ...record,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

function createPersistentDeveloperAuthStore(): DeveloperAuthStore {
  return {
    async findByEmail(email) {
      const state = loadAuthState();
      const record = state.developers.find(
        (item) => item.email === email.trim().toLowerCase(),
      );
      return record ? toDeveloperRecord(record) : null;
    },
    async findById(id) {
      const state = loadAuthState();
      const record = state.developers.find((item) => item.id === id);
      return record ? toDeveloperRecord(record) : null;
    },
    async create(record) {
      const state = loadAuthState();
      state.developers.push(toPersistedDeveloperRecord(record));
      saveAuthState(state);
      return record;
    },
    async updateStatus(id, status) {
      const state = loadAuthState();
      const index = state.developers.findIndex((item) => item.id === id);

      if (index < 0) {
        throw new Error(`Developer not found: ${id}`);
      }

      const updated: PersistedDeveloperRecord = {
        ...state.developers[index],
        status,
        updatedAt: new Date().toISOString(),
      };

      state.developers[index] = updated;
      saveAuthState(state);
      return toDeveloperRecord(updated);
    },
  };
}

function createPersistentEmailVerificationStore(): EmailVerificationStore {
  return {
    async createToken(developerId) {
      const state = loadAuthState();
      const token = randomBytes(24).toString("base64url");
      state.emailVerificationTokens.push({ token, developerId });
      saveAuthState(state);
      return token;
    },
    async consumeToken(token) {
      const state = loadAuthState();
      const index = state.emailVerificationTokens.findIndex((item) => item.token === token);

      if (index < 0) {
        return null;
      }

      const developerId = state.emailVerificationTokens[index]?.developerId ?? null;
      state.emailVerificationTokens.splice(index, 1);
      saveAuthState(state);
      return developerId;
    },
  };
}

function parseCookieHeader(
  cookieHeader: string | null | undefined,
): Record<string, string> {
  if (!cookieHeader) {
    return {};
  }

  return cookieHeader
    .split(";")
    .map((item) => item.trim())
    .filter(Boolean)
    .reduce<Record<string, string>>((acc, item) => {
      const separatorIndex = item.indexOf("=");
      if (separatorIndex < 0) {
        return acc;
      }

      const key = item.slice(0, separatorIndex).trim();
      const value = item.slice(separatorIndex + 1).trim();
      acc[key] = decodeURIComponent(value);
      return acc;
    }, {});
}

function toRegistrySession(record: RegistrySessionRecord): RegistrySession {
  return {
    ...record,
    createdAt: new Date(record.createdAt),
    lastSeenAt: new Date(record.lastSeenAt),
    expiresAt: new Date(record.expiresAt),
  };
}

function lookupSessionByToken(token: string | null | undefined) {
  if (!token) {
    return null;
  }

  const state = loadAuthState();
  const tokenHash = hashSessionToken(token);
  const record = state.sessions.find((item) => item.id === tokenHash);

  if (!record) {
    return null;
  }

  const now = Date.now();
  const expiresAt = new Date(record.expiresAt).getTime();

  if (!Number.isFinite(expiresAt) || expiresAt <= now) {
    state.sessions = state.sessions.filter((item) => item.id !== tokenHash);
    saveAuthState(state);
    return null;
  }

  const updated: RegistrySessionRecord = {
    ...record,
    lastSeenAt: new Date().toISOString(),
  };
  state.sessions = state.sessions.map((item) => (item.id === tokenHash ? updated : item));
  saveAuthState(state);
  return toRegistrySession(updated);
}

export async function registerRegistryDeveloper(
  input: RegistryDeveloperRegistrationInput,
) {
  const store = createPersistentDeveloperAuthStore();
  const emailStore = createPersistentEmailVerificationStore();
  const result = await registerDeveloper(input, store, emailStore);

  if (!result.success || !result.developer) {
    return result;
  }

  const activated = await store.updateStatus(result.developer.id, "ACTIVE");
  return {
    ...result,
    developer: activated,
  };
}

export async function loginRegistryDeveloper(input: {
  email: string;
  password: string;
}) {
  const store = createPersistentDeveloperAuthStore();
  return loginDeveloper(input, store);
}

export async function createRegistrySession(input: {
  actorKind: RegistrySessionActorKind;
  actorId: string;
  email: string;
  displayName: string;
  role?: string | null;
}) {
  const state = loadAuthState();
  const token = randomBytes(32).toString("base64url");
  const tokenHash = hashSessionToken(token);
  const now = new Date();
  const session: RegistrySessionRecord = {
    id: tokenHash,
    actorKind: input.actorKind,
    actorId: input.actorId,
    email: input.email.trim().toLowerCase(),
    displayName: input.displayName.trim(),
    role: input.role ?? null,
    createdAt: now.toISOString(),
    lastSeenAt: now.toISOString(),
    expiresAt: new Date(
      now.getTime() + REGISTRY_SESSION_MAX_AGE_SECONDS * 1000,
    ).toISOString(),
  };

  state.sessions = state.sessions.filter((item) => item.id !== tokenHash);
  state.sessions.push(session);
  saveAuthState(state);

  const cookieStore = await cookies();
  cookieStore.set(REGISTRY_SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: REGISTRY_SESSION_MAX_AGE_SECONDS,
  });

  return toRegistrySession(session);
}

export async function clearRegistrySession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(REGISTRY_SESSION_COOKIE)?.value ?? null;

  if (token) {
    const tokenHash = hashSessionToken(token);
    const state = loadAuthState();
    state.sessions = state.sessions.filter((item) => item.id !== tokenHash);
    saveAuthState(state);
  }

  cookieStore.set(REGISTRY_SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
}

export async function getCurrentRegistrySession() {
  const cookieStore = await cookies();
  return lookupSessionByToken(cookieStore.get(REGISTRY_SESSION_COOKIE)?.value ?? null);
}

export async function getRegistrySessionFromRequest(request: Request) {
  const cookiesByName = parseCookieHeader(request.headers.get("cookie"));
  return lookupSessionByToken(cookiesByName[REGISTRY_SESSION_COOKIE] ?? null);
}

export async function requireRegistryUserSession() {
  const session = await getCurrentRegistrySession();

  if (!session) {
    redirect("/developer/auth?error=signin_required");
  }

  return session;
}

export async function requireRegistryAdminSession() {
  const session = await requireRegistryUserSession();

  if (session.actorKind !== "ADMIN_SSO") {
    redirect("/developer/auth?error=admin_required");
  }

  return session;
}

export async function requireRegistryUserRequest(request: Request) {
  const session = await getRegistrySessionFromRequest(request);

  if (!session) {
    return {
      session: null,
      response: NextResponse.json(
        {
          error: "UNAUTHORIZED",
          message: "Sign in to the Registry first.",
        },
        { status: 401 },
      ),
    };
  }

  return { session, response: null };
}

export async function requireRegistryDeveloperSession() {
  const session = await requireRegistryUserSession();

  if (session.actorKind !== "DEVELOPER") {
    redirect("/developer/tokens?error=developer_account_required");
  }

  return session;
}

export async function requireRegistryDeveloperSessionRequest(request: Request) {
  const auth = await requireRegistryUserRequest(request);

  if (auth.response) {
    return auth;
  }

  if (auth.session.actorKind !== "DEVELOPER") {
    return {
      session: null,
      response: apiError(request, "DEVELOPER_ACCOUNT_REQUIRED", 403),
    };
  }

  return auth;
}

function patErrorToMessage(result: AuthenticatePatError) {
  switch (result.errorCode) {
    case "TOKEN_REVOKED":
      return "TOKEN_REVOKED";
    case "INVALID_TOKEN":
      return "INVALID_TOKEN";
    case "MISSING_TOKEN":
    default:
      return "MISSING_TOKEN";
  }
}

function toPatActor(result: AuthenticatePatResult): RegistryDeveloperRequestActor {
  return {
    kind: "PAT",
    developerId: result.developerId,
    tokenId: result.tokenId,
  };
}

export async function requireRegistryDeveloperRequest(request: Request) {
  const session = await getRegistrySessionFromRequest(request);

  if (session) {
    return {
      actor: {
        kind: "SESSION",
        session,
      } satisfies RegistryDeveloperRequestActor,
      response: null,
    };
  }

  const patResult = await authenticatePat(
    request.headers.get("authorization"),
    createPersistentPatStore(),
  );

  if (patResult.authenticated) {
    return {
      actor: toPatActor(patResult),
      response: null,
    };
  }

  return {
    actor: null,
    response: NextResponse.json(
      {
        error: "UNAUTHORIZED",
        message: resolveApiMessage(
          resolveRequestLocale(request),
          patErrorToMessage(patResult),
        ),
      },
      { status: 401 },
    ),
  };
}

export async function requireRegistryAdminRequest(request: Request) {
  const auth = await requireRegistryUserRequest(request);

  if (auth.response) {
    return auth;
  }

  if (auth.session.actorKind !== "ADMIN_SSO") {
    return {
      session: null,
      response: apiError(request, "ADMIN_SSO_REQUIRED", 403),
    };
  }

  return auth;
}

export async function findRegistryDeveloperByEmail(email: string) {
  const state = loadAuthState();
  const record = state.developers.find(
    (item) => item.email === email.trim().toLowerCase(),
  );
  return record ? toDeveloperRecord(record) : null;
}

export async function findRegistryDeveloperById(id: string) {
  const state = loadAuthState();
  const record = state.developers.find((item) => item.id === id);
  return record ? toDeveloperRecord(record) : null;
}

export function getRegistryDeveloperStatusLabel(status: DeveloperAccountStatus) {
  switch (status) {
    case "ACTIVE":
      return "ACTIVE";
    case "EMAIL_UNVERIFIED":
      return "EMAIL_UNVERIFIED";
    case "SUSPENDED":
      return "SUSPENDED";
    default:
      return status;
  }
}

export function verifyRegistryDeveloperPassword(password: string, passwordHash: string) {
  return verifyPassword(password, passwordHash);
}
