import { randomBytes } from "node:crypto";
import { AdminRole, MerchantStatus } from "@/generated/prisma/enums";
import { syncBuiltinMarketplacePlugins } from "@/lib/plugins/marketplace";
import { getPrismaClient } from "@/lib/prisma";
import { protectProviderConfigForStorage } from "@/lib/provider-account-config";
import { revealStoredSecret, sealStoredSecret } from "@/lib/secret-box";
import { hashPassword } from "@/lib/password";
import { generateMerchantApiCredential } from "@/lib/merchant-credentials";
import { generateMerchantChannelCallbackToken } from "@/lib/merchant-channel-accounts";

export const PLATFORM_OFFICIAL_MERCHANT_CODE = "merchant-platform-official";
export const PLATFORM_BRIDGE_CREDENTIAL_LABEL = "Registry Bridge API";
export const PLATFORM_ALIPAY_ACCOUNT_NAME = "Platform Official Alipay";
export const PLATFORM_WXPAY_ACCOUNT_NAME = "Platform Official WeChat Pay";

export interface PlatformBootstrapStatus {
  environment: {
    databaseUrlConfigured: boolean;
    publicBaseUrlConfigured: boolean;
    registryAppUrlConfigured: boolean;
  };
  adminConfigured: boolean;
  bridgeMerchantReady: boolean;
  alipayConfigured: boolean;
  wxpayConfigured: boolean;
  setupComplete: boolean;
}

export interface PlatformBootstrapInput {
  adminEmail: string;
  adminPassword: string;
  adminName: string;
  enableAlipay: boolean;
  enableWxpay: boolean;
  alipay?: {
    appId: string;
    privateKey: string;
    publicKey: string;
  } | null;
  wxpay?: {
    appId: string;
    mchId: string;
    mchSerialNo: string;
    privateKey: string;
    apiV3Key: string;
    platformPublicKey: string;
    platformSerial?: string;
  } | null;
}

export interface PlatformBootstrapResult {
  merchantCode: string;
  registryBridge: {
    merchantCode: string;
    apiKeyId: string;
    apiKeySecret: string;
    notifySecret: string;
    channelCode: string;
  };
}

export interface RegistryBridgeProvisionResult {
  merchantCode: string;
  apiKeyId: string;
  apiKeySecret: string;
  notifySecret: string;
  channelCode: string;
}

function hasText(value: string | null | undefined) {
  return Boolean(value?.trim());
}

function requireText(value: string, label: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(`${label} is required.`);
  }
  return trimmed;
}

function normalizeEmail(value: string) {
  const email = value.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("Admin email must be a valid email address.");
  }
  return email;
}

function validatePassword(value: string) {
  if (value.trim().length < 8) {
    throw new Error("Admin password must be at least 8 characters.");
  }
  return value.trim();
}

function requireAtLeastOneEnabled(input: PlatformBootstrapInput) {
  if (!input.enableAlipay && !input.enableWxpay) {
    throw new Error("At least one payment channel must be configured.");
  }
}

async function findOfficialMerchant() {
  const prisma = getPrismaClient();
  return prisma.merchant.findUnique({
    where: {
      code: PLATFORM_OFFICIAL_MERCHANT_CODE,
    },
    include: {
      channelAccounts: true,
      apiCredentials: true,
    },
  });
}

export async function getPlatformBootstrapStatus(): Promise<PlatformBootstrapStatus> {
  const prisma = getPrismaClient();
  const [adminCount, merchant] = await Promise.all([
    prisma.adminUser.count(),
    findOfficialMerchant(),
  ]);

  const alipayConfigured = Boolean(
    merchant?.channelAccounts.some(
      (account) => account.channelCode === "alipay.page" && account.enabled,
    ),
  );
  const wxpayConfigured = Boolean(
    merchant?.channelAccounts.some(
      (account) => account.channelCode === "wxpay.native" && account.enabled,
    ),
  );
  const bridgeMerchantReady =
    Boolean(merchant) &&
    merchant?.status === MerchantStatus.APPROVED &&
    hasText(merchant.name) &&
    hasText(merchant.legalName) &&
    hasText(merchant.contactName) &&
    hasText(merchant.contactPhone) &&
    hasText(merchant.companyRegistrationId) &&
    hasText(merchant.notifySecret);

  return {
    environment: {
      databaseUrlConfigured: hasText(process.env.DATABASE_URL),
      publicBaseUrlConfigured: hasText(process.env.NOVAPAY_PUBLIC_BASE_URL),
      registryAppUrlConfigured: hasText(process.env.REGISTRY_APP_URL),
    },
    adminConfigured: adminCount > 0,
    bridgeMerchantReady,
    alipayConfigured,
    wxpayConfigured,
    setupComplete:
      adminCount > 0 &&
      bridgeMerchantReady &&
      (alipayConfigured || wxpayConfigured),
  };
}

