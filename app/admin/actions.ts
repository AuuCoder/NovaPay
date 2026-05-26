"use server";

import type { Prisma } from "@/generated/prisma/client";
import { AdminRole, MerchantStatus, MerchantUserRole } from "@/generated/prisma/enums";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  authenticateAdminUser,
  clearAdminSession,
  createAdminSession,
  isAdminUiConfigured,
  requireAdminPermission,
  requireAdminSession,
} from "@/lib/admin-session";
import { writeAdminAuditLog } from "@/lib/admin-audit";
import { dispatchMerchantCallback } from "@/lib/callbacks/service";
import {
  markMerchantSettlementPaid,
  runFinanceMaintenance,
} from "@/lib/finance/settlements";
import { generateMerchantApiCredential } from "@/lib/merchant-credentials";
import {
  getMarketplacePluginUsageBySlug,
  getMarketplacePluginSafetyState,
  installRemoteMarketplacePluginPackage,
  purchaseAndIssueLicense,
  recordMarketplacePluginPurchase,
  setMarketplacePluginEnabledState,
  setMarketplacePluginInstalledState,
  syncBuiltinMarketplacePlugins,
} from "@/lib/plugins/marketplace";
import { fetchRemoteRegistrySnapshot } from "@/lib/plugins/remote-registry";
import { hashPassword } from "@/lib/password";
import { getPrismaClient } from "@/lib/prisma";
import { migrateStoredSecret, sealStoredSecret } from "@/lib/secret-box";
import { invalidateSystemConfigCache } from "@/lib/system-config";

function getString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function getOptionalString(formData: FormData, key: string) {
  const value = getString(formData, key);
  return value || null;
}

function getStringList(formData: FormData, key: string) {
  return formData
    .getAll(key)
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim())
    .filter(Boolean);
}

function getRequiredString(formData: FormData, key: string, label: string) {
  const value = getString(formData, key);

  if (!value) {
    throw new Error(`${label}不能为空。`);
  }

  return value;
}

function getBoolean(formData: FormData, key: string) {
  return formData.get(key) === "on";
}

function getRedirectTo(formData: FormData, fallback: string) {
  const redirectTo = getString(formData, "redirectTo");
  return redirectTo || fallback;
}

function withMessage(path: string, type: "success" | "error", message: string) {
  const url = new URL(path, "http://localhost");
  url.searchParams.set(type, message);
  return `${url.pathname}?${url.searchParams.toString()}`;
}

function redirectWithError(path: string, error: unknown) {
  const message = error instanceof Error ? error.message : "Unexpected error";
  redirect(withMessage(path, "error", message));
}

function parseDecimalOrNull(text: string, fieldName: string) {
  if (!text.trim()) {
    return null;
  }

  const numeric = Number(text);

  if (!Number.isFinite(numeric) || numeric < 0) {
    throw new Error(`${fieldName} must be a valid non-negative number.`);
  }

  return fieldName === "feeRate" ? numeric.toFixed(4) : numeric.toFixed(2);
}

function parseDateOrNull(text: string, fieldName: string) {
  if (!text.trim()) {
    return null;
  }

  const value = new Date(text);

  if (Number.isNaN(value.getTime())) {
    throw new Error(`${fieldName} 必须是合法日期。`);
  }

  return value;
}

function isHttpUrl(text: string) {
  try {
    const value = new URL(text);
    return value.protocol === "http:" || value.protocol === "https:";
  } catch {
    return false;
  }
}

function validateSystemConfigValue(input: {
  key: string;
  label: string;
  value: string;
  kind: string;
  required: boolean;
}) {
  if (input.required && !input.value) {
    throw new Error(`${input.label || input.key} 不能为空。`);
  }

  if (!input.value) {
    return;
  }

  if (input.kind === "url" && !isHttpUrl(input.value)) {
    throw new Error(`${input.label || input.key} 必须是合法的 http/https URL。`);
  }

  if (input.kind === "integer") {
    const numeric = Number(input.value);

    if (!Number.isInteger(numeric) || numeric < 0) {
      throw new Error(`${input.label || input.key} 必须是非负整数。`);
    }

    return;
  }

  if (input.kind === "number") {
    const numeric = Number(input.value);

    if (!Number.isFinite(numeric) || numeric < 0) {
      throw new Error(`${input.label || input.key} 必须是非负数字。`);
    }
  }
}

function parseAdminRole(text: string) {
  if (text in AdminRole) {
    return text as AdminRole;
  }

  throw new Error("管理员角色不合法。");
}

function parseMerchantStatus(text: string) {
  if (text in MerchantStatus) {
    return text as MerchantStatus;
  }

  throw new Error("商户状态不合法。");
}

function parseMerchantUserRole(text: string) {
  if (text in MerchantUserRole) {
    return text as MerchantUserRole;
  }

  throw new Error("商户用户角色不合法。");
}

function isPrismaUniqueConstraintError(error: unknown, targetField?: string) {
  if (!error || typeof error !== "object" || !("code" in error)) {
    return false;
  }

  if (error.code !== "P2002") {
    return false;
  }

  if (!targetField) {
    return true;
  }

  if (!("meta" in error) || !error.meta || typeof error.meta !== "object") {
    return false;
  }

  const metaTarget = "target" in error.meta ? error.meta.target : undefined;

  if (Array.isArray(metaTarget)) {
    return metaTarget.includes(targetField);
  }

  return typeof metaTarget === "string" && metaTarget.includes(targetField);
}

function resolveNotifySecretForStorage(input: {
  submittedValue: string;
  currentValue?: string | null;
  preserveBlank?: boolean;
}) {
  if (!input.submittedValue) {
    return input.preserveBlank ? migrateStoredSecret(input.currentValue) : null;
  }

  return sealStoredSecret(input.submittedValue);
}

function getAuditActor(session: Awaited<ReturnType<typeof requireAdminSession>>) {
  return `${session.adminUser.email} (${session.adminUser.role})`;
}

function revalidateAdminPaths() {
  revalidatePath("/");
  revalidatePath("/admin");
  revalidatePath("/admin/plugins");
  revalidatePath("/admin/plugins/sources");
  revalidatePath("/admin/finance");
  revalidatePath("/admin/merchants");
  revalidatePath("/admin/merchants/[id]", "page");
  revalidatePath("/admin/bindings");
  revalidatePath("/admin/system-config");
  revalidatePath("/admin/orders");
  revalidatePath("/admin/callbacks");
  revalidatePath("/admin/audit-logs");
  revalidatePath("/admin/users");
  revalidatePath("/docs");
  revalidatePath("/merchant");
  revalidatePath("/merchant/channels");
  revalidatePath("/merchant/integration");
  revalidatePath("/merchant/orders");
  revalidatePath("/merchant/refunds");
}

