"use server";

import { randomBytes } from "node:crypto";
import type { Prisma } from "@/generated/prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  authenticateMerchantUser,
  clearMerchantSession,
  createMerchantSession,
  hasMerchantSession,
  requireMerchantPermission,
  requireMerchantSession,
} from "@/lib/merchant-session";
import { writeAdminAuditLog } from "@/lib/admin-audit";
import {
  clearMerchantCredentialReveal,
  stashMerchantCredentialReveal,
} from "@/lib/merchant-credential-reveal";
import { revealMerchantCredentialSecret } from "@/lib/merchant-credentials";
import {
  generateMerchantChannelCallbackToken,
  getMerchantChannelTemplate,
} from "@/lib/merchant-channel-accounts";
import { generateMerchantApiCredential } from "@/lib/merchant-credentials";
import {
  createPaymentOrder,
  closeMerchantPaymentOrder,
  getMerchantPaymentOrder,
} from "@/lib/orders/service";
import { hashPassword } from "@/lib/password";
import {
  assertMerchantProfileCompleteForChannel,
  createPendingMerchantName,
  isMerchantProfileComplete,
  channelRequiresMerchantProfile,
} from "@/lib/merchant-profile-completion";
import { formatAmount } from "@/lib/payments/utils";
import { getPrismaClient } from "@/lib/prisma";
import { protectProviderConfigForStorage } from "@/lib/provider-account-config";
import {
  createMerchantPaymentRefund,
  getMerchantPaymentRefund,
} from "@/lib/refunds/service";
import { migrateStoredSecret, sealStoredSecret } from "@/lib/secret-box";

function getString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function getOptionalString(formData: FormData, key: string) {
  const value = getString(formData, key);
  return value || null;
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

function parseAmount(text: string, fieldName: string) {
  try {
    return formatAmount(text);
  } catch {
    throw new Error(`${fieldName} 必须是合法的正数金额。`);
  }
}

function parseUrlOrNull(text: string, fieldName: string) {
  const raw = text.trim();

  if (!raw) {
    return null;
  }

  const hasProtocol = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw);
  const looksLikeHostWithoutProtocol =
    /^(localhost|(?:\d{1,3}\.){3}\d{1,3}|[a-z0-9-]+(?:\.[a-z0-9-]+)+)(:\d+)?(\/.*)?$/i.test(
      raw,
    );
  const normalized = hasProtocol
    ? raw
    : looksLikeHostWithoutProtocol
      ? /^(localhost|(?:\d{1,3}\.){3}\d{1,3})(:\d+)?(\/.*)?$/i.test(raw)
        ? `http://${raw}`
        : `https://${raw}`
      : raw;

  try {
    const url = new URL(normalized);

    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new Error("Unsupported protocol");
    }

    return url.toString();
  } catch {
    throw new Error(`${fieldName} 必须是合法 URL。`);
  }
}

function normalizeMerchantCode(code: string) {
  const normalized = code.trim().toLowerCase();

  if (!/^[a-z0-9][a-z0-9._-]{2,48}$/.test(normalized)) {
    throw new Error(
      "商户编码需为 3-49 位，并且只能包含小写字母、数字、点、下划线和中划线。",
    );
  }

  return normalized;
}

function normalizeMerchantLoginAccount(account: string) {
  const normalized = account.trim().toLowerCase();

  if (!/^[a-z0-9][a-z0-9._@-]{3,63}$/.test(normalized)) {
    throw new Error(
      "登录账号需为 4-64 位，并且只能包含小写字母、数字、点、@、下划线和中划线。",
    );
  }

  return normalized;
}

function generateMerchantCodeCandidate() {
  return `mch_${randomBytes(5).toString("hex")}`;
}