function createRegistryNotifySecret() {
  return `registry_notify_${randomBytes(18).toString("base64url")}`;
}

function buildAlipayConfig(
  input: NonNullable<PlatformBootstrapInput["alipay"]>,
) {
  return protectProviderConfigForStorage({
    appId: input.appId.trim(),
    privateKey: input.privateKey.trim(),
    publicKey: input.publicKey.trim(),
  });
}

function buildWxpayConfig(
  input: NonNullable<PlatformBootstrapInput["wxpay"]>,
) {
  return protectProviderConfigForStorage({
    appId: input.appId.trim(),
    mchId: input.mchId.trim(),
    mchSerialNo: input.mchSerialNo.trim(),
    privateKey: input.privateKey.trim(),
    apiV3Key: input.apiV3Key.trim(),
    platformPublicKey: input.platformPublicKey.trim(),
    platformSerial: input.platformSerial?.trim() || "",
  });
}

async function ensureAdminUser(input: PlatformBootstrapInput) {
  const prisma = getPrismaClient();
  const passwordHash = await hashPassword(validatePassword(input.adminPassword));
  const email = normalizeEmail(input.adminEmail);

  return prisma.adminUser.upsert({
    where: {
      email,
    },
    update: {
      name: requireText(input.adminName, "Admin name"),
      passwordHash,
      role: AdminRole.SUPER_ADMIN,
      enabled: true,
    },
    create: {
      email,
      name: requireText(input.adminName, "Admin name"),
      passwordHash,
      role: AdminRole.SUPER_ADMIN,
      enabled: true,
    },
  });
}

async function ensureOfficialMerchant(input: {
  adminEmail: string;
  adminName: string;
}) {
  const prisma = getPrismaClient();
  const bridgeName = "NovaPay Registry Bridge";
  const existing = await prisma.merchant.findUnique({
    where: {
      code: PLATFORM_OFFICIAL_MERCHANT_CODE,
    },
  });
  const notifySecret =
    revealStoredSecret(existing?.notifySecret) ?? createRegistryNotifySecret();

  const merchant = await prisma.merchant.upsert({
    where: {
      code: PLATFORM_OFFICIAL_MERCHANT_CODE,
    },
    update: {
      name: bridgeName,
      status: MerchantStatus.APPROVED,
      legalName: bridgeName,
      contactName: requireText(input.adminName, "Admin name"),
      contactPhone: "setup-pending",
      companyRegistrationId: "setup-pending",
      notifySecret: sealStoredSecret(notifySecret),
      callbackEnabled: true,
      approvedAt: new Date(),
      approvedBy: normalizeEmail(input.adminEmail),
      statusChangedAt: new Date(),
      onboardingNote: "Registry bridge merchant initialized internally by setup wizard.",
    },
    create: {
      code: PLATFORM_OFFICIAL_MERCHANT_CODE,
      name: bridgeName,
      status: MerchantStatus.APPROVED,
      legalName: bridgeName,
      contactName: requireText(input.adminName, "Admin name"),
      contactPhone: "setup-pending",
      companyRegistrationId: "setup-pending",
      notifySecret: sealStoredSecret(notifySecret),
      callbackEnabled: true,
      approvedAt: new Date(),
      approvedBy: normalizeEmail(input.adminEmail),
      statusChangedAt: new Date(),
      onboardingNote: "Registry bridge merchant initialized internally by setup wizard.",
    },
  });

  return {
    merchant,
    notifySecret,
  };
}

