import type { MerchantChannelAccount, Prisma } from "@/generated/prisma/client";
import {
  getActiveMerchantChannelTemplate,
  generateMerchantChannelCallbackToken,
} from "@/lib/merchant-channel-accounts";
import { assertMerchantProfileCompleteForChannel } from "@/lib/merchant-profile-completion";
import type { MerchantChannelTemplate } from "@/lib/payments/plugins/types";
import { normalizeUsdtReceivingAddress } from "@/lib/payments/usdt-address";
import { isMerchantPaymentPluginInstalled } from "@/lib/plugins/marketplace";
import { getPrismaClient } from "@/lib/prisma";
import { protectProviderConfigForStorage } from "@/lib/provider-account-config";

const PROFILE_PREFIX = "请先完善以下商户资料后再启用该支付通道：";

function readString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function readOptionalString(formData: FormData, key: string) {
  return readString(formData, key) || null;
}

function readRequiredString(formData: FormData, key: string, label: string) {
  const value = readString(formData, key);

  if (!value) {
    throw new Error(`${label}不能为空。`);
  }

  return value;
}

function readBoolean(formData: FormData, key: string) {
  return formData.get(key) === "on";
}

async function getMerchantChannelTemplateOrThrow(merchantId: string, channelCode: string) {
  const template = await getActiveMerchantChannelTemplate(merchantId, channelCode);

  if (!template) {
    throw new Error("暂不支持该支付通道。");
  }

  return template;
}

function getChannelConfigAddress(config: unknown) {
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    return null;
  }

  const record = config as Record<string, unknown>;
  const candidate = record.walletAddress ?? record.receivingAddress ?? record.address;
  return typeof candidate === "string" ? candidate : null;
}

async function assertUsdtChannelAddressAvailable(input: {
  merchantId: string;
  channelCode: string;
  walletAddress: string;
  excludeAccountId?: string;
}) {
  const template = await getActiveMerchantChannelTemplate(input.merchantId, input.channelCode);

  if (!template || template.providerKey !== "crypto") {
    return;
  }

  const prisma = getPrismaClient();
  const accounts = await prisma.merchantChannelAccount.findMany({
    where: {
      channelCode: input.channelCode,
      ...(input.excludeAccountId
        ? {
            id: {
              not: input.excludeAccountId,
            },
          }
        : {}),
    },
    select: {
      id: true,
      displayName: true,
      merchant: {
        select: {
          code: true,
          name: true,
        },
      },
      config: true,
    },
  });

  const duplicate = accounts.find((account) => {
    const existingAddress = getChannelConfigAddress(account.config);

    if (!existingAddress) {
      return false;
    }

    try {
      return (
        normalizeUsdtReceivingAddress(input.channelCode, existingAddress) === input.walletAddress
      );
    } catch {
      return false;
    }
  });

  if (duplicate) {
    throw new Error(
      `该收款地址已被商户 ${duplicate.merchant.name}（${duplicate.merchant.code}）的通道实例 ${duplicate.displayName} 占用，请使用当前商户独立的链上地址。`,
    );
  }
}

async function readMerchantChannelConfig(
  merchantId: string,
  channelCode: string,
  formData: FormData,
): Promise<{ template: MerchantChannelTemplate; config: Record<string, string> }> {
  const template = await getMerchantChannelTemplateOrThrow(merchantId, channelCode);
  const config: Record<string, string> = {};

  for (const field of template.fields) {
    const value = readString(formData, `config_${field.key}`);

    if (field.required && !value) {
      throw new Error(`${field.label} 不能为空。`);
    }

    config[field.key] = value;
  }

  if (template.providerKey === "crypto") {
    try {
      config.walletAddress = normalizeUsdtReceivingAddress(template.channelCode, config.walletAddress);
    } catch {
      throw new Error(
        template.channelCode === "usdt.sol"
          ? "Solana 收款地址格式不正确。"
          : "EVM 收款地址格式不正确，请检查是否为 0x 开头的正确链上地址。",
      );
    }
  }

  return {
    template,
    config,
  };
}