function generateMerchantRefundExternalId() {
  const timestamp = new Date()
    .toISOString()
    .replace(/\D/g, "")
    .slice(0, 14);
  const suffix = randomBytes(3).toString("hex").toUpperCase();
  return `RFD${timestamp}${suffix}`;
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

function revalidateMerchantPaths() {
  revalidatePath("/merchant");
  revalidatePath("/merchant/integration");
  revalidatePath("/merchant/profile");
  revalidatePath("/merchant/credentials");
  revalidatePath("/merchant/channels");
  revalidatePath("/merchant/orders");
  revalidatePath("/merchant/refunds");
  revalidatePath("/admin");
  revalidatePath("/admin/bindings");
  revalidatePath("/admin/merchants");
  revalidatePath("/admin/merchants/[id]", "page");
  revalidatePath("/admin/orders");
  revalidatePath("/admin/finance");
}

function getMerchantAuditActor(session: Awaited<ReturnType<typeof requireMerchantSession>>) {
  return `${session.merchantUser.email} (${session.merchantUser.role})`;
}

type MerchantApiCredentialWriter = Pick<ReturnType<typeof getPrismaClient>, "merchantApiCredential">;

async function createMerchantApiCredentialRecord(
  prisma: MerchantApiCredentialWriter,
  input: {
    merchantId: string;
    label: string;
    expiresAt?: Date | null;
  },
) {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const generated = generateMerchantApiCredential();

    try {
      const credential = await prisma.merchantApiCredential.create({
        data: {
          merchantId: input.merchantId,
          label: input.label,
          keyId: generated.keyId,
          secretCiphertext: generated.secretCiphertext,
          secretPreview: generated.secretPreview,
          enabled: true,
          expiresAt: input.expiresAt ?? null,
        },
      });

      return { credential, generated };
    } catch (error) {
      if (isPrismaUniqueConstraintError(error, "keyId")) {
        continue;
      }

      throw error;
    }
  }

  throw new Error("系统生成 API 凭证失败，请稍后重试。");
}

function getMerchantChannelTemplateOrThrow(channelCode: string) {
  const template = getMerchantChannelTemplate(channelCode);

  if (!template) {
    throw new Error("暂不支持该支付通道。");
  }

  return template;
}

function readMerchantChannelConfig(channelCode: string, formData: FormData) {
  const template = getMerchantChannelTemplateOrThrow(channelCode);
  const config: Record<string, string> = {};

  for (const field of template.fields) {
    const value = getString(formData, `config_${field.key}`);

    if (field.required && !value) {
      throw new Error(`${field.label} 不能为空。`);
    }

    config[field.key] = value;
  }

  return {
    template,
    config,
  };
}

async function maybeSetMerchantChannelBindingDefault(input: {
  merchantId: string;
  channelCode: string;
  merchantChannelAccountId: string;
  shouldSetDefault: boolean;
  bindingEnabled: boolean;
}) {
  const prisma = getPrismaClient();
  const existingBinding = await prisma.merchantChannelBinding.findUnique({
    where: {
      merchantId_channelCode: {
        merchantId: input.merchantId,
        channelCode: input.channelCode,
      },
    },
    select: {
      id: true,
    },
  });

  if (!input.shouldSetDefault && existingBinding) {
    return null;
  }

  return prisma.merchantChannelBinding.upsert({
    where: {
      merchantId_channelCode: {
        merchantId: input.merchantId,
        channelCode: input.channelCode,
      },
    },
    update: {
      enabled: input.bindingEnabled,
      merchantChannelAccountId: input.merchantChannelAccountId,
      providerAccountId: null,
    },
    create: {
      merchantId: input.merchantId,
      channelCode: input.channelCode,
      enabled: input.bindingEnabled,
      merchantChannelAccountId: input.merchantChannelAccountId,
      providerAccountId: null,
    },
  });
}

async function maybeAutoEnableMerchantChannelDraftsAfterProfileCompletion(input: {
  merchantId: string;
}) {
  const prisma = getPrismaClient();
  const draftAccounts = await prisma.merchantChannelAccount.findMany({
    where: {
      merchantId: input.merchantId,
      enabled: false,
      bindings: {
        some: {},
      },
    },
    select: {
      id: true,
      channelCode: true,
      displayName: true,
    },
  });

  const regulatedDraftAccounts = draftAccounts.filter((account) =>
    channelRequiresMerchantProfile(account.channelCode),
  );

  if (regulatedDraftAccounts.length === 0) {
    return [];
  }

  const regulatedDraftIds = regulatedDraftAccounts.map((account) => account.id);

  await prisma.$transaction([
    prisma.merchantChannelAccount.updateMany({
      where: {
        id: {
          in: regulatedDraftIds,
        },
      },
      data: {
        enabled: true,
      },
    }),
    prisma.merchantChannelBinding.updateMany({
      where: {
        merchantId: input.merchantId,
        merchantChannelAccountId: {
          in: regulatedDraftIds,
        },
      },
      data: {
        enabled: true,
      },
    }),
  ]);

  return regulatedDraftAccounts;
}

