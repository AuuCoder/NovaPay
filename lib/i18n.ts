export const LOCALE_COOKIE_NAME = "novapay_locale";
export const supportedLocales = ["zh", "en"] as const;

export type Locale = (typeof supportedLocales)[number];

export function normalizeLocale(value?: string | null): Locale {
  return value === "en" ? "en" : "zh";
}

export function pickByLocale<T>(locale: Locale, values: { zh: T; en: T }) {
  return values[locale];
}