async function ensureRegistryBridgeCredential(merchantId: string) {
  const prisma = getPrismaClient();
  const generated = generateMerchantApiCredential();

  const credential = await prisma.merchantApiCredential.upsert({
    where: {
      keyId: generated.keyId,
    },
    update: {
      enabled: true,
    },
    create: {
      merchantId,
      label: PLATFORM_BRIDGE_CREDENTIAL_LABEL,
      keyId: generated.keyId,
      secretCiphertext: generated.secretCiphertext,
      secretPreview: generated.secretPreview,
      enabled: true,
    },
  });

  await prisma.merchantApiCredential.updateMany({
    where: {
      merchantId,
      label: PLATFORM_BRIDGE_CREDENTIAL_LABEL,
      id: {
        not: credential.id,
      },
    },
    data: {
      enabled: false,
    },
  });

  return {
    keyId: generated.keyId,
    secret: generated.secret,
  };
}

function resolveBridgeChannelCode(input: {
  alipayConfigured: boolean;
  wxpayConfigured: boolean;
}) {
  if (input.alipayConfigured) {
    return "alipay.page";
  }

  if (input.wxpayConfigured) {
    return "wxpay.native";
  }

  throw new Error("No enabled payment channel is available for Registry bridge.");
}

async function ensureMerchantInstalledPlugins(merchantId: string) {
  const prisma = getPrismaClient();
  await Promise.all(
    ["novapay.alipay-page", "novapay.wxpay-native"].map((slug) =>
      prisma.merchantInstalledPlugin.upsert({
        where: {
          merchantId_pluginSlug: {
            merchantId,
            pluginSlug: slug,
          },
        },
        update: {},
        create: {
          merchantId,
          pluginSlug: slug,
        },
      }),
    ),
  );
}

async function ensureChannelAccount(input: {
  merchantId: string;
  channelCode: "alipay.page" | "wxpay.native";
  providerKey: "alipay" | "wxpay";
  displayName: string;
  config: Record<string, unknown>;
}) {
  const prisma = getPrismaClient();
  const existing = await prisma.merchantChannelAccount.findFirst({
    where: {
      merchantId: input.merchantId,
      channelCode: input.channelCode,
    },
    orderBy: [{ updatedAt: "desc" }],
  });

  if (existing) {
    return prisma.merchantChannelAccount.update({
      where: {
        id: existing.id,
      },
      data: {
        providerKey: input.providerKey,
        displayName: input.displayName,
        config: input.config as never,
        enabled: true,
      },
    });
  }

  return prisma.merchantChannelAccount.create({
    data: {
      merchantId: input.merchantId,
      providerKey: input.providerKey,
      channelCode: input.channelCode,
      displayName: input.displayName,
      config: input.config as never,
      callbackToken: generateMerchantChannelCallbackToken(),
      enabled: true,
    },
  });
}

async function ensureChannelBinding(input: {
  merchantId: string;
  channelCode: "alipay.page" | "wxpay.native";
  merchantChannelAccountId: string;
}) {
  const prisma = getPrismaClient();
  return prisma.merchantChannelBinding.upsert({
    where: {
      merchantId_channelCode: {
        merchantId: input.merchantId,
        channelCode: input.channelCode,
      },
    },
    update: {
      enabled: true,
      merchantChannelAccountId: input.merchantChannelAccountId,
      providerAccountId: null,
    },
    create: {
      merchantId: input.merchantId,
      channelCode: input.channelCode,
      enabled: true,
      merchantChannelAccountId: input.merchantChannelAccountId,
      providerAccountId: null,
    },
  });
}