async function fetchRegistryTrustAnchor(baseUrl: string) {
  const response = await fetch(new URL("/api/.well-known/trust.json", baseUrl), {
    method: "GET",
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    throw new Error(`信任锚读取失败，状态码 ${response.status}。`);
  }

  const payload = (await response.json()) as {
    currentKey?: {
      keyId?: string;
      publicKey?: string;
    } | null;
  };

  const keyId = payload.currentKey?.keyId?.trim() || "";
  const publicKey = payload.currentKey?.publicKey?.trim() || "";

  if (!keyId || !publicKey) {
    throw new Error("远程 Registry 没有返回有效的 currentKey。");
  }

  return {
    keyId,
    publicKey,
  };
}

function resolveRegistryAppKeyForStorage(input: {
  submittedValue: string;
  currentValue?: string | null;
  preserveBlank?: boolean;
}) {
  if (!input.submittedValue) {
    return input.preserveBlank ? migrateStoredSecret(input.currentValue) : null;
  }

  return sealStoredSecret(input.submittedValue);
}

async function assertMarketplacePluginCanBeDisabled(slug: string) {
  const usage = await getMarketplacePluginUsageBySlug(slug);

  if (usage.enabledMerchantAccountCount > 0 || usage.enabledBindingCount > 0) {
    throw new Error(
      `当前插件仍有 ${usage.enabledMerchantAccountCount} 个启用中的商户通道实例、${usage.enabledBindingCount} 个启用中的路由绑定，不能直接停用。请先停用相关商户配置。`,
    );
  }
}

async function assertMarketplacePluginCanBeUninstalled(slug: string) {
  const usage = await getMarketplacePluginUsageBySlug(slug);

  if (usage.merchantAccountCount > 0 || usage.bindingCount > 0) {
    throw new Error(
      `当前插件仍关联 ${usage.merchantAccountCount} 个商户通道实例、${usage.bindingCount} 个路由绑定，不能直接卸载。请先清理商户配置后再卸载。`,
    );
  }
}

async function installMarketplacePlugin(slug: string) {
  const state = await getMarketplacePluginSafetyState(slug);

  if (!state) {
    throw new Error("插件不存在。");
  }

  if (state.source === "REMOTE_SIGNED") {
    const result = await installRemoteMarketplacePluginPackage(slug);
    return getPrismaClient().marketplacePlugin.findUniqueOrThrow({
      where: {
        slug: result.plugin.slug,
      },
    });
  }

  return setMarketplacePluginInstalledState({
    slug,
    installed: true,
  });
}

async function uninstallMarketplacePlugin(slug: string) {
  await assertMarketplacePluginCanBeUninstalled(slug);
  return setMarketplacePluginInstalledState({
    slug,
    installed: false,
  });
}

async function setMarketplacePluginEnabled(slug: string, enabled: boolean) {
  if (!enabled) {
    await assertMarketplacePluginCanBeDisabled(slug);
  }

  return setMarketplacePluginEnabledState({
    slug,
    enabled,
  });
}

export async function loginAdminAction(formData: FormData) {
  const email = getString(formData, "email").toLowerCase();
  const password = getString(formData, "password");

  if (!(await isAdminUiConfigured())) {
    redirect(withMessage("/admin/login", "error", "管理员账号体系尚未初始化。"));
  }

  if (!email || !password) {
    redirect(withMessage("/admin/login", "error", "邮箱和密码不能为空。"));
  }

  const user = await authenticateAdminUser(email, password);

  if (!user) {
    redirect(withMessage("/admin/login", "error", "邮箱或密码不正确，或账号已停用。"));
  }

  await createAdminSession(user.id);
  await writeAdminAuditLog({
    action: "admin.login",
    resourceType: "admin_session",
    resourceId: user.id,
    actor: `${user.email} (${user.role})`,
    summary: `管理员 ${user.email} 登录后台。`,
  });
  redirect("/admin");
}

export async function logoutAdminAction() {
  const session = await requireAdminSession();
  await writeAdminAuditLog({
    action: "admin.logout",
    resourceType: "admin_session",
    resourceId: session.adminUser.id,
    actor: getAuditActor(session),
    summary: `管理员 ${session.adminUser.email} 退出后台。`,
  });
  await clearAdminSession();
  redirect("/admin/login");
}

export async function createMerchantAction(formData: FormData) {
  const session = await requireAdminPermission("merchant:write");
  const redirectTo = getRedirectTo(formData, "/admin/merchants");
  const code = getString(formData, "code");

  try {
    const prisma = getPrismaClient();
    const name = getString(formData, "name");
    const merchantStatus = getString(formData, "status")
      ? parseMerchantStatus(getString(formData, "status"))
      : "APPROVED";

    if (!code) {
      throw new Error("商户编码不能为空。");
    }

    if (!name) {
      throw new Error("商户名称不能为空。");
    }

    const merchantProfile = {
      name,
      legalName: getOptionalString(formData, "legalName"),
      contactName: getOptionalString(formData, "contactName"),
      contactPhone: getOptionalString(formData, "contactPhone"),
      companyRegistrationId: getOptionalString(formData, "companyRegistrationId"),
    };

    const merchant = await prisma.merchant.create({
      data: {
        code,
        name,
        status: merchantStatus,
        legalName: merchantProfile.legalName,
        contactName: merchantProfile.contactName,
        contactEmail: getOptionalString(formData, "contactEmail"),
        contactPhone: merchantProfile.contactPhone,
        companyRegistrationId: merchantProfile.companyRegistrationId,
        onboardingNote: getOptionalString(formData, "onboardingNote"),
        reviewNote: getOptionalString(formData, "reviewNote"),
        approvedAt: merchantStatus === "APPROVED" ? new Date() : null,
        approvedBy: merchantStatus === "APPROVED" ? session.adminUser.email : null,
        statusChangedAt: new Date(),
        callbackBase: getOptionalString(formData, "callbackBase"),
        notifySecret: resolveNotifySecretForStorage({
          submittedValue: getString(formData, "notifySecret"),
        }),
        apiIpWhitelist: getOptionalString(formData, "apiIpWhitelist"),
        callbackEnabled: getBoolean(formData, "callbackEnabled"),
      },
    });

    await writeAdminAuditLog({
      action: "merchant.create",
      resourceType: "merchant",
      resourceId: merchant.id,
      actor: getAuditActor(session),
      summary: `创建商户 ${code}。`,
      metadata: {
        code,
        status: merchant.status,
        callbackEnabled: merchant.callbackEnabled,
        apiIpWhitelist: merchant.apiIpWhitelist,
      },
    });
    revalidateAdminPaths();
  } catch (error) {
    redirectWithError(redirectTo, error);
  }

  redirect(withMessage(redirectTo, "success", `商户 ${code} 已创建。`));
}

export async function updateMerchantAction(formData: FormData) {
  const session = await requireAdminPermission("merchant:write");
  const redirectTo = getRedirectTo(formData, "/admin/merchants");

  try {
    const prisma = getPrismaClient();
    const id = getString(formData, "id");
    const code = getString(formData, "code");
    const name = getString(formData, "name");

    if (!id) {
      throw new Error("缺少商户 ID。");
    }

    if (!code || !name) {
      throw new Error("商户编码和商户名称不能为空。");
    }

    const existing = await prisma.merchant.findUnique({
      where: { id },
      select: {
        id: true,
        notifySecret: true,
        apiIpWhitelist: true,
      },
    });

    if (!existing) {
      throw new Error("商户不存在。");
    }

    const merchant = await prisma.merchant.update({
      where: { id },
      data: {
        code,
        name,
        legalName: getOptionalString(formData, "legalName"),
        contactName: getOptionalString(formData, "contactName"),
        contactEmail: getOptionalString(formData, "contactEmail"),
        contactPhone: getOptionalString(formData, "contactPhone"),
        companyRegistrationId: getOptionalString(formData, "companyRegistrationId"),
        onboardingNote: getOptionalString(formData, "onboardingNote"),
        callbackBase: getOptionalString(formData, "callbackBase"),
        notifySecret: resolveNotifySecretForStorage({
          submittedValue: getString(formData, "notifySecret"),
          currentValue: existing.notifySecret,
          preserveBlank: getString(formData, "notifySecretStrategy") === "preserve_if_blank",
        }),
        apiIpWhitelist: getOptionalString(formData, "apiIpWhitelist"),
        callbackEnabled: getBoolean(formData, "callbackEnabled"),
      },
    });

    await writeAdminAuditLog({
      action: "merchant.update",
      resourceType: "merchant",
      resourceId: merchant.id,
      actor: getAuditActor(session),
      summary: `更新商户 ${code}。`,
      metadata: {
        code,
        status: merchant.status,
        callbackEnabled: merchant.callbackEnabled,
        apiIpWhitelist: merchant.apiIpWhitelist,
      },
    });
    revalidateAdminPaths();
  } catch (error) {
    redirectWithError(redirectTo, error);
  }

  redirect(withMessage(redirectTo, "success", "商户配置已更新。"));
}

export async function createMerchantUserAction(formData: FormData) {
  const session = await requireAdminPermission("merchant:write");
  const redirectTo = getRedirectTo(formData, "/admin/merchants");

  try {
    const prisma = getPrismaClient();
    const merchantId = getRequiredString(formData, "merchantId", "商户 ID");
    const email = getRequiredString(formData, "email", "登录邮箱").toLowerCase();
    const name = getRequiredString(formData, "name", "登录姓名");
    const password = getRequiredString(formData, "password", "登录密码");
    const confirmPassword = getRequiredString(formData, "confirmPassword", "确认密码");
    const role = parseMerchantUserRole(getRequiredString(formData, "role", "账号角色"));
    const enabled = getBoolean(formData, "enabled");

    if (password.length < 8) {
      throw new Error("登录密码至少需要 8 位。");
    }

    if (password !== confirmPassword) {
      throw new Error("两次输入的密码不一致。");
    }

    const merchant = await prisma.merchant.findUnique({
      where: { id: merchantId },
      select: {
        id: true,
        code: true,
      },
    });

    if (!merchant) {
      throw new Error("商户不存在。");
    }

    const merchantUser = await prisma.merchantUser.create({
      data: {
        merchantId,
        email,
        name,
        passwordHash: await hashPassword(password),
        role,
        enabled,
      },
    });

    await writeAdminAuditLog({
      actor: getAuditActor(session),
      action: "merchant_user.create",
      resourceType: "merchant_user",
      resourceId: merchantUser.id,
      summary: `为商户 ${merchant.code} 创建登录账号 ${email}。`,
      metadata: {
        merchantId,
        merchantCode: merchant.code,
        role,
        enabled,
      },
    });
    revalidateAdminPaths();
  } catch (error) {
    if (isPrismaUniqueConstraintError(error, "email")) {
      redirectWithError(redirectTo, new Error("该登录邮箱已经被其他商户账号使用。"));
    }

    redirectWithError(redirectTo, error);
  }

  redirect(withMessage(redirectTo, "success", "商户登录账号已创建。"));
}

export async function updateMerchantUserAction(formData: FormData) {
  const session = await requireAdminPermission("merchant:write");
  const redirectTo = getRedirectTo(formData, "/admin/merchants");

  try {
    const prisma = getPrismaClient();
    const id = getRequiredString(formData, "id", "商户用户 ID");
    const merchantId = getRequiredString(formData, "merchantId", "商户 ID");
    const email = getRequiredString(formData, "email", "登录邮箱").toLowerCase();
    const name = getRequiredString(formData, "name", "登录姓名");
    const password = getString(formData, "password");
    const confirmPassword = getString(formData, "confirmPassword");
    const role = parseMerchantUserRole(getRequiredString(formData, "role", "账号角色"));
    const enabled = getBoolean(formData, "enabled");

    if (password) {
      if (password.length < 8) {
        throw new Error("登录密码至少需要 8 位。");
      }

      if (password !== confirmPassword) {
        throw new Error("两次输入的密码不一致。");
      }
    }

    const existing = await prisma.merchantUser.findUnique({
      where: { id },
      select: {
        id: true,
        merchantId: true,
        merchant: {
          select: {
            code: true,
          },
        },
      },
    });

    if (!existing || existing.merchantId !== merchantId) {
      throw new Error("商户登录账号不存在。");
    }

    const merchantUser = await prisma.merchantUser.update({
      where: { id },
      data: {
        email,
        name,
        role,
        enabled,
        ...(password ? { passwordHash: await hashPassword(password) } : {}),
      },
    });

    await writeAdminAuditLog({
      actor: getAuditActor(session),
      action: "merchant_user.update",
      resourceType: "merchant_user",
      resourceId: merchantUser.id,
      summary: `更新商户 ${existing.merchant.code} 的登录账号 ${email}。`,
      metadata: {
        merchantId,
        merchantCode: existing.merchant.code,
        role,
        enabled,
        passwordRotated: Boolean(password),
      },
    });
    revalidateAdminPaths();
  } catch (error) {
    if (isPrismaUniqueConstraintError(error, "email")) {
      redirectWithError(redirectTo, new Error("该登录邮箱已经被其他商户账号使用。"));
    }

    redirectWithError(redirectTo, error);
  }

  redirect(withMessage(redirectTo, "success", "商户登录账号已更新。"));
}

export async function reviewMerchantAction(formData: FormData) {
  const session = await requireAdminPermission("merchant:write");
  const redirectTo = getRedirectTo(formData, "/admin/merchants");

  try {
    const prisma = getPrismaClient();
    const id = getRequiredString(formData, "id", "商户 ID");
    const nextStatus = parseMerchantStatus(getRequiredString(formData, "status", "审核状态"));
    const reviewNote = getOptionalString(formData, "reviewNote");
    const merchant = await prisma.merchant.findUnique({
      where: { id },
      select: {
        id: true,
        code: true,
        name: true,
        status: true,
        legalName: true,
        contactName: true,
        contactPhone: true,
        companyRegistrationId: true,
        approvedAt: true,
        approvedBy: true,
      },
    });

    if (!merchant) {
      throw new Error("商户不存在。");
    }

    const now = new Date();
    const updated = await prisma.merchant.update({
      where: { id },
      data: {
        status: nextStatus,
        reviewNote,
        statusChangedAt: now,
        approvedAt:
          nextStatus === "APPROVED"
            ? merchant.approvedAt ?? now
            : merchant.approvedAt,
        approvedBy:
          nextStatus === "APPROVED"
            ? session.adminUser.email
            : merchant.approvedBy,
      },
    });

    await writeAdminAuditLog({
      action: "merchant.review",
      resourceType: "merchant",
      resourceId: updated.id,
      actor: getAuditActor(session),
      summary: `审核商户 ${updated.code}，状态更新为 ${nextStatus}。`,
      metadata: {
        previousStatus: merchant.status,
        nextStatus,
        reviewNote,
      },
    });
    revalidateAdminPaths();
  } catch (error) {
    redirectWithError(redirectTo, error);
  }

  redirect(withMessage(redirectTo, "success", "商户审核状态已更新。"));
}

export async function saveBindingAction(formData: FormData) {
  const session = await requireAdminPermission("binding:write");
  const redirectTo = getRedirectTo(formData, "/admin/bindings");

  try {
    const prisma = getPrismaClient();
    const merchantId = getString(formData, "merchantId");
    const channelCode = getString(formData, "channelCode");
    const merchantChannelAccountId = getOptionalString(formData, "merchantChannelAccountId");

    if (!merchantId || !channelCode) {
      throw new Error("merchantId 和 channelCode 不能为空。");
    }

    if (merchantChannelAccountId) {
      const merchantChannelAccount = await prisma.merchantChannelAccount.findUnique({
        where: { id: merchantChannelAccountId },
        select: {
          id: true,
          merchantId: true,
          channelCode: true,
        },
      });

      if (!merchantChannelAccount) {
        throw new Error("指定的商户通道实例不存在。");
      }

      if (merchantChannelAccount.merchantId !== merchantId) {
        throw new Error("商户通道实例不属于当前商户。");
      }

      if (merchantChannelAccount.channelCode !== channelCode) {
        throw new Error("商户通道实例与绑定通道不匹配。");
      }
    }

    const binding = await prisma.merchantChannelBinding.upsert({
      where: {
        merchantId_channelCode: {
          merchantId,
          channelCode,
        },
      },
      update: {
        enabled: getBoolean(formData, "enabled"),
        providerAccountId: null,
        merchantChannelAccountId,
        minAmount: parseDecimalOrNull(getString(formData, "minAmount"), "minAmount"),
        maxAmount: parseDecimalOrNull(getString(formData, "maxAmount"), "maxAmount"),
        feeRate: parseDecimalOrNull(getString(formData, "feeRate"), "feeRate"),
      },
      create: {
        merchantId,
        channelCode,
        enabled: getBoolean(formData, "enabled"),
        providerAccountId: null,
        merchantChannelAccountId,
        minAmount: parseDecimalOrNull(getString(formData, "minAmount"), "minAmount"),
        maxAmount: parseDecimalOrNull(getString(formData, "maxAmount"), "maxAmount"),
        feeRate: parseDecimalOrNull(getString(formData, "feeRate"), "feeRate"),
      },
    });

    await writeAdminAuditLog({
      action: "binding.save",
      resourceType: "merchant_channel_binding",
      resourceId: binding.id,
      actor: getAuditActor(session),
      summary: `保存商户通道绑定 ${channelCode}。`,
      metadata: {
        merchantId,
        channelCode,
        merchantChannelAccountId,
        enabled: binding.enabled,
      },
    });
    revalidateAdminPaths();
  } catch (error) {
    redirectWithError(redirectTo, error);
  }

  redirect(withMessage(redirectTo, "success", "商户通道绑定已保存。"));
}

export async function saveSystemConfigAction(formData: FormData) {
  const session = await requireAdminPermission("system_config:write");
  const redirectTo = getRedirectTo(formData, "/admin/system-config");
  const key = getString(formData, "key");

  try {
    const prisma = getPrismaClient();
    const value = getString(formData, "value");

    if (!key) {
      throw new Error("配置键不能为空。");
    }

    const config = await prisma.systemConfig.upsert({
      where: { key },
      update: {
        value,
        group: getString(formData, "group") || "general",
        label: getOptionalString(formData, "label"),
      },
      create: {
        key,
        value,
        group: getString(formData, "group") || "general",
        label: getOptionalString(formData, "label"),
      },
    });

    await writeAdminAuditLog({
      action: "system_config.save",
      resourceType: "system_config",
      resourceId: config.key,
      actor: getAuditActor(session),
      summary: `保存系统配置 ${key}。`,
      metadata: {
        group: config.group,
        label: config.label,
      },
    });
    invalidateSystemConfigCache();
    revalidateAdminPaths();
  } catch (error) {
    redirectWithError(redirectTo, error);
  }

  redirect(withMessage(redirectTo, "success", `系统配置 ${key} 已保存。`));
}

export async function saveSystemConfigBatchAction(formData: FormData) {
  const session = await requireAdminPermission("system_config:write");
  const redirectTo = getRedirectTo(formData, "/admin/system-config");
  const batchLabel = getString(formData, "batchLabel");

  try {
    const keys = formData
      .getAll("configKey")
      .map((value) => (typeof value === "string" ? value.trim() : ""));
    const groups = formData
      .getAll("configGroup")
      .map((value) => (typeof value === "string" ? value.trim() : ""));
    const labels = formData
      .getAll("configLabel")
      .map((value) => (typeof value === "string" ? value.trim() : ""));
    const values = formData
      .getAll("configValue")
      .map((value) => (typeof value === "string" ? value.trim() : ""));
    const kinds = formData
      .getAll("configKind")
      .map((value) => (typeof value === "string" ? value.trim() : "text"));
    const requiredFlags = formData
      .getAll("configRequired")
      .map((value) => (typeof value === "string" ? value.trim() : "false"));

    if (
      keys.length === 0 ||
      keys.length !== groups.length ||
      keys.length !== labels.length ||
      keys.length !== values.length ||
      keys.length !== kinds.length ||
      keys.length !== requiredFlags.length
    ) {
      throw new Error("系统配置表单格式不正确，请刷新页面后重试。");
    }

    const payload = keys.map((key, index) => {
      const label = labels[index] || key;
      const value = values[index];
      const kind = kinds[index] || "text";
      const required = requiredFlags[index] === "true";

      if (!key) {
        throw new Error("存在缺失 Key 的系统配置项。");
      }

      validateSystemConfigValue({
        key,
        label,
        value,
        kind,
        required,
      });

      return {
        key,
        group: groups[index] || "general",
        label: label || null,
        value,
      };
    });

    const prisma = getPrismaClient();

    await prisma.$transaction(
      payload.map((config) =>
        prisma.systemConfig.upsert({
          where: {
            key: config.key,
          },
          update: {
            value: config.value,
            group: config.group,
            label: config.label,
          },
          create: {
            key: config.key,
            value: config.value,
            group: config.group,
            label: config.label,
          },
        }),
      ),
    );

    await writeAdminAuditLog({
      action: "system_config.batch_save",
      resourceType: "system_config",
      resourceId: batchLabel || payload[0]?.group || "batch",
      actor: getAuditActor(session),
      summary: `批量保存系统配置 ${batchLabel || payload[0]?.group || "batch"}。`,
      metadata: {
        batchLabel,
        keys: payload.map((item) => item.key),
      },
    });

    invalidateSystemConfigCache();
    revalidateAdminPaths();
  } catch (error) {
    redirectWithError(redirectTo, error);
  }

  redirect(withMessage(redirectTo, "success", `系统配置 ${batchLabel || "批次"} 已保存。`));
}

export async function retryCallbackAction(formData: FormData) {
  const session = await requireAdminPermission("callback:write");
  const redirectTo = getRedirectTo(formData, "/admin");

  try {
    const orderId = getString(formData, "orderId");

    if (!orderId) {
      throw new Error("缺少订单 ID。");
    }

    await dispatchMerchantCallback(orderId, true);
    await writeAdminAuditLog({
      action: "merchant_callback.retry",
      resourceType: "payment_order",
      resourceId: orderId,
      actor: getAuditActor(session),
      summary: `重试商户回调 ${orderId}。`,
    });
    revalidateAdminPaths();
  } catch (error) {
    redirectWithError(redirectTo, error);
  }

  redirect(withMessage(redirectTo, "success", "商户回调已重新投递。"));
}

export async function runFinanceMaintenanceAction(formData: FormData) {
  const session = await requireAdminPermission("finance:write");
  const redirectTo = getRedirectTo(formData, "/admin/finance");

  try {
    const result = await runFinanceMaintenance();
    await writeAdminAuditLog({
      actor: getAuditActor(session),
      action: "finance.maintenance.run",
      resourceType: "finance_maintenance",
      summary: "执行了一次财务补账、结算和余额快照同步。",
      metadata: result,
    });
    revalidateAdminPaths();
  } catch (error) {
    redirectWithError(redirectTo, error);
  }

  redirect(withMessage(redirectTo, "success", "财务补账与结算同步已完成。"));
}

export async function markSettlementPaidAction(formData: FormData) {
  const session = await requireAdminPermission("finance:write");
  const redirectTo = getRedirectTo(formData, "/admin/finance");

  try {
    const settlementId = getRequiredString(formData, "settlementId", "结算单 ID");
    const result = await markMerchantSettlementPaid({
      settlementId,
    });

    await writeAdminAuditLog({
      actor: getAuditActor(session),
      action: "finance.settlement.mark_paid",
      resourceType: "merchant_settlement",
      resourceId: settlementId,
      summary: `将结算单 ${settlementId} 标记为已打款。`,
      metadata: {
        merchantCode: result.settlement.merchant.code,
        paidAmount: result.paidAmount,
        paidAt: result.settlement.paidAt?.toISOString() ?? null,
      },
    });
    revalidateAdminPaths();
  } catch (error) {
    redirectWithError(redirectTo, error);
  }

  redirect(withMessage(redirectTo, "success", "结算单已标记为已打款。"));
}

export async function createAdminUserAction(formData: FormData) {
  const session = await requireAdminPermission("admin_user:write");
  const redirectTo = getRedirectTo(formData, "/admin/users");

  try {
    const prisma = getPrismaClient();
    const email = getRequiredString(formData, "email", "管理员账号").toLowerCase();
    const name = getRequiredString(formData, "name", "管理员名称");
    const password = getRequiredString(formData, "password", "管理员密码");
    const role = parseAdminRole(getRequiredString(formData, "role", "管理员角色"));

    const user = await prisma.adminUser.create({
      data: {
        email,
        name,
        passwordHash: await hashPassword(password),
        role,
        enabled: getBoolean(formData, "enabled"),
      },
    });

    await writeAdminAuditLog({
      actor: getAuditActor(session),
      action: "admin_user.create",
      resourceType: "admin_user",
      resourceId: user.id,
      summary: `创建管理员账号 ${email}。`,
      metadata: {
        role,
        enabled: user.enabled,
      },
    });
    revalidateAdminPaths();
  } catch (error) {
    redirectWithError(redirectTo, error);
  }

  redirect(withMessage(redirectTo, "success", "管理员账号已创建。"));
}

export async function updateAdminUserAction(formData: FormData) {
  const session = await requireAdminPermission("admin_user:write");
  const redirectTo = getRedirectTo(formData, "/admin/users");

  try {
    const prisma = getPrismaClient();
    const id = getRequiredString(formData, "id", "管理员 ID");
    const email = getRequiredString(formData, "email", "管理员账号").toLowerCase();
    const name = getRequiredString(formData, "name", "管理员名称");
    const password = getString(formData, "password");
    const role = parseAdminRole(getRequiredString(formData, "role", "管理员角色"));

    const user = await prisma.adminUser.update({
      where: { id },
      data: {
        email,
        name,
        role,
        enabled: getBoolean(formData, "enabled"),
        ...(password ? { passwordHash: await hashPassword(password) } : {}),
      },
    });

    await writeAdminAuditLog({
      actor: getAuditActor(session),
      action: "admin_user.update",
      resourceType: "admin_user",
      resourceId: user.id,
      summary: `更新管理员账号 ${email}。`,
      metadata: {
        role,
        enabled: user.enabled,
        passwordRotated: Boolean(password),
      },
    });
    revalidateAdminPaths();
  } catch (error) {
    redirectWithError(redirectTo, error);
  }

  redirect(withMessage(redirectTo, "success", "管理员账号已更新。"));
}

export async function createMerchantApiCredentialAction(formData: FormData) {
  const session = await requireAdminPermission("merchant_credential:write");
  const redirectTo = getRedirectTo(formData, "/admin/merchants");

  try {
    const prisma = getPrismaClient();
    const merchantId = getRequiredString(formData, "merchantId", "商户 ID");
    const label = getRequiredString(formData, "label", "凭证标签");
    const expiresAt = parseDateOrNull(getString(formData, "expiresAt"), "凭证过期时间");
    const merchant = await prisma.merchant.findUnique({
      where: { id: merchantId },
      select: { id: true, code: true },
    });

    if (!merchant) {
      throw new Error("商户不存在。");
    }

    const generated = generateMerchantApiCredential();
    const credential = await prisma.merchantApiCredential.create({
      data: {
        merchantId,
        label,
        keyId: generated.keyId,
        secretCiphertext: generated.secretCiphertext,
        secretPreview: generated.secretPreview,
        enabled: true,
        expiresAt,
      },
    });

    await writeAdminAuditLog({
      actor: getAuditActor(session),
      action: "merchant_credential.create",
      resourceType: "merchant_api_credential",
      resourceId: credential.id,
      summary: `为商户 ${merchant.code} 创建 API 凭证 ${label}。`,
      metadata: {
        merchantId,
        keyId: credential.keyId,
        expiresAt: credential.expiresAt?.toISOString() ?? null,
      },
    });
    revalidateAdminPaths();

    redirect(
      withMessage(
        redirectTo,
        "success",
        `API 凭证已创建。Key ID: ${generated.keyId} Secret: ${generated.secret}（仅展示一次）`,
      ),
    );
  } catch (error) {
    redirectWithError(redirectTo, error);
  }
}

export async function updateMerchantApiCredentialStatusAction(formData: FormData) {
  const session = await requireAdminPermission("merchant_credential:write");
  const redirectTo = getRedirectTo(formData, "/admin/merchants");

  try {
    const prisma = getPrismaClient();
    const id = getRequiredString(formData, "id", "凭证 ID");
    const enabled = getBoolean(formData, "enabled");

    const credential = await prisma.merchantApiCredential.update({
      where: { id },
      data: {
        enabled,
        expiresAt: parseDateOrNull(getString(formData, "expiresAt"), "凭证过期时间"),
      },
      include: {
        merchant: {
          select: {
            code: true,
          },
        },
      },
    });

    await writeAdminAuditLog({
      actor: getAuditActor(session),
      action: "merchant_credential.update",
      resourceType: "merchant_api_credential",
      resourceId: credential.id,
      summary: `更新商户 ${credential.merchant.code} 的 API 凭证 ${credential.label}。`,
      metadata: {
        keyId: credential.keyId,
        enabled: credential.enabled,
        expiresAt: credential.expiresAt?.toISOString() ?? null,
      },
    });
    revalidateAdminPaths();
  } catch (error) {
    redirectWithError(redirectTo, error);
  }

  redirect(withMessage(redirectTo, "success", "商户 API 凭证已更新。"));
}

export async function syncMarketplacePluginsAction(formData: FormData) {
  const session = await requireAdminPermission("plugin_marketplace:write");
  const redirectTo = getRedirectTo(formData, "/admin/plugins");

  try {
    await syncBuiltinMarketplacePlugins(true);
    await writeAdminAuditLog({
      actor: getAuditActor(session),
      action: "marketplace_plugin.sync",
      resourceType: "marketplace_plugin",
      summary: "同步受控内置插件市场目录。",
    });
    revalidateAdminPaths();
  } catch (error) {
    redirectWithError(redirectTo, error);
  }

  redirect(withMessage(redirectTo, "success", "插件市场目录已同步。"));
}

/**
 * Manually triggers a license revalidation pass against the Registry.
 * Useful for verifying the scheduler is wired correctly and for manually
 * disabling plugins after a known revocation event.
 */
export async function revalidateMarketplaceLicensesAction(formData: FormData) {
  const session = await requireAdminPermission("plugin_marketplace:write");
  const redirectTo = getRedirectTo(formData, "/admin/plugins");

  try {
    const { triggerLicenseRevalidationNow } = await import(
      "@/lib/plugins/license-revalidation-scheduler"
    );
    const result = await triggerLicenseRevalidationNow();

    await writeAdminAuditLog({
      actor: getAuditActor(session),
      action: "marketplace_plugin.revalidate_licenses",
      resourceType: "marketplace_plugin",
      summary: `手动触发许可证重校验：检查 ${result.inspected} 个，停用 ${result.disabled} 个。`,
      metadata: result as Prisma.InputJsonObject,
    });
    revalidateAdminPaths();

    redirect(
      withMessage(
        redirectTo,
        "success",
        `许可证重校验已完成：检查 ${result.inspected} 个，停用 ${result.disabled} 个。`,
      ),
    );
  } catch (error) {
    redirectWithError(redirectTo, error);
  }

  redirect(redirectTo);
}

export async function createPluginRegistrySourceAction(formData: FormData) {
  const session = await requireAdminPermission("plugin_marketplace:write");
  const redirectTo = getRedirectTo(formData, "/admin/plugins/sources");

  try {
    const name = getRequiredString(formData, "name", "商店源名称");
    const baseUrl = getRequiredString(formData, "baseUrl", "商店源地址");

    if (!isHttpUrl(baseUrl)) {
      throw new Error("商店源地址必须是合法的 http/https URL。");
    }

    const source = await getPrismaClient().pluginRegistrySource.create({
      data: {
        name,
        baseUrl,
        appId: getOptionalString(formData, "appId"),
        appKeyCiphertext: resolveRegistryAppKeyForStorage({
          submittedValue: getString(formData, "appKey"),
        }),
        trustPublicKey: getOptionalString(formData, "trustPublicKey"),
        trustPublicKeyKeyId: getOptionalString(formData, "trustPublicKeyKeyId"),
        licensePublicKey: getOptionalString(formData, "licensePublicKey"),
        enabled: getBoolean(formData, "enabled"),
      },
    });

    await writeAdminAuditLog({
      actor: getAuditActor(session),
      action: "plugin_registry_source.create",
      resourceType: "plugin_registry_source",
      resourceId: source.id,
      summary: `创建插件商店源 ${source.name}。`,
      metadata: {
        baseUrl: source.baseUrl,
        enabled: source.enabled,
        hasAppId: Boolean(source.appId),
        hasAppKey: Boolean(source.appKeyCiphertext),
        hasTrustPublicKey: Boolean(source.trustPublicKey),
        hasLicensePublicKey: Boolean(source.licensePublicKey),
      },
    });
    revalidateAdminPaths();
  } catch (error) {
    redirectWithError(redirectTo, error);
  }

  redirect(withMessage(redirectTo, "success", "插件商店源已创建。"));
}

export async function updatePluginRegistrySourceAction(formData: FormData) {
  const session = await requireAdminPermission("plugin_marketplace:write");
  const redirectTo = getRedirectTo(formData, "/admin/plugins/sources");

  try {
    const id = getRequiredString(formData, "id", "商店源 ID");
    const existing = await getPrismaClient().pluginRegistrySource.findUnique({
      where: {
        id,
      },
      select: {
        id: true,
        name: true,
        appKeyCiphertext: true,
      },
    });

    if (!existing) {
      throw new Error("插件商店源不存在。");
    }

    const name = getRequiredString(formData, "name", "商店源名称");
    const baseUrl = getRequiredString(formData, "baseUrl", "商店源地址");

    if (!isHttpUrl(baseUrl)) {
      throw new Error("商店源地址必须是合法的 http/https URL。");
    }

    const source = await getPrismaClient().pluginRegistrySource.update({
      where: {
        id,
      },
      data: {
        name,
        baseUrl,
        appId: getOptionalString(formData, "appId"),
        appKeyCiphertext: resolveRegistryAppKeyForStorage({
          submittedValue: getString(formData, "appKey"),
          currentValue: existing.appKeyCiphertext,
          preserveBlank: getString(formData, "appKeyStrategy") === "preserve_if_blank",
        }),
        trustPublicKey: getOptionalString(formData, "trustPublicKey"),
        trustPublicKeyKeyId: getOptionalString(formData, "trustPublicKeyKeyId"),
        licensePublicKey: getOptionalString(formData, "licensePublicKey"),
        enabled: getBoolean(formData, "enabled"),
      },
    });

    await writeAdminAuditLog({
      actor: getAuditActor(session),
      action: "plugin_registry_source.update",
      resourceType: "plugin_registry_source",
      resourceId: source.id,
      summary: `更新插件商店源 ${source.name}。`,
      metadata: {
        baseUrl: source.baseUrl,
        enabled: source.enabled,
        hasAppId: Boolean(source.appId),
        hasAppKey: Boolean(source.appKeyCiphertext),
        hasTrustPublicKey: Boolean(source.trustPublicKey),
        hasLicensePublicKey: Boolean(source.licensePublicKey),
      },
    });
    revalidateAdminPaths();
  } catch (error) {
    redirectWithError(redirectTo, error);
  }

  redirect(withMessage(redirectTo, "success", "插件商店源已更新。"));
}

export async function syncPluginRegistrySourceAction(formData: FormData) {
  const session = await requireAdminPermission("plugin_marketplace:write");
  const redirectTo = getRedirectTo(formData, "/admin/plugins/sources");
  let sourceIdForAudit: string | null = null;

  try {
    const sourceId = getRequiredString(formData, "id", "商店源 ID");
    sourceIdForAudit = sourceId;
    const snapshot = await fetchRemoteRegistrySnapshot(sourceId);

    if (!snapshot) {
      throw new Error("插件商店源不存在或当前处于停用状态。");
    }

    await syncBuiltinMarketplacePlugins(true);

    await writeAdminAuditLog({
      actor: getAuditActor(session),
      action: "plugin_registry_source.sync",
      resourceType: "plugin_registry_source",
      resourceId: sourceId,
      summary: `同步插件商店源 ${snapshot.sourceName}。`,
      metadata: {
        baseUrl: snapshot.sourceBaseUrl,
        pluginCount: snapshot.plugins.length,
      },
    });
    revalidateAdminPaths();
  } catch (error) {
    if (sourceIdForAudit) {
      await writeAdminAuditLog({
        actor: getAuditActor(session),
        action: "plugin_registry_source.sync_failed",
        resourceType: "plugin_registry_source",
        resourceId: sourceIdForAudit,
        summary: `插件商店源 ${sourceIdForAudit} 同步失败。`,
        metadata: {
          error: error instanceof Error ? error.message : String(error),
        },
      });
    }
    redirectWithError(redirectTo, error);
  }

  redirect(withMessage(redirectTo, "success", "插件商店源目录已同步。"));
}

export async function syncPluginRegistrySourceTrustAnchorAction(formData: FormData) {
  const session = await requireAdminPermission("plugin_marketplace:write");
  const redirectTo = getRedirectTo(formData, "/admin/plugins/sources");

  try {
    const id = getRequiredString(formData, "id", "商店源 ID");
    const source = await getPrismaClient().pluginRegistrySource.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        baseUrl: true,
      },
    });

    if (!source) {
      throw new Error("插件商店源不存在。");
    }

    const trustAnchor = await fetchRegistryTrustAnchor(source.baseUrl);

    await getPrismaClient().pluginRegistrySource.update({
      where: { id: source.id },
      data: {
        trustPublicKeyKeyId: trustAnchor.keyId,
        trustPublicKey: trustAnchor.publicKey,
      },
    });

    await writeAdminAuditLog({
      actor: getAuditActor(session),
      action: "plugin_registry_source.refresh_trust_anchor",
      resourceType: "plugin_registry_source",
      resourceId: source.id,
      summary: `刷新插件商店源 ${source.name} 的当前信任锚。`,
      metadata: {
        keyId: trustAnchor.keyId,
      },
    });

    revalidateAdminPaths();
  } catch (error) {
    redirectWithError(redirectTo, error);
  }

  redirect(withMessage(redirectTo, "success", "当前信任锚已同步。"));
}

