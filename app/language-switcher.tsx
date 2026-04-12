"use client";

import { useTransition } from "react";
import { LOCALE_COOKIE_NAME, type Locale } from "@/lib/i18n";
import { useRouter } from "next/navigation";

export function LanguageSwitcher({ locale }: { locale: Locale }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function switchLocale(nextLocale: Locale) {
    if (nextLocale === locale) {
      return;
    }

    document.cookie = `${LOCALE_COOKIE_NAME}=${nextLocale}; path=/; max-age=31536000; samesite=lax`;
    startTransition(() => {
      router.refresh();
    });
  }

  return (
    <div className="fixed right-4 top-4 z-50 flex items-center gap-1 rounded-full border border-line bg-white/90 p-1 shadow-[0_12px_36px_rgba(79,46,17,0.12)] backdrop-blur">
      <button
        type="button"
        onClick={() => switchLocale("zh")}
        aria-pressed={locale === "zh"}
        disabled={isPending}
        className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
          locale === "zh" ? "bg-foreground text-white" : "text-foreground hover:bg-panel"
        }`}
      >
        中文
      </button>
      <button
        type="button"
        onClick={() => switchLocale("en")}
        aria-pressed={locale === "en"}
        disabled={isPending}
        className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
          locale === "en" ? "bg-foreground text-white" : "text-foreground hover:bg-panel"
        }`}
      >
        EN
      </button>
    </div>
  );
}
