"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

type Locale = "zh" | "en";
type Tone = "error" | "success";

type ToastPayload = {
  tone: Tone;
  title: string;
  body: string;
};

const AUTO_CLOSE_MS = 4500;

function buildPayload(locale: Locale, tone: Tone, raw: string): ToastPayload {
  const title =
    tone === "error"
      ? locale === "en"
        ? "Operation failed"
        : "操作失败"
      : locale === "en"
        ? "Operation completed"
        : "操作完成";

  return {
    tone,
    title,
    body: raw,
  };
}

/**
 * Top-right toast that mirrors `?error=` / `?success=` query params posted by
 * server actions. After a short delay the toast hides itself and silently
 * strips those params from the URL so refresh won't re-show stale messages.
 *
 * Mount once per layout / standalone page. Server actions keep using
 * `redirectTo=...?success=...` exactly as before.
 */
export function FlashToast({ locale }: { locale: Locale }) {
  const searchParams = useSearchParams();
  const payload = useMemo<ToastPayload | null>(() => {
    const error = searchParams.get("error");
    const success = searchParams.get("success");
    if (error) return buildPayload(locale, "error", error);
    if (success) return buildPayload(locale, "success", success);
    return null;
  }, [locale, searchParams]);

  if (!payload) {
    return null;
  }

  // Re-key on payload contents so a brand-new toast resets all internal state
  // (open flag, progress) without any state-in-effect contortions.
  const key = `${payload.tone}:${payload.body}`;
  return <FlashToastBody key={key} locale={locale} payload={payload} />;
}

function FlashToastBody({
  locale,
  payload,
}: {
  locale: Locale;
  payload: ToastPayload;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [closed, setClosed] = useState(false);
  const [progress, setProgress] = useState(100);
  const [, startTransition] = useTransition();

  // progress + auto-dismiss timer
  useEffect(() => {
    const startedAt = Date.now();
    const timer = window.setInterval(() => {
      const elapsed = Date.now() - startedAt;
      const next = Math.max(0, 100 - (elapsed / AUTO_CLOSE_MS) * 100);
      setProgress(next);
      if (elapsed >= AUTO_CLOSE_MS) {
        window.clearInterval(timer);
        setClosed(true);
      }
    }, 80);

    return () => window.clearInterval(timer);
  }, []);

  // strip the query params from the URL once the toast is closed
  useEffect(() => {
    if (!closed) {
      return;
    }

    const timer = window.setTimeout(() => {
      startTransition(() => {
        const url = new URL(window.location.href);
        url.searchParams.delete("error");
        url.searchParams.delete("success");
        router.replace(`${pathname}${url.search}`, { scroll: false });
      });
    }, 120);

    return () => window.clearTimeout(timer);
  }, [closed, pathname, router, startTransition]);

  if (closed) {
    return null;
  }

  const isError = payload.tone === "error";
  const accent = isError
    ? {
        border: "#f1c5c0",
        background: "#fff4f1",
        text: "#973225",
        iconBackground: "rgba(151, 50, 37, 0.10)",
        iconText: "#973225",
        progress: "#c75a4a",
        progressTrack: "rgba(151, 50, 37, 0.14)",
      }
    : {
        border: "#bde2d5",
        background: "#f1fbf7",
        text: "#165746",
        iconBackground: "rgba(22, 87, 70, 0.10)",
        iconText: "#165746",
        progress: "#2f8f6f",
        progressTrack: "rgba(22, 87, 70, 0.14)",
      };

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed right-4 top-4 z-[1100] w-[min(100%,380px)] sm:right-6 sm:top-6"
    >
      <div
        className="pointer-events-auto rounded-[1.25rem] border px-4 py-3 text-sm shadow-[0_24px_60px_rgba(79,46,17,0.14)] backdrop-blur-sm"
        style={{
          borderColor: accent.border,
          background: accent.background,
          color: accent.text,
        }}
      >
        <div className="flex items-start gap-3">
          <div
            className="flex h-9 w-9 flex-none items-center justify-center rounded-full text-base font-bold"
            style={{ background: accent.iconBackground, color: accent.iconText }}
            aria-hidden="true"
          >
            {isError ? "!" : "✓"}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold leading-5">{payload.title}</p>
            <p className="mt-1 break-words text-xs leading-5 opacity-90">{payload.body}</p>
          </div>
          <button
            type="button"
            onClick={() => setClosed(true)}
            className="flex-none rounded-full px-2 py-1 text-xs font-medium opacity-70 transition hover:opacity-100"
            style={{ color: accent.text }}
            aria-label={locale === "en" ? "Close" : "关闭"}
          >
            {locale === "en" ? "Close" : "关闭"}
          </button>
        </div>
        <div
          className="mt-3 h-[3px] w-full overflow-hidden rounded-full"
          style={{ background: accent.progressTrack }}
          aria-hidden="true"
        >
          <div
            className="h-full transition-[width] duration-[80ms] ease-linear"
            style={{ width: `${progress}%`, background: accent.progress }}
          />
        </div>
      </div>
    </div>
  );
}
