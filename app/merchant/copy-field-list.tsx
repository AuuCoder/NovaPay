"use client";

import type { ReactNode } from "react";
import { useRef, useState } from "react";
import type { Locale } from "@/lib/i18n";

export interface CopyFieldItem {
  id: string;
  label: string;
  value?: string | null;
  hint?: string;
  multiline?: boolean;
  secret?: boolean;
  wide?: boolean;
  emptyValueLabel?: string;
}

function isAvailable(value?: string | null) {
  return Boolean(value?.trim());
}

async function copyText(value: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "true");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  document.body.removeChild(textarea);
}

export function CopyTextBlock({
  locale,
  title,
  value,
  description,
  hints = [],
  secret = false,
  footer,
}: {
  locale: Locale;
  title: string;
  value?: string | null;
  description?: string;
  hints?: string[];
  secret?: boolean;
  footer?: ReactNode;
}) {
  const [copied, setCopied] = useState(false);
  const resetTimerRef = useRef<number | null>(null);
  const copyLabel = locale === "en" ? "Copy Config" : "复制配置";
  const copiedLabel = locale === "en" ? "Copied" : "已复制";
  const unavailableLabel = locale === "en" ? "Not configured" : "未配置";
  const buttonClass = secret
    ? "inline-flex items-center justify-center rounded-2xl border border-white/15 bg-white/10 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-45"
    : "inline-flex items-center justify-center rounded-2xl border border-line bg-white/85 px-4 py-2 text-sm font-medium text-foreground transition hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-45";
  const panelClass = secret
    ? "rounded-[1.35rem] border border-[#3f2f22] bg-[#1f1812] p-5"
    : "rounded-[1.35rem] border border-line bg-white/82 p-5";
  const titleClass = secret ? "text-white" : "text-foreground";
  const descriptionClass = secret ? "text-[#d8c3ae]" : "text-muted";
  const codeClass = secret
    ? "mt-4 overflow-x-auto rounded-[1.1rem] border border-white/10 bg-black/20 p-4 font-mono text-xs leading-7 text-white"
    : "mt-4 overflow-x-auto rounded-[1.1rem] border border-line/80 bg-[#fbfaf7] p-4 font-mono text-xs leading-7 text-foreground";
  const hintClass = secret ? "text-[#d8c3ae]" : "text-muted";
  const footerClass = secret
    ? "mt-4 rounded-[1.1rem] border border-white/10 bg-black/20 p-4"
    : "mt-4 rounded-[1.1rem] border border-line/80 bg-white/85 p-4";
  const available = isAvailable(value);

  async function handleCopy() {
    if (!available) {
      return;
    }

    await copyText(value!.trim());
    setCopied(true);

    if (resetTimerRef.current !== null) {
      window.clearTimeout(resetTimerRef.current);
    }

    resetTimerRef.current = window.setTimeout(() => {
      setCopied(false);
    }, 1600);
  }

  return (
    <div className={panelClass}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <h3 className={`text-base font-semibold ${titleClass}`}>{title}</h3>
          {description ? <p className={`mt-2 text-sm leading-7 ${descriptionClass}`}>{description}</p> : null}
        </div>
        <button type="button" onClick={handleCopy} disabled={!available} className={buttonClass}>
          {copied ? copiedLabel : copyLabel}
        </button>
      </div>
      <pre className={codeClass}>{available ? value!.trim() : unavailableLabel}</pre>
      {hints.length > 0 ? (
        <div className="mt-3 space-y-2">
          {hints.map((hint) => (
            <p key={hint} className={`text-xs leading-6 ${hintClass}`}>
              {hint}
            </p>
          ))}
        </div>
      ) : null}
      {footer ? <div className={footerClass}>{footer}</div> : null}
    </div>
  );
}

export function CopyFieldList({
  locale,
  items,
  copyAllValue,
}: {
  locale: Locale;
  items: CopyFieldItem[];
  copyAllValue?: string | null;
}) {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const resetTimerRef = useRef<number | null>(null);

  const copyLabel = locale === "en" ? "Copy" : "复制";
  const copiedLabel = locale === "en" ? "Copied" : "已复制";
  const copyAllLabel = locale === "en" ? "Copy All" : "复制全部";
  const unavailableLabel = locale === "en" ? "Not configured" : "未配置";
  const buttonClass =
    "inline-flex items-center justify-center rounded-2xl border border-line bg-white/85 px-4 py-2 text-sm font-medium text-foreground transition hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-45";
  const darkButtonClass =
    "inline-flex items-center justify-center rounded-2xl border border-white/15 bg-white/10 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-45";

  function markCopied(id: string) {
    setCopiedId(id);

    if (resetTimerRef.current !== null) {
      window.clearTimeout(resetTimerRef.current);
    }

    resetTimerRef.current = window.setTimeout(() => {
      setCopiedId((current) => (current === id ? null : current));
    }, 1600);
  }

  async function handleCopy(id: string, value?: string | null) {
    if (!isAvailable(value)) {
      return;
    }

    await copyText(value!.trim());
    markCopied(id);
  }

  return (
    <div className="space-y-4">
      {isAvailable(copyAllValue) ? (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => handleCopy("__all__", copyAllValue)}
            className={buttonClass}
          >
            {copiedId === "__all__" ? copiedLabel : copyAllLabel}
          </button>
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        {items.map((item) => {
          const available = isAvailable(item.value);
          const displayValue = available
            ? item.value!.trim()
            : item.emptyValueLabel ?? unavailableLabel;
          const valueClass = item.secret
            ? "text-white"
            : available
              ? "text-foreground"
              : "text-muted";
          const hintClass = item.secret ? "text-[#d8c3ae]" : "text-muted";

          return (
            <div
              key={item.id}
              className={`rounded-[1.25rem] border p-4 ${
                item.secret
                  ? "border-[#3f2f22] bg-[#1f1812]"
                  : "border-line bg-white/82"
              } ${item.wide ? "lg:col-span-2" : ""}`}
            >
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 flex-1">
                  <p
                    className={`text-xs uppercase tracking-[0.18em] ${
                      item.secret ? "text-[#d8c3ae]" : "text-muted"
                    }`}
                  >
                    {item.label}
                  </p>
                  {item.multiline ? (
                    <pre
                      className={`mt-3 whitespace-pre-wrap break-all font-mono text-xs leading-6 ${valueClass}`}
                    >
                      {displayValue}
                    </pre>
                  ) : (
                    <p className={`mt-3 break-all font-mono text-sm ${valueClass}`}>{displayValue}</p>
                  )}
                  {item.hint ? <p className={`mt-2 text-xs leading-6 ${hintClass}`}>{item.hint}</p> : null}
                </div>
                <button
                  type="button"
                  onClick={() => handleCopy(item.id, item.value)}
                  disabled={!available}
                  className={item.secret ? darkButtonClass : buttonClass}
                >
                  {copiedId === item.id ? copiedLabel : copyLabel}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
