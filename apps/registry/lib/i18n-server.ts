import { cookies } from "next/headers";
import { type Locale, LOCALE_COOKIE_NAME } from "@/lib/i18n";

export async function getCurrentLocale(): Promise<Locale> {
  const cookieStore = await cookies();
  const value = cookieStore.get(LOCALE_COOKIE_NAME)?.value;
  return value === "en" ? "en" : "zh";
}