export async function markMarketplacePluginPurchasedAction(formData: FormData) {
  const session = await requireAdminPermission("plugin_marketplace:write");
  const redirectTo = getRedirectTo(formData, "/admin/plugins");

  try {
    const slug = getRequiredString(formData, "slug", "插件标识");
    const { plugin, record } = await recordMarketplacePluginPurchase({
      slug,
      purchasedBy: getAuditActor(session),
      orderReference: getOptionalString(formData, "orderReference"),
      licenseKey: getOptionalString(formData, "licenseKey"),
      notes: getOptionalString(formData, "notes"),
    });

    await writeAdminAuditLog({
      actor: getAuditActor(session),
      action: "marketplace_plugin.mark_purchased",
      resourceType: "marketplace_plugin",
      resourceId: plugin.id,
      summary: `记录收费插件 ${plugin.slug} 已购买。`,
      metadata: {
        slug: plugin.slug,
        purchasedAt: plugin.purchasedAt?.toISOString() ?? null,
        orderReference: record.orderReference,
        licenseKey: record.licenseKey,
      },
    });
    revalidateAdminPaths();
  } catch (error) {
    redirectWithError(redirectTo, error);
  }

  redirect(withMessage(redirectTo, "success", "收费插件已记录为已购状态。"));
}

/**
 * Phase 3 license-based purchase action. Calls the Registry's order endpoint
 * to create an order + receive a license, then verifies and persists it via
 * `purchaseAndIssueLicense`. Falls back to the legacy manual-mark flow if the
 * Registry is unreachable or the plugin has no registrySourceId.
 */
