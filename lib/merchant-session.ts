import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { MerchantUserRole } from "@/generated/prisma/enums";
import type { Locale } from "@/lib/i18n";
import { hasMerchantPermission, type MerchantPermission } from "@/lib/merchant-rbac";
import { verifyPassword } from "@/lib/password";
import { getPrismaClient } from "@/lib/prisma";

const MERCHANT_SESSION_COOKIE = "novapay_merchant_session";

const SESSION_MAX_AGE_SECONDS = 60 * 60 * 12;

function hashSessionToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function authenticateMerchantUser(account: string, password: string) {
  const prisma = getPrismaClient();
  const user = await prisma.merchantUser.findUnique({
    where: {
      email: account.trim().toLowerCase(),
    },
    include: {
      merchant: true,
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

async function getMerchantSessionToken() {
  const cookieStore = await cookies();
  return cookieStore.get(MERCHANT_SESSION_COOKIE)?.value ?? "";
}

async function getCurrentMerchantSession() {
  const token = await getMerchantSessionToken();

  if (!token) {
    return null;
  }

  const prisma = getPrismaClient();
  const now = new Date();
  const session = await prisma.merchantSession.findUnique({
    where: {
      tokenHash: hashSessionToken(token),
    },
    include: {
      merchantUser: {
        include: {
          merchant: true,
        },
      },
    },
  });

  if (!session || session.expiresAt <= now || !session.merchantUser.enabled) {
    await prisma.merchantSession.deleteMany({
      where: {
        tokenHash: hashSessionToken(token),
      },
    });

    return null;
  }

  void prisma.merchantSession.update({
    where: {
      id: session.id,
    },
    data: {
      lastSeenAt: now,
    },
  });

  return session;
}

export async function hasMerchantSession() {
  return Boolean(await getCurrentMerchantSession());
}

export async function requireMerchantSession() {
  const session = await getCurrentMerchantSession();

  if (!session) {
    redirect("/merchant/login");
  }

  return session;
}

export async function requireMerchantPermission(permission: MerchantPermission) {
  const session = await requireMerchantSession();

  if (!hasMerchantPermission(session.merchantUser.role, permission)) {
    redirect(`/merchant?error=${encodeURIComponent("当前账号没有权限执行该操作。")}`);
  }

  return session;
}

export async function createMerchantSession(merchantUserId: string) {
  const prisma = getPrismaClient();
  const token = randomBytes(32).toString("base64url");
  const tokenHash = hashSessionToken(token);
  const expiresAt = new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000);

  await prisma.merchantSession.create({
    data: {
      merchantUserId,
      tokenHash,
      expiresAt,
      lastSeenAt: new Date(),
    },
  });

  await prisma.merchantUser.update({
    where: {
      id: merchantUserId,
    },
    data: {
      lastLoginAt: new Date(),
    },
  });

  const cookieStore = await cookies();
  cookieStore.set(MERCHANT_SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

export async function clearMerchantSession() {
  const token = await getMerchantSessionToken();

  if (token) {
    await getPrismaClient().merchantSession.deleteMany({
      where: {
        tokenHash: hashSessionToken(token),
      },
    });
  }

  const cookieStore = await cookies();
  cookieStore.set(MERCHANT_SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
}

export function getMerchantDisplayRole(role: MerchantUserRole, locale: Locale = "zh") {
  switch (role) {
    case "OWNER":
      return locale === "en" ? "Merchant Owner" : "商户所有者";
    case "OPS":
      return locale === "en" ? "Merchant Operations" : "商户运营";
    case "DEVELOPER":
      return locale === "en" ? "Merchant Developer" : "商户开发";
    case "VIEWER":
      return locale === "en" ? "Merchant Viewer" : "商户只读";
    default:
      return role;
  }
}
