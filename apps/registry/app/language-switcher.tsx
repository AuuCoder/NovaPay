"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LOCALE_COOKIE_NAME, type Locale } from "@/lib/i18n";

export function LanguageSwitcher({
  locale,
  inline = false,
}: {
  locale: Locale;
  inline?: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function handlePointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
    };
  }, [isOpen]);

  function switchLocale(nextLocale: Locale) {
    if (nextLocale === locale) {
      return;
    }

    setIsOpen(false);
    document.cookie = `${LOCALE_COOKIE_NAME}=${nextLocale}; path=/; max-age=31536000; samesite=lax`;
    startTransition(() => {
      router.refresh();
    });
  }

  return (
    <div
      ref={containerRef}
      className={`registry-locale-switcher ${
        inline ? "registry-locale-switcher-inline" : ""
      }`}
    >
      <button
        type="button"
        aria-label={locale === "en" ? "Switch language" : "切换语言"}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        disabled={isPending}
        onClick={() => setIsOpen((value) => !value)}
        className="registry-locale-icon-button"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
        >
          <path
            d="M12 3C16.9706 3 21 7.02944 21 12C21 16.9706 16.9706 21 12 21M12 3C7.02944 3 3 7.02944 3 12C3 16.9706 7.02944 21 12 21M12 3C14.2513 5.46383 15.5306 8.66364 15.6 12C15.5306 15.3364 14.2513 18.5362 12 21M12 3C9.74874 5.46383 8.46941 8.66364 8.4 12C8.46941 15.3364 9.74874 18.5362 12 21M4 9H20M4 15H20"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      {isOpen ? (
        <div className="registry-locale-popover" role="menu">
          <button
            type="button"
            role="menuitemradio"
            aria-checked={locale === "zh"}
            disabled={isPending}
            onClick={() => switchLocale("zh")}
            className={`registry-locale-popover-item ${
              locale === "zh" ? "registry-locale-popover-item-active" : ""
            }`}
          >
            中文
          </button>
          <button
            type="button"
            role="menuitemradio"
            aria-checked={locale === "en"}
            disabled={isPending}
            onClick={() => switchLocale("en")}
            className={`registry-locale-popover-item ${
              locale === "en" ? "registry-locale-popover-item-active" : ""
            }`}
          >
            EN
          </button>
        </div>
      ) : null}
    </div>
  );
}