export async function purchaseMarketplacePluginAction(formData: FormData) {
  const session = await requireAdminPermission("plugin_marketplace:write");
  const redirectTo = getRedirectTo(formData, "/admin/plugins");

  try {
    const slug = getRequiredString(formData, "slug", "插件标识");
    const prisma = getPrismaClient();

    // Look up the plugin and its registry source
    const plugin = await prisma.marketplacePlugin.findUnique({
      where: { slug },
      select: {
        id: true,
        slug: true,
        source: true,
        version: true,
        pricingMode: true,
        registrySourceId: true,
      },
    });

    if (!plugin || plugin.source !== "REMOTE_SIGNED" || plugin.pricingMode !== "PAID") {
      throw new Error("当前插件不是远程收费插件，无法发起购买。");
    }

    if (!plugin.registrySourceId) {
      throw new Error("当前插件未关联远程商店源，无法发起购买。");
    }

    const source = await prisma.pluginRegistrySource.findUnique({
      where: { id: plugin.registrySourceId },
    });

    if (!source) {
      throw new Error("远程商店源不存在。");
    }

    const { revealStoredSecret } = await import("@/lib/secret-box");
    const { ensureInstanceId } = await import("@/lib/system-config");
    const instanceId = await ensureInstanceId();
    const appKey = revealStoredSecret(source.appKeyCiphertext) ?? "";

    // Call Registry to create an order (auto-pay in dev mode)
    const orderUrl = new URL(
      `/api/registry/plugins/${slug}/orders`,
      source.baseUrl,
    ).toString();

    const orderRes = await fetch(orderUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-novapay-registry-app-id": source.appId ?? "",
        "x-novapay-registry-app-key": appKey,
      },
      body: JSON.stringify({ instanceId }),
      signal: AbortSignal.timeout(15_000),
    });

    if (!orderRes.ok) {
      const errorBody = await orderRes.text();
      throw new Error(`Registry 订单创建失败 (HTTP ${orderRes.status}): ${errorBody}`);
    }

    const orderData = (await orderRes.json()) as {
      orderId: string;
      state: string;
      license?: { licenseKey: string } | null;
      checkoutUrl?: string | null;
    };

    // If the order is already PAID (auto-pay dev mode), verify the license
    if (orderData.state === "PAID" && orderData.license?.licenseKey) {
      const result = await purchaseAndIssueLicense({
        slug,
        licenseKey: orderData.license.licenseKey,
        version: plugin.version,
        instanceId,
        purchasedBy: getAuditActor(session),
        orderReference: orderData.orderId,
      });

      if (!result.success) {
        throw new Error(
          `许可证验证失败: ${result.reason} — ${result.message}`,
        );
      }

      await writeAdminAuditLog({
        actor: getAuditActor(session),
        action: "marketplace_plugin.purchase_license",
        resourceType: "marketplace_plugin",
        resourceId: plugin.id,
        summary: `通过 Registry 购买插件 ${plugin.slug} 并获得许可证。`,
        metadata: {
          slug: plugin.slug,
          orderId: orderData.orderId,
          instanceId,
        },
      });
      revalidateAdminPaths();
      redirect(
        withMessage(redirectTo, "success", "收费插件已购买并获得许可证验证。"),
      );
    }

    // If the order is PENDING (real checkout mode), redirect to checkout and
    // carry the plugin context back so the admin UI can finalize the license
    // record after payment completes.
    if (orderData.checkoutUrl) {
      const checkoutUrl = new URL(orderData.checkoutUrl);
      checkoutUrl.searchParams.set("registryPluginSlug", plugin.slug);
      checkoutUrl.searchParams.set("registryOrderId", orderData.orderId);
      redirect(checkoutUrl.toString());
    }

    throw new Error("Registry 返回了未知的订单状态，请稍后重试。");
  } catch (error) {
    redirectWithError(redirectTo, error);
  }

  redirect(redirectTo);
}