export async function registerMerchantAction(formData: FormData) {
  if (await hasMerchantSession()) {
    redirect("/merchant");
  }

  let successRedirect: string | null = null;

  try {
    const prisma = getPrismaClient();
    const account = normalizeMerchantLoginAccount(
      getRequiredString(formData, "account", "登录账号"),
    );
    const password = getRequiredString(formData, "password", "登录密码");
    const confirmPassword = getRequiredString(formData, "confirmPassword", "确认密码");

    if (password.length < 8) {
      throw new Error("登录密码至少需要 8 位。");
    }

    if (password !== confirmPassword) {
      throw new Error("两次输入的密码不一致。");
    }

    const existingUser = await prisma.merchantUser.findUnique({
      where: {
        email: account,
      },
      select: {
        id: true,
      },
    });

    if (existingUser) {
      throw new Error("该账号已经注册过商户账号，请直接登录。");
    }

    let result:
      | {
          merchant: { id: string; code: string };
          merchantUser: { id: string };
          bootstrapCredential: { keyId: string; secret: string; label: string };
        }
      | null = null;

    for (let attempt = 0; attempt < 8; attempt += 1) {
      const merchantCode = normalizeMerchantCode(generateMerchantCodeCandidate());
      const merchantName = createPendingMerchantName(merchantCode);

      try {
        result = await prisma.$transaction(async (tx) => {
          const now = new Date();
          const merchant = await tx.merchant.create({
            data: {
              name: merchantName,
              code: merchantCode,
              status: "APPROVED",
              legalName: null,
              contactName: null,
              contactEmail: null,
              contactPhone: null,
              website: null,
              companyRegistrationId: null,
              onboardingNote: null,
              approvedAt: now,
              approvedBy: "self-service",
              statusChangedAt: now,
              callbackEnabled: true,
            },
            select: {
              id: true,
              code: true,
            },
          });

          const merchantUser = await tx.merchantUser.create({
            data: {
              merchantId: merchant.id,
              email: account,
              name: account,
              passwordHash: await hashPassword(password),
              role: "OWNER",
              enabled: true,
            },
            select: {
              id: true,
            },
          });

          const bootstrapCredential = await createMerchantApiCredentialRecord(tx, {
            merchantId: merchant.id,
            label: "Default API Credential",
          });

          return {
            merchant,
            merchantUser,
            bootstrapCredential: {
              keyId: bootstrapCredential.generated.keyId,
              secret: bootstrapCredential.generated.secret,
              label: bootstrapCredential.credential.label,
            },
          };
        });

        break;
      } catch (error) {
        if (isPrismaUniqueConstraintError(error, "email")) {
          throw new Error("该账号已经注册过商户账号，请直接登录。");
        }

        if (isPrismaUniqueConstraintError(error, "code")) {
          continue;
        }

        throw error;
      }
    }

    if (!result) {
      throw new Error("系统分配商户号失败，请稍后重试。");
    }

    await writeAdminAuditLog({
      actor: `${account} (OWNER)`,
      action: "merchant.self_register",
      resourceType: "merchant",
      resourceId: result.merchant.id,
      summary: `商户 ${result.merchant.code} 通过自助门户开通基础接入并自动生成首个 API 凭证。`,
      metadata: {
        merchantCode: result.merchant.code,
        account,
        profileCompleted: false,
        merchantStatus: "APPROVED",
        bootstrapCredentialKeyId: result.bootstrapCredential.keyId,
      },
    });

    await createMerchantSession(result.merchantUser.id);
    await stashMerchantCredentialReveal({
      keyId: result.bootstrapCredential.keyId,
      secret: result.bootstrapCredential.secret,
      label: result.bootstrapCredential.label,
      source: "bootstrap",
    });
    revalidateMerchantPaths();
    successRedirect = withMessage(
      "/merchant",
      "success",
      "账号注册完成，基础接入已开通，系统已自动生成首个 API 凭证。",
    );
  } catch (error) {
    redirectWithError("/merchant/register", error);
  }

  redirect(successRedirect ?? "/merchant");
}

export async function loginMerchantAction(formData: FormData) {
  const account = getString(formData, "account").toLowerCase();
  const password = getString(formData, "password");

  if (!account || !password) {
    redirect(withMessage("/merchant/login", "error", "账号和密码不能为空。"));
  }

  const user = await authenticateMerchantUser(account, password);

  if (!user) {
    redirect(withMessage("/merchant/login", "error", "账号或密码不正确，或账号已停用。"));
  }

  await createMerchantSession(user.id);
  await writeAdminAuditLog({
    actor: `${user.email} (${user.role})`,
    action: "merchant_user.login",
    resourceType: "merchant_user",
    resourceId: user.id,
    summary: `商户用户 ${user.email} 登录商户控制台。`,
    metadata: {
      merchantId: user.merchantId,
      merchantCode: user.merchant.code,
    },
  });
  redirect("/merchant");
}

