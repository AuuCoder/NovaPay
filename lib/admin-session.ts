import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { AdminRole } from "@/generated/prisma/enums";
import type { Locale } from "@/lib/i18n";
import { getPrismaClient } from "@/lib/prisma";
import { hashPassword, verifyPassword } from "@/lib/password";
import { hasPermission, type AdminPermission } from "@/lib/rbac";

const ADMIN_SESSION_COOKIE = "novapay_admin_session";

const SESSION_MAX_AGE_SECONDS = 60 * 60 * 12;

function hashSessionToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function getBootstrapAdminConfig() {
  const email = process.env.ADMIN_BOOTSTRAP_EMAIL?.trim();
  const password = process.env.ADMIN_BOOTSTRAP_PASSWORD?.trim();

  if (!email || !password) {
    return null;
  }

  return {
    email,
    password,
    name: process.env.ADMIN_BOOTSTRAP_NAME?.trim() || "Platform Administrator",
    role: "SUPER_ADMIN" as const,
  };
}

async function ensureBootstrapAdminUser() {
  const prisma = getPrismaClient();
  const count = await prisma.adminUser.count();

  if (count > 0) {
    return;
  }

  const bootstrap = getBootstrapAdminConfig();

  if (!bootstrap) {
    return;
  }

  const passwordHash = await hashPassword(bootstrap.password);

  await prisma.adminUser.upsert({
    where: {
      email: bootstrap.email,
    },
    update: {
      name: bootstrap.name,
      passwordHash,
      role: bootstrap.role,
      enabled: true,
    },
    create: {
      email: bootstrap.email,
      name: bootstrap.name,
      passwordHash,
      role: bootstrap.role,
      enabled: true,
    },
  });
}

export async function isAdminUiConfigured() {
  await ensureBootstrapAdminUser();
  return (await getPrismaClient().adminUser.count()) > 0;
}

export async function authenticateAdminUser(email: string, password: string) {
  await ensureBootstrapAdminUser();
  const prisma = getPrismaClient();
  const user = await prisma.adminUser.findUnique({
    where: {
      email: email.trim().toLowerCase(),
    },
  });

  if (!user || !user.enabled) {
    return null;
  }

  const valid = await verifyPassword(password, user.passwordHash);

  if (!valid) {
    return null;
  }

  return user;
}

async function getAdminSessionToken() {
  const cookieStore = await cookies();
  return cookieStore.get(ADMIN_SESSION_COOKIE)?.value ?? "";
}

export async function getCurrentAdminSession() {
  await ensureBootstrapAdminUser();
  const token = await getAdminSessionToken();

  if (!token) {
    return null;
  }

  const prisma = getPrismaClient();
  const now = new Date();
  const session = await prisma.adminSession.findUnique({
    where: {
      tokenHash: hashSessionToken(token),
    },
    include: {
      adminUser: true,
    },
  });

  if (!session || session.expiresAt <= now || !session.adminUser.enabled) {
    if (token) {
      const prisma = getPrismaClient();
      await prisma.adminSession.deleteMany({
        where: {
          tokenHash: hashSessionToken(token),
        },
      });
    }

    return null;
  }

  void prisma.adminSession.update({
    where: {
      id: session.id,
    },
    data: {
      lastSeenAt: now,
    },
  });

  return session;
}

export async function hasAdminSession() {
  return Boolean(await getCurrentAdminSession());
}

export async function requireAdminSession() {
  const session = await getCurrentAdminSession();

  if (!session) {
    redirect("/admin/login");
  }

  return session;
}

export async function requireAdminPermission(permission: AdminPermission) {
  const session = await requireAdminSession();

  if (!hasPermission(session.adminUser.role, permission)) {
    redirect(`/admin/forbidden?permission=${encodeURIComponent(permission)}`);
  }

  return session;
}

export function getAdminDisplayRole(role: AdminRole, locale: Locale = "zh") {
  switch (role) {
    case "SUPER_ADMIN":
      return locale === "en" ? "Super Admin" : "超级管理员";
    case "OPS_ADMIN":
      return locale === "en" ? "Operations Admin" : "运营管理员";
    case "FINANCE_ADMIN":
      return locale === "en" ? "Finance Admin" : "财务管理员";
    case "VIEWER":
      return locale === "en" ? "Read-only Viewer" : "只读观察员";
    default:
      return role;
  }
}

export async function createAdminSession(adminUserId: string) {
  const prisma = getPrismaClient();
  const token = randomBytes(32).toString("base64url");
  const tokenHash = hashSessionToken(token);
  const expiresAt = new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000);

  await prisma.adminSession.create({
    data: {
      adminUserId,
      tokenHash,
      expiresAt,
      lastSeenAt: new Date(),
    },
  });

  await prisma.adminUser.update({
    where: {
      id: adminUserId,
    },
    data: {
      lastLoginAt: new Date(),
    },
  });

  const cookieStore = await cookies();
  cookieStore.set(ADMIN_SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

export async function clearAdminSession() {
  const token = await getAdminSessionToken();

  if (token) {
    await getPrismaClient().adminSession.deleteMany({
      where: {
        tokenHash: hashSessionToken(token),
      },
    });
  }

  const cookieStore = await cookies();
  cookieStore.set(ADMIN_SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
}