export async function finalizeMarketplacePluginPurchaseAction(input: {
  slug: string;
  registryOrderId: string;
}) {
  const session = await requireAdminPermission("plugin_marketplace:write");
  const prisma = getPrismaClient();

  const plugin = await prisma.marketplacePlugin.findUnique({
    where: { slug: input.slug },
    select: {
      id: true,
      slug: true,
      version: true,
      source: true,
      pricingMode: true,
      registrySourceId: true,
      purchasedAt: true,
    },
  });

  if (!plugin || plugin.source !== "REMOTE_SIGNED" || plugin.pricingMode !== "PAID") {
    throw new Error("当前插件不是远程收费插件，无法完成购买回写。");
  }

  if (plugin.purchasedAt) {
    return { success: true, idempotent: true };
  }

  if (!plugin.registrySourceId) {
    throw new Error("当前插件未关联远程商店源。");
  }

  const source = await prisma.pluginRegistrySource.findUnique({
    where: { id: plugin.registrySourceId },
  });
  if (!source) {
    throw new Error("远程商店源不存在。");
  }

  const { revealStoredSecret } = await import("@/lib/secret-box");
  const { ensureInstanceId } = await import("@/lib/system-config");
  const instanceId = await ensureInstanceId();
  const appKey = revealStoredSecret(source.appKeyCiphertext) ?? "";

  const orderUrl = new URL(
    `/api/registry/orders/${input.registryOrderId}`,
    source.baseUrl,
  ).toString();

  const orderRes = await fetch(orderUrl, {
    method: "GET",
    headers: {
      "x-novapay-registry-app-id": source.appId ?? "",
      "x-novapay-registry-app-key": appKey,
    },
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });

  if (!orderRes.ok) {
    throw new Error(`Registry 订单查询失败 (HTTP ${orderRes.status})。`);
  }

  const orderData = (await orderRes.json()) as {
    state: string;
    license?: { licenseKey: string } | null;
  };

  if (orderData.state !== "PAID" || !orderData.license?.licenseKey) {
    return { success: false, pending: true };
  }

  const result = await purchaseAndIssueLicense({
    slug: plugin.slug,
    licenseKey: orderData.license.licenseKey,
    version: plugin.version,
    instanceId,
    purchasedBy: getAuditActor(session),
    orderReference: input.registryOrderId,
  });

  if (!result.success) {
    throw new Error(`许可证验证失败: ${result.reason} — ${result.message}`);
  }

  await writeAdminAuditLog({
    actor: getAuditActor(session),
    action: "marketplace_plugin.purchase_license_finalize",
    resourceType: "marketplace_plugin",
    resourceId: plugin.id,
    summary: `确认 Registry 订单 ${input.registryOrderId} 已支付并完成许可证落账。`,
    metadata: {
      slug: plugin.slug,
      orderId: input.registryOrderId,
    },
  });

  revalidateAdminPaths();
  return { success: true };
}

