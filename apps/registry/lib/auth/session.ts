import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { apiError, resolveApiMessage, resolveRequestLocale } from "../api/response";
import { getPrismaClient } from "../runtime/prisma-client";
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

export type RegistrySessionActorKind = "DEVELOPER" | "ADMIN_SSO";

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

interface DeveloperRow {
  id: string;
  email: string;
  passwordHash: string;
  displayName: string;
  contact: unknown;
  status: DeveloperAccountStatus;
  createdAt: Date;
  updatedAt: Date;
}

interface RegistrySessionRow {
  id: string;
  actorKind: string;
  actorId: string;
  email: string;
  displayName: string;
  role: string | null;
  createdAt: Date;
  lastSeenAt: Date;
  expiresAt: Date;
}

function hashSessionToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function fromDeveloperRow(row: DeveloperRow): DeveloperRecord {
  return {
    id: row.id,
    email: row.email,
    passwordHash: row.passwordHash,
    displayName: row.displayName,
    contact: (row.contact ?? {}) as Record<string, unknown>,
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

async function getPrismaOrThrow() {
  const prisma = await getPrismaClient();
  if (!prisma) {
    throw new Error("Registry database is not available.");
  }
  return prisma as unknown as {
    developer: {
      findUnique(args: unknown): Promise<DeveloperRow | null>;
      findFirst(args: unknown): Promise<DeveloperRow | null>;
      create(args: unknown): Promise<DeveloperRow>;
      update(args: unknown): Promise<DeveloperRow>;
    };
    emailVerificationToken: {
      create(args: unknown): Promise<unknown>;
      findUnique(args: unknown): Promise<{ developerId: string } | null>;
      delete(args: unknown): Promise<unknown>;
    };
    registrySession: {
      create(args: unknown): Promise<RegistrySessionRow>;
      findUnique(args: unknown): Promise<RegistrySessionRow | null>;
      update(args: unknown): Promise<RegistrySessionRow>;
      delete(args: unknown): Promise<RegistrySessionRow | null>;
      deleteMany(args: unknown): Promise<unknown>;
    };
  };
}

function createPrismaDeveloperAuthStore(): DeveloperAuthStore {
  return {
    async findByEmail(email) {
      const prisma = await getPrismaOrThrow();
      const row = await prisma.developer.findUnique({
        where: { email: email.trim().toLowerCase() },
      });
      return row ? fromDeveloperRow(row) : null;
    },
    async findById(id) {
      const prisma = await getPrismaOrThrow();
      const row = await prisma.developer.findUnique({ where: { id } });
      return row ? fromDeveloperRow(row) : null;
    },
    async create(record) {
      const prisma = await getPrismaOrThrow();
      const row = await prisma.developer.create({
        data: {
          id: record.id,
          email: record.email,
          passwordHash: record.passwordHash,
          displayName: record.displayName,
          contact: record.contact,
          status: record.status,
          createdAt: record.createdAt,
          updatedAt: record.updatedAt,
        },
      });
      return fromDeveloperRow(row);
    },
    async updateStatus(id, status) {
      const prisma = await getPrismaOrThrow();
      const row = await prisma.developer.update({
        where: { id },
        data: { status },
      });
      return fromDeveloperRow(row);
    },
  };
}

function createPrismaEmailVerificationStore(): EmailVerificationStore {
  return {
    async createToken(developerId) {
      const prisma = await getPrismaOrThrow();
      const token = randomBytes(24).toString("base64url");
      await prisma.emailVerificationToken.create({
        data: { token, developerId },
      });
      return token;
    },
    async consumeToken(token) {
      const prisma = await getPrismaOrThrow();
      const row = await prisma.emailVerificationToken.findUnique({
        where: { token },
      });
      if (!row) {
        return null;
      }
      await prisma.emailVerificationToken
        .delete({ where: { token } })
        .catch(() => null);
      return row.developerId;
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

function fromSessionRow(row: RegistrySessionRow): RegistrySession {
  return {
    id: row.id,
    actorKind: row.actorKind === "ADMIN_SSO" ? "ADMIN_SSO" : "DEVELOPER",
    actorId: row.actorId,
    email: row.email,
    displayName: row.displayName,
    role: row.role,
    createdAt: row.createdAt,
    lastSeenAt: row.lastSeenAt,
    expiresAt: row.expiresAt,
  };
}

async function lookupSessionByToken(token: string | null | undefined) {
  if (!token) {
    return null;
  }

  const prisma = await getPrismaOrThrow();
  const tokenHash = hashSessionToken(token);
  const row = await prisma.registrySession.findUnique({ where: { id: tokenHash } });

  if (!row) {
    return null;
  }

  const now = new Date();
  if (row.expiresAt.getTime() <= now.getTime()) {
    await prisma.registrySession.delete({ where: { id: tokenHash } }).catch(() => null);
    return null;
  }

  await prisma.registrySession
    .update({
      where: { id: tokenHash },
      data: { lastSeenAt: now },
    })
    .catch(() => null);

  return fromSessionRow({ ...row, lastSeenAt: now });
}

export async function registerRegistryDeveloper(
  input: RegistryDeveloperRegistrationInput,
) {
  const store = createPrismaDeveloperAuthStore();
  const emailStore = createPrismaEmailVerificationStore();
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
  const store = createPrismaDeveloperAuthStore();
  return loginDeveloper(input, store);
}

export async function createRegistrySession(input: {
  actorKind: RegistrySessionActorKind;
  actorId: string;
  email: string;
  displayName: string;
  role?: string | null;
}) {
  const prisma = await getPrismaOrThrow();
  const token = randomBytes(32).toString("base64url");
  const tokenHash = hashSessionToken(token);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + REGISTRY_SESSION_MAX_AGE_SECONDS * 1000);

  // For ADMIN_SSO sessions there's no Developer to FK to; use null.
  const developerId = input.actorKind === "DEVELOPER" ? input.actorId : null;

  // Upsert-like: delete existing then create (race-safe enough for cookie sessions).
  await prisma.registrySession.delete({ where: { id: tokenHash } }).catch(() => null);
  const row = await prisma.registrySession.create({
    data: {
      id: tokenHash,
      actorKind: input.actorKind,
      actorId: input.actorId,
      developerId,
      email: input.email.trim().toLowerCase(),
      displayName: input.displayName.trim(),
      role: input.role ?? null,
      createdAt: now,
      lastSeenAt: now,
      expiresAt,
    },
  });

  const cookieStore = await cookies();
  cookieStore.set(REGISTRY_SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: REGISTRY_SESSION_MAX_AGE_SECONDS,
  });

  return fromSessionRow(row);
}

export async function clearRegistrySession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(REGISTRY_SESSION_COOKIE)?.value ?? null;

  if (token) {
    const tokenHash = hashSessionToken(token);
    const prisma = await getPrismaOrThrow();
    await prisma.registrySession
      .delete({ where: { id: tokenHash } })
      .catch(() => null);
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
  const store = createPrismaDeveloperAuthStore();
  return store.findByEmail(email);
}

export async function findRegistryDeveloperById(id: string) {
  const store = createPrismaDeveloperAuthStore();
  return store.findById(id);
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
