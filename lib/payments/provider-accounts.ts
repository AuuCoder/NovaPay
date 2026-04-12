import { buildMerchantChannelCallbackUrl } from "@/lib/merchant-channel-accounts";
import { AppError } from "@/lib/errors";
import { revealProviderConfigForRuntime } from "@/lib/provider-account-config";
import { getPrismaClient } from "@/lib/prisma";
import { isRecord } from "@/lib/payments/utils";
import type { ProviderAccountConfig } from "@/lib/payments/types";

interface ResolvedMerchantChannelRoute {
  account: ProviderAccountConfig;
  feeRate: string | null;
  notifyUrl: string;
  sourceType: "merchant";
}

function toStringRecord(value: unknown) {
  if (!isRecord(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value)
      .filter(([, item]) => item !== undefined && item !== null)
      .map(([key, item]) => [key, String(item)]),
  );
}

function normalizeMerchantChannelAccount(
  account: {
    id: string;
    merchantId: string;
    providerKey: string;
    channelCode: string;
    displayName: string;
    config: unknown;
    callbackToken: string;
  },
): ProviderAccountConfig {
  return {
    id: account.id,
    providerKey: account.providerKey,
    channelCode: account.channelCode,
    displayName: account.displayName,
    sourceType: "merchant",
    merchantId: account.merchantId,
    callbackToken: account.callbackToken,
    config: toStringRecord(revealProviderConfigForRuntime(account.config)),
    limits: null,
  };
}

function resolveNotifyUrl(account: ProviderAccountConfig | null) {
  if (!account || !account.callbackToken) {
    throw new Error("Merchant channel callback route is not configured.");
  }

  return buildMerchantChannelCallbackUrl(account.channelCode, account.id, account.callbackToken);
}

async function getMerchantChannelAccountById(id: string) {
  const prisma = getPrismaClient();
  const account = await prisma.merchantChannelAccount.findUnique({
    where: {
      id,
    },
  });

  if (!account) {
    return null;
  }

  return normalizeMerchantChannelAccount(account);
}

export async function getMerchantChannelAccountBySecureRoute(input: {
  accountId: string;
  callbackToken: string;
}) {
  const prisma = getPrismaClient();
  const account = await prisma.merchantChannelAccount.findFirst({
    where: {
      id: input.accountId,
      callbackToken: input.callbackToken,
      enabled: true,
    },
  });

  if (!account) {
    return null;
  }

  return normalizeMerchantChannelAccount(account);
}

export async function getPaymentRuntimeAccountBySelection(input: {
  merchantChannelAccountId?: string | null;
}) {
  if (input.merchantChannelAccountId) {
    return getMerchantChannelAccountById(input.merchantChannelAccountId);
  }

  return null;
}

export async function selectProviderAccountForOrder(input: {
  merchantId: string;
  channelCode: string;
  amount: string;
}): Promise<ResolvedMerchantChannelRoute> {
  const prisma = getPrismaClient();
  const amount = Number(input.amount);

  const binding = await prisma.merchantChannelBinding.findUnique({
    where: {
      merchantId_channelCode: {
        merchantId: input.merchantId,
        channelCode: input.channelCode,
      },
    },
    include: {
      merchantChannelAccount: true,
    },
  });

  if (binding) {
    if (!binding.enabled) {
      throw new AppError(
        "CHANNEL_DISABLED",
        `Channel ${input.channelCode} is disabled for this merchant.`,
        422,
      );
    }

    if (binding.minAmount && amount < Number(binding.minAmount)) {
      throw new AppError(
        "AMOUNT_TOO_SMALL",
        `Amount must be at least ${binding.minAmount.toString()} for channel ${input.channelCode}.`,
        422,
      );
    }

    if (binding.maxAmount && amount > Number(binding.maxAmount)) {
      throw new AppError(
        "AMOUNT_TOO_LARGE",
        `Amount must be at most ${binding.maxAmount.toString()} for channel ${input.channelCode}.`,
        422,
      );
    }
  }

  if (binding?.providerAccountId) {
    throw new AppError(
      "LEGACY_PLATFORM_ACCOUNT_UNSUPPORTED",
      `Channel ${input.channelCode} is still bound to a legacy platform account. Rebind it to this merchant's own channel instance first.`,
      422,
    );
  }

  if (binding?.merchantChannelAccountId) {
    if (!binding.merchantChannelAccount) {
      throw new AppError(
        "ACCOUNT_NOT_FOUND",
        `Merchant channel account ${binding.merchantChannelAccountId} was not found.`,
        422,
      );
    }

    if (!binding.merchantChannelAccount.enabled) {
      throw new AppError(
        "ACCOUNT_DISABLED",
        `Merchant channel account ${binding.merchantChannelAccount.displayName} is disabled.`,
        422,
      );
    }

    const account = normalizeMerchantChannelAccount(binding.merchantChannelAccount);

    return {
      account,
      feeRate: binding.feeRate?.toString() ?? null,
      notifyUrl: resolveNotifyUrl(account),
      sourceType: "merchant",
    };
  }

  const merchantChannelAccount = await prisma.merchantChannelAccount.findFirst({
    where: {
      merchantId: input.merchantId,
      channelCode: input.channelCode,
      enabled: true,
    },
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
  });

  if (merchantChannelAccount) {
    const account = normalizeMerchantChannelAccount(merchantChannelAccount);

    return {
      account,
      feeRate: binding?.feeRate?.toString() ?? null,
      notifyUrl: resolveNotifyUrl(account),
      sourceType: "merchant",
    };
  }

  throw new AppError(
    "CHANNEL_NOT_CONFIGURED",
    `Channel ${input.channelCode} is not configured for this merchant. Create and enable a merchant-owned channel instance first.`,
    422,
  );
}