export async function installMarketplacePluginAction(formData: FormData) {
  const session = await requireAdminPermission("plugin_marketplace:write");
  const redirectTo = getRedirectTo(formData, "/admin/plugins");
  let installedEnabled = false;

  try {
    const slug = getRequiredString(formData, "slug", "插件标识");
    const plugin = await installMarketplacePlugin(slug);
    installedEnabled = plugin.enabled;

    await writeAdminAuditLog({
      actor: getAuditActor(session),
      action: "marketplace_plugin.install",
      resourceType: "marketplace_plugin",
      resourceId: plugin.id,
      summary: `安装插件 ${plugin.slug}。`,
      metadata: {
        slug: plugin.slug,
        installed: plugin.installed,
        enabled: plugin.enabled,
        version: plugin.version,
      },
    });
    revalidateAdminPaths();
  } catch (error) {
    redirectWithError(redirectTo, error);
  }

  redirect(
    withMessage(
      redirectTo,
      "success",
      installedEnabled ? "插件已安装并启用。" : "插件已导入市场目录，当前仍处于未启用状态。",
    ),
  );
}

export async function uninstallMarketplacePluginAction(formData: FormData) {
  const session = await requireAdminPermission("plugin_marketplace:write");
  const redirectTo = getRedirectTo(formData, "/admin/plugins");

  try {
    const slug = getRequiredString(formData, "slug", "插件标识");
    const plugin = await uninstallMarketplacePlugin(slug);

    await writeAdminAuditLog({
      actor: getAuditActor(session),
      action: "marketplace_plugin.uninstall",
      resourceType: "marketplace_plugin",
      resourceId: plugin.id,
      summary: `卸载插件 ${plugin.slug}。`,
      metadata: {
        slug: plugin.slug,
        installed: plugin.installed,
        enabled: plugin.enabled,
        version: plugin.version,
      },
    });
    revalidateAdminPaths();
  } catch (error) {
    redirectWithError(redirectTo, error);
  }

  redirect(withMessage(redirectTo, "success", "插件已从受控市场停用。"));
}