export async function logoutMerchantAction() {
  const session = await requireMerchantSession();

  await writeAdminAuditLog({
    actor: getMerchantAuditActor(session),
    action: "merchant_user.logout",
    resourceType: "merchant_user",
    resourceId: session.merchantUser.id,
    summary: `商户用户 ${session.merchantUser.email} 退出商户控制台。`,
    metadata: {
      merchantId: session.merchantUser.merchantId,
      merchantCode: session.merchantUser.merchant.code,
    },
  });

  await clearMerchantSession();
  redirect("/merchant/login");
}

export async function updateMerchantProfileAction(formData: FormData) {
  const session = await requireMerchantPermission("profile:write");
  const redirectTo = getRedirectTo(formData, "/merchant");
  let autoEnabledDraftAccounts: Array<{
    id: string;
    channelCode: string;
    displayName: string;
  }> = [];

  try {
    const prisma = getPrismaClient();
    const existing = await prisma.merchant.findUnique({
      where: {
        id: session.merchantUser.merchantId,
      },
      select: {
        id: true,
        notifySecret: true,
      },
    });

    if (!existing) {
      throw new Error("商户不存在。");
    }

    const merchant = await prisma.merchant.update({
      where: {
        id: session.merchantUser.merchantId,
      },
      data: {
        name: getRequiredString(formData, "merchantName", "商户名称"),
        legalName: getOptionalString(formData, "legalName"),
        contactName: getOptionalString(formData, "contactName"),
        contactEmail: getOptionalString(formData, "contactEmail"),
        contactPhone: getOptionalString(formData, "contactPhone"),
        companyRegistrationId: getOptionalString(formData, "companyRegistrationId"),
        onboardingNote: getOptionalString(formData, "onboardingNote"),
        callbackBase: parseUrlOrNull(getString(formData, "callbackBase"), "默认业务回调地址"),
        notifySecret: resolveNotifySecretForStorage({
          submittedValue: getString(formData, "notifySecret"),
          currentValue: existing.notifySecret,
          preserveBlank: getString(formData, "notifySecretStrategy") === "preserve_if_blank",
        }),
        apiIpWhitelist: getOptionalString(formData, "apiIpWhitelist"),
        callbackEnabled: getBoolean(formData, "callbackEnabled"),
      },
    });
    const profileComplete = isMerchantProfileComplete(merchant);

    if (profileComplete) {
      autoEnabledDraftAccounts = await maybeAutoEnableMerchantChannelDraftsAfterProfileCompletion({
        merchantId: merchant.id,
      });
    }

    await writeAdminAuditLog({
      actor: getMerchantAuditActor(session),
      action: "merchant.self_service.update_profile",
      resourceType: "merchant",
      resourceId: merchant.id,
      summary: `商户 ${merchant.code} 更新了自助配置。`,
      metadata: {
        status: merchant.status,
        callbackEnabled: merchant.callbackEnabled,
        callbackBase: merchant.callbackBase,
        apiIpWhitelist: merchant.apiIpWhitelist,
        autoEnabledDraftChannels: autoEnabledDraftAccounts.map((account) => ({
          id: account.id,
          channelCode: account.channelCode,
          displayName: account.displayName,
        })),
      },
    });
    revalidateMerchantPaths();
  } catch (error) {
    redirectWithError(redirectTo, error);
  }

  redirect(
    withMessage(
      redirectTo,
      "success",
      autoEnabledDraftAccounts.length > 0
        ? `商户配置已保存，并已自动启用 ${autoEnabledDraftAccounts.length} 个待激活的支付通道实例。`
        : "商户配置已保存。",
    ),
  );
}

export async function createMerchantSelfServiceApiCredentialAction(formData: FormData) {
  const session = await requireMerchantPermission("credential:write");
  const redirectTo = getRedirectTo(formData, "/merchant");
  let successRedirect: string | null = null;

  try {
    const merchant = await getPrismaClient().merchant.findUnique({
      where: {
        id: session.merchantUser.merchantId,
      },
      select: {
        id: true,
      },
    });

    if (!merchant) {
      throw new Error("商户不存在。");
    }

    const label = getRequiredString(formData, "label", "凭证标签");
    const expiresAt = parseDateOrNull(getString(formData, "expiresAt"), "凭证过期时间");
    const { credential, generated } = await createMerchantApiCredentialRecord(getPrismaClient(), {
      merchantId: session.merchantUser.merchantId,
      label,
      expiresAt,
    });

    await writeAdminAuditLog({
      actor: getMerchantAuditActor(session),
      action: "merchant.self_service.create_credential",
      resourceType: "merchant_api_credential",
      resourceId: credential.id,
      summary: `商户 ${session.merchantUser.merchant.code} 新建 API 凭证 ${label}。`,
      metadata: {
        keyId: credential.keyId,
        expiresAt: credential.expiresAt?.toISOString() ?? null,
      },
    });
    await stashMerchantCredentialReveal({
      credentialId: credential.id,
      keyId: generated.keyId,
      secret: generated.secret,
      label: credential.label,
      source: "manual",
    });
    revalidateMerchantPaths();

    successRedirect = withMessage(
      redirectTo,
      "success",
      "API 凭证已创建，请立即保存本次展示的 Secret。",
    );
  } catch (error) {
    redirectWithError(redirectTo, error);
  }

  redirect(successRedirect ?? redirectTo);
}

