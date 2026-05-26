import { pickByLocale, type Locale } from "@/lib/i18n";
import type {
  PaymentChannelCode,
  PaymentChannelSummary,
  PaymentProvider,
} from "@/lib/payments/types";

export interface LocalizedText {
  zh: string;
  en: string;
}

export interface MerchantChannelFieldDefinition {
  key: string;
  label: string;
  required?: boolean;
  placeholder?: string;
  multiline?: boolean;
}

export interface MerchantChannelFieldDefinitionInput {
  key: string;
  label: string | LocalizedText;
  required?: boolean;
  placeholder?: string | LocalizedText;
  multiline?: boolean;
}

export interface MerchantChannelTemplate {
  channelCode: PaymentChannelCode;
  providerKey: PaymentChannelSummary["provider"];
  title: string;
  description: string;
  requiresMerchantProfileCompletion: boolean;
  supportsCallbackRoute: boolean;
  fields: MerchantChannelFieldDefinition[];
}

export interface PaymentChannelOption {
  code: PaymentChannelCode;
  providerKey: PaymentChannelSummary["provider"];
  title: string;
  detail: string;
}

export interface PaymentPluginMarketplaceInfo {
  slug: string;
  packageName: string;
  vendor: string;
  version: string;
  category: LocalizedText;
  summary: LocalizedText;
  description: LocalizedText;
}

export interface PaymentPluginDefinition {
  channelCode: PaymentChannelCode;
  providerKey: PaymentChannelSummary["provider"];
  provider: PaymentProvider;
  marketplace: PaymentPluginMarketplaceInfo;
  adminOption: {
    title: LocalizedText;
    detail: LocalizedText;
  };
  merchantTemplate: {
    title: LocalizedText;
    description: LocalizedText;
    requiresMerchantProfileCompletion: boolean;
    fields: MerchantChannelFieldDefinitionInput[];
  };
  callbacks?: {
    pathSegment: string;
  };
}

function resolveLocalizedText(value: string | LocalizedText, locale: Locale) {
  if (typeof value === "string") {
    return value;
  }

  return pickByLocale(locale, value);
}

export function resolveMerchantChannelTemplate(
  plugin: PaymentPluginDefinition,
  locale: Locale,
): MerchantChannelTemplate {
  return {
    channelCode: plugin.channelCode,
    providerKey: plugin.providerKey,
    title: pickByLocale(locale, plugin.merchantTemplate.title),
    description: pickByLocale(locale, plugin.merchantTemplate.description),
    requiresMerchantProfileCompletion:
      plugin.merchantTemplate.requiresMerchantProfileCompletion,
    supportsCallbackRoute: Boolean(plugin.callbacks),
    fields: plugin.merchantTemplate.fields.map((field) => ({
      key: field.key,
      label: resolveLocalizedText(field.label, locale),
      required: field.required,
      placeholder: field.placeholder
        ? resolveLocalizedText(field.placeholder, locale)
        : undefined,
      multiline: field.multiline,
    })),
  };
}

export function resolvePaymentChannelOption(
  plugin: PaymentPluginDefinition,
  locale: Locale,
): PaymentChannelOption {
  return {
    code: plugin.channelCode,
    providerKey: plugin.providerKey,
    title: pickByLocale(locale, plugin.adminOption.title),
    detail: pickByLocale(locale, plugin.adminOption.detail),
  };
}
