import type { Merchant } from "@/generated/prisma/client";
import type { Locale } from "@/lib/i18n";
import { pickByLocale } from "@/lib/i18n";

const PENDING_MERCHANT_NAME_PREFIX = "__NOVAPAY_PENDING_PROFILE__";
const merchantProfileRequiredChannelCodes = new Set(["alipay.page", "wxpay.native"]);

type MerchantProfileSnapshot = Pick<
  Merchant,
  "name" | "legalName" | "contactName" | "contactPhone" | "companyRegistrationId"
>;

type MerchantProfileFieldKey =
  | "name"
  | "legalName"
  | "contactName"
  | "contactPhone"
  | "companyRegistrationId";

const merchantProfileFieldOrder: MerchantProfileFieldKey[] = [
  "name",
  "legalName",
  "contactName",
  "contactPhone",
  "companyRegistrationId",
];

const merchantProfileFieldLabels: Record<
  MerchantProfileFieldKey,
  {
    zh: string;
    en: string;
  }
> = {
  name: {
    zh: "商户名称",
    en: "Merchant Name",
  },
  legalName: {
    zh: "企业主体名称",
    en: "Legal Entity Name",
  },
  contactName: {
    zh: "联系人",
    en: "Contact Name",
  },
  contactPhone: {
    zh: "联系电话",
    en: "Contact Phone",
  },
  companyRegistrationId: {
    zh: "统一社会信用代码",
    en: "Business Registration ID",
  },
};

function hasText(value?: string | null) {
  return Boolean(value?.trim());
}

export function createPendingMerchantName(code: string) {
  return `${PENDING_MERCHANT_NAME_PREFIX}${code}`;
}

function isPendingMerchantName(name?: string | null) {
  return Boolean(name?.trim().startsWith(PENDING_MERCHANT_NAME_PREFIX));
}

export function getMerchantDisplayName(
  name: string | null | undefined,
  locale: Locale = "zh",
  options?: {
    profileComplete?: boolean;
  },
) {
  const trimmed = name?.trim();
  if (trimmed && !isPendingMerchantName(trimmed)) {
    return trimmed;
  }

  if (options?.profileComplete === true) {
    return locale === "en" ? "Verified Merchant" : "已认证商户";
  }

  return locale === "en" ? "Pending Verification Merchant" : "待认证商户";
}

export function getMerchantWorkspaceName(
  name: string | null | undefined,
  locale: Locale = "zh",
) {
  const trimmed = name?.trim();

  if (trimmed && !isPendingMerchantName(trimmed)) {
    return trimmed;
  }

  return locale === "en" ? "Merchant Workspace" : "商户工作台";
}

export function getMerchantEditableName(name: string | null | undefined) {
  return isPendingMerchantName(name) ? "" : name?.trim() ?? "";
}

function getMerchantProfileMissingKeys(
  merchant: MerchantProfileSnapshot,
): MerchantProfileFieldKey[] {
  return merchantProfileFieldOrder.filter((field) => {
    if (field === "name") {
      return !hasText(merchant.name) || isPendingMerchantName(merchant.name);
    }

    return !hasText(merchant[field]);
  });
}

export function getMerchantProfileMissingFields(
  merchant: MerchantProfileSnapshot,
  locale: Locale = "zh",
) {
  return getMerchantProfileMissingKeys(merchant).map((field) =>
    pickByLocale(locale, merchantProfileFieldLabels[field]),
  );
}

export function isMerchantProfileComplete(merchant: MerchantProfileSnapshot) {
  return getMerchantProfileMissingKeys(merchant).length === 0;
}

export function channelRequiresMerchantProfile(channelCode?: string | null) {
  return Boolean(channelCode && merchantProfileRequiredChannelCodes.has(channelCode));
}

export function getMerchantProfileMissingFieldsForChannel(
  merchant: MerchantProfileSnapshot,
  channelCode: string | null | undefined,
  locale: Locale = "zh",
) {
  if (!channelRequiresMerchantProfile(channelCode)) {
    return [];
  }

  return getMerchantProfileMissingFields(merchant, locale);
}

export function buildMerchantProfileCompletionMessage(
  merchant: MerchantProfileSnapshot,
  options?: {
    locale?: Locale;
    prefix?: string;
  },
) {
  const locale = options?.locale ?? "zh";
  const missingFields = getMerchantProfileMissingFields(merchant, locale);

  if (missingFields.length === 0) {
    return null;
  }

  const prefix =
    options?.prefix ??
    pickByLocale(locale, {
      zh: "请先完善以下商户资料后再继续当前操作：",
      en: "Complete the following merchant profile fields before continuing: ",
    });

  return `${prefix}${missingFields.join(locale === "en" ? ", " : "、")}${locale === "en" ? "." : "。"}`;
}

function assertMerchantProfileComplete(
  merchant: MerchantProfileSnapshot,
  options?: {
    locale?: Locale;
    prefix?: string;
  },
) {
  const message = buildMerchantProfileCompletionMessage(merchant, options);

  if (message) {
    throw new Error(message);
  }
}

export function assertMerchantProfileCompleteForChannel(
  merchant: MerchantProfileSnapshot,
  channelCode: string | null | undefined,
  options?: {
    locale?: Locale;
    prefix?: string;
  },
) {
  if (!channelRequiresMerchantProfile(channelCode)) {
    return;
  }

  assertMerchantProfileComplete(merchant, options);
}