export async function dismissMerchantCredentialRevealAction(formData: FormData) {
  await requireMerchantSession();
  const redirectTo = getRedirectTo(formData, "/merchant");
  await clearMerchantCredentialReveal();
  redirect(redirectTo);
}

export async function revealMerchantApiCredentialSecretAction(formData: FormData) {
  const session = await requireMerchantPermission("credential:write");
  const redirectTo = getRedirectTo(formData, "/merchant/credentials");

  try {
    const password = getRequiredString(formData, "currentPassword", "当前登录密码");
    const credentialId = getRequiredString(formData, "credentialId", "凭证 ID");
    const confirmedUser = await authenticateMerchantUser(
      session.merchantUser.email,
      password,
    );

    if (!confirmedUser || confirmedUser.id !== session.merchantUser.id) {
      throw new Error("当前登录密码验证失败，请重新输入。");
    }

    const credential = await getPrismaClient().merchantApiCredential.findUnique({
      where: {
        id: credentialId,
      },
      select: {
        id: true,
        merchantId: true,
        keyId: true,
        label: true,
        secretCiphertext: true,
      },
    });

    if (!credential || credential.merchantId !== session.merchantUser.merchantId) {
      throw new Error("指定的 API 凭证不存在。");
    }

    await stashMerchantCredentialReveal({
      credentialId: credential.id,
      keyId: credential.keyId,
      secret: revealMerchantCredentialSecret(credential.secretCiphertext),
      label: credential.label,
      source: "reauth",
    });

    await writeAdminAuditLog({
      actor: getMerchantAuditActor(session),
      action: "merchant.self_service.reveal_credential_secret",
      resourceType: "merchant_api_credential",
      resourceId: credential.id,
      summary: `商户 ${session.merchantUser.merchant.code} 通过验密显示 API 凭证 ${credential.label} 的完整 Secret。`,
      metadata: {
        keyId: credential.keyId,
      },
    });
  } catch (error) {
    redirectWithError(redirectTo, error);
  }

  redirect(withMessage(redirectTo, "success", "已完成密码验证，完整 API Secret 已显示。"));
}