export async function runPlatformBootstrap(
  rawInput: PlatformBootstrapInput,
  options?: { allowWhenInitialized?: boolean },
): Promise<PlatformBootstrapResult> {
  requireAtLeastOneEnabled(rawInput);

  // Bootstrap is a one-time setup operation. Once any administrator exists,
  // refuse to run unless the caller is explicitly authorized (authenticated
  // SUPER_ADMIN or the internal service token). This blocks an unauthenticated
  // request from creating/hijacking a SUPER_ADMIN, overwriting the official
  // merchant's channel keys, or rotating and leaking the bridge credentials.
  const existingAdminCount = await getPrismaClient().adminUser.count();
  if (existingAdminCount > 0 && !options?.allowWhenInitialized) {
    throw new Error(
      "Platform is already initialized; bootstrap is disabled. Use an authenticated admin flow.",
    );
  }

  const input: PlatformBootstrapInput = {
    ...rawInput,
    adminEmail: requireText(rawInput.adminEmail, "Admin email"),
    adminPassword: validatePassword(rawInput.adminPassword),
    adminName: requireText(rawInput.adminName, "Admin name"),
    enableAlipay: Boolean(rawInput.enableAlipay),
    enableWxpay: Boolean(rawInput.enableWxpay),
    alipay: rawInput.enableAlipay
      ? {
          appId: requireText(rawInput.alipay?.appId ?? "", "Alipay App ID"),
          privateKey: requireText(rawInput.alipay?.privateKey ?? "", "Alipay private key"),
          publicKey: requireText(rawInput.alipay?.publicKey ?? "", "Alipay public key"),
        }
      : null,
    wxpay: rawInput.enableWxpay
      ? {
          appId: requireText(rawInput.wxpay?.appId ?? "", "WeChat App ID"),
          mchId: requireText(rawInput.wxpay?.mchId ?? "", "WeChat merchant ID"),
          mchSerialNo: requireText(
            rawInput.wxpay?.mchSerialNo ?? "",
            "WeChat merchant certificate serial number",
          ),
          privateKey: requireText(rawInput.wxpay?.privateKey ?? "", "WeChat private key"),
          apiV3Key: requireText(rawInput.wxpay?.apiV3Key ?? "", "WeChat API v3 key"),
          platformPublicKey: requireText(
            rawInput.wxpay?.platformPublicKey ?? "",
            "WeChat platform public key",
          ),
          platformSerial: rawInput.wxpay?.platformSerial?.trim() || "",
        }
      : null,
  };

  await syncBuiltinMarketplacePlugins(true);
  await ensureAdminUser(input);
  const { merchant, notifySecret } = await ensureOfficialMerchant({
    adminEmail: input.adminEmail,
    adminName: input.adminName,
  });
  const bridgeCredential = await ensureRegistryBridgeCredential(merchant.id);
  await ensureMerchantInstalledPlugins(merchant.id);

  let bridgeChannelCode: string = "alipay.page";

  if (input.enableAlipay && input.alipay) {
    const alipayAccount = await ensureChannelAccount({
      merchantId: merchant.id,
      channelCode: "alipay.page",
      providerKey: "alipay",
      displayName: PLATFORM_ALIPAY_ACCOUNT_NAME,
      config: buildAlipayConfig(input.alipay),
    });
    await ensureChannelBinding({
      merchantId: merchant.id,
      channelCode: "alipay.page",
      merchantChannelAccountId: alipayAccount.id,
    });
    bridgeChannelCode = "alipay.page";
  }

  if (input.enableWxpay && input.wxpay) {
    const wxpayAccount = await ensureChannelAccount({
      merchantId: merchant.id,
      channelCode: "wxpay.native",
      providerKey: "wxpay",
      displayName: PLATFORM_WXPAY_ACCOUNT_NAME,
      config: buildWxpayConfig(input.wxpay),
    });
    await ensureChannelBinding({
      merchantId: merchant.id,
      channelCode: "wxpay.native",
      merchantChannelAccountId: wxpayAccount.id,
    });
    if (!input.enableAlipay) {
      bridgeChannelCode = "wxpay.native";
    }
  }

  return {
    merchantCode: merchant.code,
    registryBridge: {
      merchantCode: merchant.code,
      apiKeyId: bridgeCredential.keyId,
      apiKeySecret: bridgeCredential.secret,
      notifySecret,
      channelCode: bridgeChannelCode,
    },
  };
}

export async function provisionRegistryBridgeFromMainSite(): Promise<RegistryBridgeProvisionResult> {
  const status = await getPlatformBootstrapStatus();

  if (!status.setupComplete) {
    throw new Error("Main-site setup is incomplete. Finish http://localhost:3000/setup first.");
  }

  const prisma = getPrismaClient();
  const admin = await prisma.adminUser.findFirst({
    where: {
      enabled: true,
    },
    orderBy: [{ createdAt: "asc" }],
  });

  if (!admin) {
    throw new Error("No active administrator account was found.");
  }

  const { merchant, notifySecret } = await ensureOfficialMerchant({
    adminEmail: admin.email,
    adminName: admin.name,
  });
  const bridgeCredential = await ensureRegistryBridgeCredential(merchant.id);
  await ensureMerchantInstalledPlugins(merchant.id);

  return {
    merchantCode: merchant.code,
    apiKeyId: bridgeCredential.keyId,
    apiKeySecret: bridgeCredential.secret,
    notifySecret,
    channelCode: resolveBridgeChannelCode({
      alipayConfigured: status.alipayConfigured,
      wxpayConfigured: status.wxpayConfigured,
    }),
  };
}
