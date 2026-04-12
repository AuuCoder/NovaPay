import { cookies } from "next/headers";
import { type Locale, normalizeLocale } from "@/lib/i18n";

export async function getCurrentLocale(): Promise<Locale> {
  const cookieStore = await cookies();
  return normalizeLocale(cookieStore.get("novapay_locale")?.value);
}