export async function runMerchantCheckoutSmokeTestAction(formData: FormData) {
  const session = await requireMerchantSession();
  let checkoutRedirect: string | null = null;

  try {
    const prisma = getPrismaClient();
    const requestedChannelCode = getOptionalString(formData, "channelCode");
    const merchant = await prisma.merchant.findUnique({
      where: {
        id: session.merchantUser.merchantId,
      },
      select: {
        id: true,
        code: true,
        apiCredentials: {
          where: {
            enabled: true,
          },
          orderBy: [{ lastUsedAt: "desc" }, { createdAt: "desc" }],
          select: {
            id: true,
            expiresAt: true,
          },
        },
        channelBindings: {
          where: {
            enabled: true,
          },
          orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
          select: {
            channelCode: true,
            merchantChannelAccountId: true,
            merchantChannelAccount: {
              select: {
                enabled: true,
              },
            },
          },
        },
        channelAccounts: {
          where: {
            enabled: true,
          },
          orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
          select: {
            channelCode: true,
          },
        },
      },
    });

    if (!merchant) {
      throw new Error("商户不存在。");
    }

    const preferredChannelCodes = ["alipay.page", "wxpay.native"] as const;
    const availableChannelCodes = preferredChannelCodes.filter((candidate) => {
      const hasUsableBinding = merchant.channelBindings.some(
        (binding) =>
          binding.channelCode === candidate &&
          (!binding.merchantChannelAccountId || binding.merchantChannelAccount?.enabled),
      );

      if (hasUsableBinding) {
        return true;
      }

      return merchant.channelAccounts.some((account) => account.channelCode === candidate);
    });

    const isRequestedChannelSupported =
      requestedChannelCode &&
      preferredChannelCodes.includes(requestedChannelCode as (typeof preferredChannelCodes)[number]);
    const channelCode = isRequestedChannelSupported
      ? availableChannelCodes.find((candidate) => candidate === requestedChannelCode) ?? null
      : availableChannelCodes[0] ?? null;

    if (!channelCode) {
      if (requestedChannelCode) {
        throw new Error("所选支付通道当前不可用于测试。请先完成该通道实例配置并启用。");
      }

      throw new Error("当前没有可用于支付测试的已启用通道。请先在支付通道页完成至少一个官方通道实例配置并启用。");
    }

    const activeCredential = merchant.apiCredentials.find(
      (credential) => !credential.expiresAt || credential.expiresAt > new Date(),
    );

    const result = await createPaymentOrder({
      merchantCode: merchant.code,
      channelCode,
      externalOrderId: `SMOKE-${Date.now()}`,
      apiCredentialId: activeCredential?.id ?? null,
      amount: "0.01",
      currency: "CNY",
      subject: "NovaPay 支付测试",
      description: "商户后台一键发起的最终支付测试订单",
      clientIp: "127.0.0.1",
      metadata: {
        source: "merchant_checkout_smoke_test",
      },
    });

    await writeAdminAuditLog({
      actor: getMerchantAuditActor(session),
      action: "merchant.self_service.test_checkout",
      resourceType: "payment_order",
      resourceId: result.order.id,
      summary: `商户 ${merchant.code} 发起一笔最终支付测试订单。`,
      metadata: {
        channelCode,
        externalOrderId: result.order.externalOrderId,
        amount: "0.01",
      },
    });
    revalidateMerchantPaths();
    checkoutRedirect = `/pay/${result.order.id}`;
  } catch (error) {
    redirectWithError("/merchant", error);
  }

  redirect(checkoutRedirect ?? "/merchant");
}

export async function updateMerchantSelfServiceApiCredentialAction(formData: FormData) {
  const session = await requireMerchantPermission("credential:write");
  const redirectTo = getRedirectTo(formData, "/merchant");

  try {
    const prisma = getPrismaClient();
    const id = getRequiredString(formData, "id", "凭证 ID");
    const existing = await prisma.merchantApiCredential.findUnique({
      where: {
        id,
      },
      select: {
        id: true,
        merchantId: true,
        label: true,
        keyId: true,
      },
    });

    if (!existing || existing.merchantId !== session.merchantUser.merchantId) {
      throw new Error("指定的 API 凭证不存在。");
    }

    const credential = await prisma.merchantApiCredential.update({
      where: {
        id,
      },
      data: {
        enabled: getBoolean(formData, "enabled"),
        expiresAt: parseDateOrNull(getString(formData, "expiresAt"), "凭证过期时间"),
      },
    });

    await writeAdminAuditLog({
      actor: getMerchantAuditActor(session),
      action: "merchant.self_service.update_credential",
      resourceType: "merchant_api_credential",
      resourceId: credential.id,
      summary: `商户 ${session.merchantUser.merchant.code} 更新 API 凭证 ${existing.label}。`,
      metadata: {
        keyId: existing.keyId,
        enabled: credential.enabled,
        expiresAt: credential.expiresAt?.toISOString() ?? null,
      },
    });
    revalidateMerchantPaths();
  } catch (error) {
    redirectWithError(redirectTo, error);
  }

  redirect(withMessage(redirectTo, "success", "商户 API 凭证已更新。"));
}