export async function maybeSetMerchantChannelBindingDefault(input: {
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

export interface MerchantChannelAccountMutationResult {
  account: MerchantChannelAccount;
  template: MerchantChannelTemplate;
}

/**
 * Creates a merchant-owned payment channel instance.
 *
 * Session-agnostic: the caller (merchant self-service or admin console) is
 * responsible for authorization, audit logging, cache revalidation, and
 * redirects. This keeps the merchant portal and the admin console on exactly
 * the same channel-provisioning rules.
 */
export async function createMerchantChannelAccountFromForm(input: {
  merchantId: string;
  formData: FormData;
}): Promise<MerchantChannelAccountMutationResult> {
  const { merchantId, formData } = input;
  const channelCode = readRequiredString(formData, "channelCode", "支付通道");

  const pluginInstalled = await isMerchantPaymentPluginInstalled(merchantId, channelCode);

  if (!pluginInstalled) {
    throw new Error("请先在插件市场安装当前支付插件后，再创建通道实例。");
  }

  const shouldEnable = readBoolean(formData, "enabled");
  const prisma = getPrismaClient();
  const merchant = await prisma.merchant.findUnique({
    where: {
      id: merchantId,
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
      prefix: PROFILE_PREFIX,
    });
  }

  const displayName = readRequiredString(formData, "displayName", "通道名称");
  const { template, config } = await readMerchantChannelConfig(merchantId, channelCode, formData);

  if (template.providerKey === "crypto") {
    await assertUsdtChannelAddressAvailable({
      merchantId,
      channelCode: template.channelCode,
      walletAddress: config.walletAddress,
    });
  }

  const account = await prisma.merchantChannelAccount.create({
    data: {
      merchantId,
      providerKey: template.providerKey,
      channelCode: template.channelCode,
      displayName,
      config: protectProviderConfigForStorage(config) as Prisma.InputJsonValue,
      callbackToken: generateMerchantChannelCallbackToken(),
      enabled: shouldEnable,
      remark: readOptionalString(formData, "remark"),
    },
  });

  await maybeSetMerchantChannelBindingDefault({
    merchantId,
    channelCode: template.channelCode,
    merchantChannelAccountId: account.id,
    shouldSetDefault: readBoolean(formData, "setAsDefault"),
    bindingEnabled: shouldEnable,
  });

  return { account, template };
}

/**
 * Updates an existing merchant-owned payment channel instance.
 *
 * Session-agnostic; see {@link createMerchantChannelAccountFromForm}.
 */
export async function updateMerchantChannelAccountFromForm(input: {
  merchantId: string;
  formData: FormData;
}): Promise<
  MerchantChannelAccountMutationResult & {
    previousCallbackToken: string;
  }
> {
  const { merchantId, formData } = input;
  const prisma = getPrismaClient();
  const requestedEnabled = readBoolean(formData, "enabled");

  const merchant = await prisma.merchant.findUnique({
    where: {
      id: merchantId,
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

  const id = readRequiredString(formData, "id", "通道实例 ID");
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

  if (!existing || existing.merchantId !== merchantId) {
    throw new Error("指定的支付通道实例不存在。");
  }

  const pluginInstalled = await isMerchantPaymentPluginInstalled(merchantId, existing.channelCode);

  if (!pluginInstalled) {
    throw new Error("当前支付插件尚未安装到商户工作台，请先前往插件市场安装。");
  }

  if (requestedEnabled && !existing.enabled) {
    assertMerchantProfileCompleteForChannel(merchant, existing.channelCode, {
      prefix: PROFILE_PREFIX,
    });
  }

  const { template, config } = await readMerchantChannelConfig(
    merchantId,
    existing.channelCode,
    formData,
  );

  if (template.providerKey === "crypto") {
    await assertUsdtChannelAddressAvailable({
      merchantId,
      channelCode: template.channelCode,
      walletAddress: config.walletAddress,
      excludeAccountId: existing.id,
    });
  }

  const account = await prisma.merchantChannelAccount.update({
    where: {
      id,
    },
    data: {
      displayName: readRequiredString(formData, "displayName", "通道名称"),
      config: protectProviderConfigForStorage(config, existing.config) as Prisma.InputJsonValue,
      enabled: requestedEnabled,
      remark: readOptionalString(formData, "remark"),
    },
  });

  await maybeSetMerchantChannelBindingDefault({
    merchantId,
    channelCode: template.channelCode,
    merchantChannelAccountId: account.id,
    shouldSetDefault: readBoolean(formData, "setAsDefault"),
    bindingEnabled: requestedEnabled,
  });

  return { account, template, previousCallbackToken: existing.callbackToken };
}
