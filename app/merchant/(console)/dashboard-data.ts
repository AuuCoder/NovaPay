import { notFound } from "next/navigation";
import {
  readPageMessages,
  type SearchParamsInput,
} from "@/app/admin/support";
import { PaymentStatus } from "@/generated/prisma/enums";
import { getCurrentLocale } from "@/lib/i18n-server";
import { readMerchantCredentialReveal } from "@/lib/merchant-credential-reveal";
import {
  getMerchantProfileMissingFields,
  getMerchantWorkspaceName,
} from "@/lib/merchant-profile-completion";
import type { Locale } from "@/lib/i18n";
import { hasMerchantPermission } from "@/lib/merchant-rbac";
import { requireMerchantSession } from "@/lib/merchant-session";
import { getPublicBaseUrl } from "@/lib/env";
import { getPrismaClient } from "@/lib/prisma";

export async function loadMerchantDashboardData(
  searchParams?: SearchParamsInput,
  options?: {
    locale?: Locale;
  },
) {
  const session = await requireMerchantSession();
  const prisma = getPrismaClient();
  const messages = await readPageMessages(searchParams);
  const locale = options?.locale ?? (await getCurrentLocale());
  const credentialReveal = await readMerchantCredentialReveal();
  const merchant = await prisma.merchant.findUnique({
    where: {
      id: session.merchantUser.merchantId,
    },
    include: {
      _count: {
        select: {
          paymentOrders: true,
          paymentRefunds: true,
          apiCredentials: true,
          channelBindings: true,
          channelAccounts: true,
        },
      },
      channelBindings: {
        include: {
          merchantChannelAccount: {
            select: {
              id: true,
              displayName: true,
              channelCode: true,
              enabled: true,
              callbackToken: true,
            },
          },
          providerAccount: {
            select: {
              id: true,
              displayName: true,
              channelCode: true,
              enabled: true,
            },
          },
        },
        orderBy: [{ channelCode: "asc" }],
      },
      channelAccounts: {
        orderBy: [{ channelCode: "asc" }, { updatedAt: "desc" }],
        select: {
          id: true,
          channelCode: true,
          displayName: true,
          enabled: true,
          callbackToken: true,
          updatedAt: true,
        },
      },
      apiCredentials: {
        orderBy: [{ createdAt: "desc" }],
      },
      paymentOrders: {
        orderBy: [{ createdAt: "desc" }],
        take: 10,
        select: {
          id: true,
          externalOrderId: true,
          channelCode: true,
          amount: true,
          status: true,
          callbackStatus: true,
          createdAt: true,
          paidAt: true,
        },
      },
      paymentRefunds: {
        orderBy: [{ createdAt: "desc" }],
        take: 10,
        select: {
          id: true,
          externalRefundId: true,
          amount: true,
          status: true,
          providerStatus: true,
          createdAt: true,
          refundedAt: true,
          paymentOrder: {
            select: {
              externalOrderId: true,
            },
          },
        },
      },
    },
  });

  if (!merchant) {
    notFound();
  }

  const [successfulOrders, totalPaidAmount, successfulRefunds, totalRefundAmount] =
    await Promise.all([
      prisma.paymentOrder.count({
        where: {
          merchantId: merchant.id,
          status: PaymentStatus.SUCCEEDED,
        },
      }),
      prisma.paymentOrder.aggregate({
        where: {
          merchantId: merchant.id,
          status: PaymentStatus.SUCCEEDED,
        },
        _sum: {
          amount: true,
        },
      }),
      prisma.paymentRefund.count({
        where: {
          merchantId: merchant.id,
          status: "SUCCEEDED",
        },
      }),
      prisma.paymentRefund.aggregate({
        where: {
          merchantId: merchant.id,
          status: "SUCCEEDED",
        },
        _sum: {
          amount: true,
        },
      }),
    ]);

  const activeCredentialCount = merchant.apiCredentials.filter(
    (credential) =>
      credential.enabled && (!credential.expiresAt || credential.expiresAt > new Date()),
  ).length;
  const activeChannelAccountCount = merchant.channelAccounts.filter(
    (account) => account.enabled,
  ).length;
  const successRate =
    merchant._count.paymentOrders > 0
      ? `${((successfulOrders / merchant._count.paymentOrders) * 100).toFixed(1)}%`
      : "0%";
  const canEditProfile = hasMerchantPermission(
    session.merchantUser.role,
    "profile:write",
  );
  const canManageCredentials = hasMerchantPermission(
    session.merchantUser.role,
    "credential:write",
  );
  const canReadChannels = hasMerchantPermission(
    session.merchantUser.role,
    "channel:read",
  );
  const canReadOrders = hasMerchantPermission(
    session.merchantUser.role,
    "order:read",
  );
  const canReadRefunds = hasMerchantPermission(
    session.merchantUser.role,
    "refund:read",
  );
  const profileMissingFields = getMerchantProfileMissingFields(merchant, locale);
  const isProfileComplete = profileMissingFields.length === 0;
  const merchantDisplayName = getMerchantWorkspaceName(merchant.name, locale);
  const hasConfiguredBusinessCallback = Boolean(
    merchant.callbackEnabled && merchant.callbackBase?.trim(),
  );
  const hasAnyChannelAccount = merchant._count.channelAccounts > 0;
  const hasEnabledChannelAccount = activeChannelAccountCount > 0;
  const publicBaseUrl = getPublicBaseUrl();
  const preferredCredential =
    merchant.apiCredentials.find(
      (credential) =>
        credential.enabled && (!credential.expiresAt || credential.expiresAt > new Date()),
    ) ??
    merchant.apiCredentials[0] ??
    null;
  const recommendedNoveShopChannelCode =
    merchant.channelBindings.find(
      (binding) =>
        binding.enabled &&
        (!binding.merchantChannelAccountId || binding.merchantChannelAccount?.enabled),
    )?.channelCode ??
    merchant.channelAccounts.find((account) => account.enabled)?.channelCode ??
    "";
  const checkoutTestChannels = [
    {
      code: "alipay.page",
    },
    {
      code: "wxpay.native",
    },
  ].filter((channel) => {
    const hasUsableBinding = merchant.channelBindings.some(
      (binding) =>
        binding.channelCode === channel.code &&
        (!binding.merchantChannelAccountId || binding.merchantChannelAccount?.enabled),
    );

    if (hasUsableBinding) {
      return true;
    }

    return merchant.channelAccounts.some(
      (account) => account.enabled && account.channelCode === channel.code,
    );
  });

  return {
    session,
    messages,
    locale,
    credentialReveal,
    merchant,
    successfulOrders,
    totalPaidAmount,
    successfulRefunds,
    totalRefundAmount,
    activeCredentialCount,
    activeChannelAccountCount,
    successRate,
    canEditProfile,
    canManageCredentials,
    canReadChannels,
    canReadOrders,
    canReadRefunds,
    profileMissingFields,
    isProfileComplete,
    merchantDisplayName,
    hasConfiguredBusinessCallback,
    hasAnyChannelAccount,
    hasEnabledChannelAccount,
    publicBaseUrl,
    preferredCredential,
    recommendedNoveShopChannelCode,
    checkoutTestChannels,
  };
}

export type MerchantDashboardData = Awaited<
  ReturnType<typeof loadMerchantDashboardData>
>;
