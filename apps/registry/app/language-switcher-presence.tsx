"use client";

import { usePathname } from "next/navigation";
import { LanguageSwitcher } from "./language-switcher";
import type { Locale } from "@/lib/i18n";

export function LanguageSwitcherPresence({ locale }: { locale: Locale }) {
  const pathname = usePathname();

  if (pathname === "/" || pathname === "/setup" || pathname.startsWith("/developer")) {
    return null;
  }

  return <LanguageSwitcher locale={locale} />;
}