export async function toggleMarketplacePluginEnabledAction(formData: FormData) {
  const session = await requireAdminPermission("plugin_marketplace:write");
  const redirectTo = getRedirectTo(formData, "/admin/plugins");

  try {
    const slug = getRequiredString(formData, "slug", "插件标识");
    const enabled = getBoolean(formData, "enabled");
    const plugin = await setMarketplacePluginEnabled(slug, enabled);

    await writeAdminAuditLog({
      actor: getAuditActor(session),
      action: "marketplace_plugin.toggle",
      resourceType: "marketplace_plugin",
      resourceId: plugin.id,
      summary: `${enabled ? "启用" : "停用"}插件 ${plugin.slug}。`,
      metadata: {
        slug: plugin.slug,
        installed: plugin.installed,
        enabled: plugin.enabled,
        version: plugin.version,
      },
    });
    revalidateAdminPaths();
  } catch (error) {
    redirectWithError(redirectTo, error);
  }

  redirect(
    withMessage(
      redirectTo,
      "success",
      getBoolean(formData, "enabled") ? "插件已启用。" : "插件已停用。",
    ),
  );
}

export async function batchMarketplacePluginAction(formData: FormData) {
  const session = await requireAdminPermission("plugin_marketplace:write");
  const redirectTo = getRedirectTo(formData, "/admin/plugins");

  try {
    const action = getRequiredString(formData, "batchAction", "批量操作");
    const slugs = getStringList(formData, "selectedSlugs");

    if (slugs.length === 0) {
      throw new Error("请先选择至少一个插件。");
    }

    const uniqueSlugs = [...new Set(slugs)];
    let changed = 0;

    for (const slug of uniqueSlugs) {
      let plugin;

      if (action === "install") {
        plugin = await installMarketplacePlugin(slug);
      } else if (action === "enable") {
        plugin = await setMarketplacePluginEnabled(slug, true);
      } else if (action === "disable") {
        plugin = await setMarketplacePluginEnabled(slug, false);
      } else if (action === "uninstall") {
        plugin = await uninstallMarketplacePlugin(slug);
      } else {
        throw new Error("不支持的批量操作。");
      }

      changed += 1;

      await writeAdminAuditLog({
        actor: getAuditActor(session),
        action: `marketplace_plugin.batch.${action}`,
        resourceType: "marketplace_plugin",
        resourceId: plugin.id,
        summary: `批量${action === "install" ? "安装" : action === "enable" ? "启用" : action === "disable" ? "停用" : "卸载"}插件 ${plugin.slug}。`,
        metadata: {
          slug: plugin.slug,
          installed: plugin.installed,
          enabled: plugin.enabled,
          version: plugin.version,
          batchSize: uniqueSlugs.length,
        },
      });
    }

    revalidateAdminPaths();

    const actionLabel =
      action === "install"
        ? "安装"
        : action === "enable"
          ? "启用"
          : action === "disable"
            ? "停用"
            : "卸载";

    redirect(
      withMessage(
        redirectTo,
        "success",
        `已批量${actionLabel} ${changed} 个插件。`,
      ),
    );
  } catch (error) {
    redirectWithError(redirectTo, error);
  }
}