export async function createMerchantChannelAccountAction(formData: FormData) {
  const session = await requireMerchantPermission("channel:write");
  const redirectTo = getRedirectTo(formData, "/merchant/channels");

  try {
    const channelCode = getRequiredString(formData, "channelCode", "支付通道");
    const shouldEnable = getBoolean(formData, "enabled");
    const prisma = getPrismaClient();
    const merchant = await prisma.merchant.findUnique({
      where: {
        id: session.merchantUser.merchantId,
      },
      select: {
        name: true,
        legalName: true,
        contactName: true,
        contactPhone: true,
        companyRegistrationId: true,
      },
    });

    if (!merchant) {
      throw new Error("商户不存在。");
    }

    if (shouldEnable) {
      assertMerchantProfileCompleteForChannel(merchant, channelCode, {
        prefix: "请先完善以下商户资料后再启用该支付通道：",
      });
    }

    const displayName = getRequiredString(formData, "displayName", "通道名称");
    const { template, config } = readMerchantChannelConfig(channelCode, formData);

    const account = await prisma.merchantChannelAccount.create({
      data: {
        merchantId: session.merchantUser.merchantId,
        providerKey: template.providerKey,
        channelCode: template.channelCode,
        displayName,
        config: protectProviderConfigForStorage(config) as Prisma.InputJsonValue,
        callbackToken: generateMerchantChannelCallbackToken(),
        enabled: shouldEnable,
        remark: getOptionalString(formData, "remark"),
      },
    });

    await maybeSetMerchantChannelBindingDefault({
      merchantId: session.merchantUser.merchantId,
      channelCode: template.channelCode,
      merchantChannelAccountId: account.id,
      shouldSetDefault: getBoolean(formData, "setAsDefault"),
      bindingEnabled: shouldEnable,
    });

    await writeAdminAuditLog({
      actor: getMerchantAuditActor(session),
      action: "merchant.channel_account.create",
      resourceType: "merchant_channel_account",
      resourceId: account.id,
      summary: `商户 ${session.merchantUser.merchant.code} 新建 ${template.channelCode} 通道实例 ${displayName}。`,
      metadata: {
        channelCode: template.channelCode,
        providerKey: template.providerKey,
        callbackToken: account.callbackToken,
      },
    });
    revalidateMerchantPaths();
  } catch (error) {
    redirectWithError(redirectTo, error);
  }

  redirect(withMessage(redirectTo, "success", "支付通道实例已创建。"));
}

export async function updateMerchantChannelAccountAction(formData: FormData) {
  const session = await requireMerchantPermission("channel:write");
  const redirectTo = getRedirectTo(formData, "/merchant/channels");

  try {
    const prisma = getPrismaClient();
    const requestedEnabled = getBoolean(formData, "enabled");
    const merchant = await prisma.merchant.findUnique({
      where: {
        id: session.merchantUser.merchantId,
      },
      select: {
        name: true,
        legalName: true,
        contactName: true,
        contactPhone: true,
        companyRegistrationId: true,
      },
    });

    if (!merchant) {
      throw new Error("商户不存在。");
    }

    const id = getRequiredString(formData, "id", "通道实例 ID");
    const existing = await prisma.merchantChannelAccount.findUnique({
      where: {
        id,
      },
      select: {
        id: true,
        merchantId: true,
        channelCode: true,
        displayName: true,
        config: true,
        callbackToken: true,
        enabled: true,
      },
    });

    if (!existing || existing.merchantId !== session.merchantUser.merchantId) {
      throw new Error("指定的支付通道实例不存在。");
    }

    if (requestedEnabled && !existing.enabled) {
      assertMerchantProfileCompleteForChannel(merchant, existing.channelCode, {
        prefix: "请先完善以下商户资料后再启用该支付通道：",
      });
    }

    const { template, config } = readMerchantChannelConfig(existing.channelCode, formData);

    const account = await prisma.merchantChannelAccount.update({
      where: {
        id,
      },
      data: {
        displayName: getRequiredString(formData, "displayName", "通道名称"),
        config: protectProviderConfigForStorage(
          config,
          existing.config,
        ) as Prisma.InputJsonValue,
        enabled: requestedEnabled,
        remark: getOptionalString(formData, "remark"),
      },
    });

    await maybeSetMerchantChannelBindingDefault({
      merchantId: session.merchantUser.merchantId,
      channelCode: template.channelCode,
      merchantChannelAccountId: account.id,
      shouldSetDefault: getBoolean(formData, "setAsDefault"),
      bindingEnabled: requestedEnabled,
    });

    await writeAdminAuditLog({
      actor: getMerchantAuditActor(session),
      action: "merchant.channel_account.update",
      resourceType: "merchant_channel_account",
      resourceId: account.id,
      summary: `商户 ${session.merchantUser.merchant.code} 更新 ${template.channelCode} 通道实例 ${account.displayName}。`,
      metadata: {
        channelCode: template.channelCode,
        callbackToken: existing.callbackToken,
        enabled: account.enabled,
      },
    });
    revalidateMerchantPaths();
  } catch (error) {
    redirectWithError(redirectTo, error);
  }

  redirect(withMessage(redirectTo, "success", "支付通道实例已更新。"));
}

export async function syncMerchantOrderAction(formData: FormData) {
  const session = await requireMerchantPermission("order:read");
  const redirectTo = getRedirectTo(formData, "/merchant/orders");

  try {
    const orderReference = getRequiredString(formData, "orderReference", "订单标识");
    const order = await getMerchantPaymentOrder({
      merchantCode: session.merchantUser.merchant.code,
      orderReference,
      syncWithProvider: true,
    });

    await writeAdminAuditLog({
      actor: getMerchantAuditActor(session),
      action: "merchant.self_service.sync_order",
      resourceType: "payment_order",
      resourceId: order.id,
      summary: `商户 ${session.merchantUser.merchant.code} 主动同步订单 ${order.externalOrderId}。`,
      metadata: {
        orderId: order.id,
        externalOrderId: order.externalOrderId,
        status: order.status,
        providerStatus: order.providerStatus,
      },
    });
    revalidateMerchantPaths();
  } catch (error) {
    redirectWithError(redirectTo, error);
  }

  redirect(withMessage(redirectTo, "success", "订单状态已同步。"));
}

export async function closeMerchantOrderAction(formData: FormData) {
  const session = await requireMerchantPermission("order:write");
  const redirectTo = getRedirectTo(formData, "/merchant/orders");

  try {
    const orderReference = getRequiredString(formData, "orderReference", "订单标识");
    const order = await closeMerchantPaymentOrder({
      merchantCode: session.merchantUser.merchant.code,
      orderReference,
    });

    await writeAdminAuditLog({
      actor: getMerchantAuditActor(session),
      action: "merchant.self_service.close_order",
      resourceType: "payment_order",
      resourceId: order.id,
      summary: `商户 ${session.merchantUser.merchant.code} 关闭订单 ${order.externalOrderId}。`,
      metadata: {
        orderId: order.id,
        externalOrderId: order.externalOrderId,
        status: order.status,
      },
    });
    revalidateMerchantPaths();
  } catch (error) {
    redirectWithError(redirectTo, error);
  }

  redirect(withMessage(redirectTo, "success", "订单已关闭。"));
}

export async function createMerchantRefundAction(formData: FormData) {
  const session = await requireMerchantPermission("refund:write");
  const redirectTo = getRedirectTo(formData, "/merchant/refunds");
  let successRedirect = withMessage(redirectTo, "success", "退款请求已提交。");

  try {
    const orderReference = getRequiredString(formData, "orderReference", "订单标识");
    const externalRefundId = getOptionalString(formData, "externalRefundId") ?? generateMerchantRefundExternalId();
    const amount = parseAmount(getRequiredString(formData, "amount", "退款金额"), "退款金额");
    const result = await createMerchantPaymentRefund({
      merchantCode: session.merchantUser.merchant.code,
      orderReference,
      externalRefundId,
      amount,
      reason: getOptionalString(formData, "reason"),
    });

    await writeAdminAuditLog({
      actor: getMerchantAuditActor(session),
      action: "merchant.self_service.create_refund",
      resourceType: "payment_refund",
      resourceId: result.refund.id,
      summary: `商户 ${session.merchantUser.merchant.code} 发起退款 ${result.refund.externalRefundId}。`,
      metadata: {
        orderId: result.order.id,
        paymentOrderId: result.refund.paymentOrderId,
        externalOrderId: result.order.externalOrderId,
        externalRefundId: result.refund.externalRefundId,
        amount: result.refund.amount.toString(),
        status: result.refund.status,
      },
    });
    revalidateMerchantPaths();
    successRedirect = withMessage(
      redirectTo,
      "success",
      `退款请求已提交，系统退款单号：${result.refund.externalRefundId}。`,
    );
  } catch (error) {
    redirectWithError(redirectTo, error);
  }

  redirect(successRedirect);
}

export async function syncMerchantRefundAction(formData: FormData) {
  const session = await requireMerchantPermission("refund:read");
  const redirectTo = getRedirectTo(formData, "/merchant/refunds");

  try {
    const refundReference = getRequiredString(formData, "refundReference", "退款标识");
    const refund = await getMerchantPaymentRefund({
      merchantCode: session.merchantUser.merchant.code,
      refundReference,
      syncWithProvider: true,
    });

    await writeAdminAuditLog({
      actor: getMerchantAuditActor(session),
      action: "merchant.self_service.sync_refund",
      resourceType: "payment_refund",
      resourceId: refund.id,
      summary: `商户 ${session.merchantUser.merchant.code} 主动同步退款 ${refund.externalRefundId}。`,
      metadata: {
        refundId: refund.id,
        externalRefundId: refund.externalRefundId,
        status: refund.status,
        providerStatus: refund.providerStatus,
      },
    });
    revalidateMerchantPaths();
  } catch (error) {
    redirectWithError(redirectTo, error);
  }

  redirect(withMessage(redirectTo, "success", "退款状态已同步。"));
}
