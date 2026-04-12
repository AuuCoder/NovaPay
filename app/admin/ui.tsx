import Link from "next/link";
import type { ReactNode } from "react";
import type { BadgeTone } from "@/app/admin/support";

export const panelClass =
  "rounded-[1.5rem] border border-line bg-panel-strong shadow-[0_18px_60px_rgba(79,46,17,0.08)]";
export const inputClass =
  "w-full rounded-2xl border border-line bg-white/90 px-4 py-3 text-sm text-foreground outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20";
export const textareaClass = `${inputClass} min-h-[140px] resize-y font-mono text-xs leading-6`;
export const selectClass = inputClass;
export const buttonClass =
  "inline-flex items-center justify-center rounded-2xl bg-foreground px-4 py-2.5 text-sm font-medium text-white transition hover:opacity-90";
export const subtleButtonClass =
  "inline-flex items-center justify-center rounded-2xl border border-line bg-white/80 px-4 py-2.5 text-sm font-medium text-foreground transition hover:border-accent hover:text-accent";
export const tableWrapperClass = "overflow-hidden rounded-[1.25rem] border border-line bg-white/70";

function toneClass(tone: BadgeTone) {
  switch (tone) {
    case "success":
      return "border-[#bde2d5] bg-[#f1fbf7] text-[#165746]";
    case "warning":
      return "border-[#f3d1ab] bg-[#fff4e7] text-[#aa5a16]";
    case "danger":
      return "border-[#f1c5c0] bg-[#fff4f1] text-[#973225]";
    case "info":
      return "border-[#bfd3ff] bg-[#f2f6ff] text-[#284baf]";
    default:
      return "border-line bg-white text-muted";
  }
}

export function AdminPageHeader(props: {
  eyebrow: string;
  title: string;
  description: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.26em] text-secondary">
          {props.eyebrow}
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
          {props.title}
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-7 text-muted sm:text-base">
          {props.description}
        </p>
      </div>
      {props.actions ? <div className="flex flex-wrap gap-3">{props.actions}</div> : null}
    </div>
  );
}

export function FlashMessage({
  success,
  error,
}: {
  success?: string | null;
  error?: string | null;
}) {
  if (!success && !error) {
    return null;
  }

  return (
    <div
      className={`rounded-[1.25rem] border px-4 py-3 text-sm ${
        error
          ? "border-[#f1c5c0] bg-[#fff4f1] text-[#973225]"
          : "border-[#bde2d5] bg-[#f1fbf7] text-[#165746]"
      }`}
    >
      {error ?? success}
    </div>
  );
}

export function LabeledField(props: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block space-y-2">
      <span className="text-sm font-medium text-foreground">{props.label}</span>
      {props.children}
      {props.hint ? <span className="block text-xs leading-6 text-muted">{props.hint}</span> : null}
    </label>
  );
}

export function StatCard(props: {
  label: string;
  value: string | number;
  detail: string;
}) {
  return (
    <div className={`${panelClass} p-5`}>
      <p className="text-xs uppercase tracking-[0.22em] text-muted">{props.label}</p>
      <p className="mt-3 text-3xl font-semibold text-foreground">{props.value}</p>
      <p className="mt-2 text-sm leading-6 text-muted">{props.detail}</p>
    </div>
  );
}

export function StatusBadge({
  tone = "neutral",
  children,
}: {
  tone?: BadgeTone;
  children: ReactNode;
}) {
  return (
    <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium ${toneClass(tone)}`}>
      {children}
    </span>
  );
}

export function AdminNavLink({
  href,
  active,
  label,
  detail,
}: {
  href: string;
  active?: boolean;
  label: string;
  detail: string;
}) {
  return (
    <Link
      href={href}
      className={`block rounded-[1.25rem] border px-4 py-3 transition ${
        active
          ? "border-accent bg-accent text-white shadow-[0_16px_40px_rgba(217,108,31,0.28)]"
          : "border-line bg-white/75 text-foreground hover:border-accent/50"
      }`}
    >
      <p className="text-sm font-semibold">{label}</p>
      <p className={`mt-1 text-xs leading-5 ${active ? "text-white/85" : "text-muted"}`}>{detail}</p>
    </Link>
  );
}

export function EmptyState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className={`${panelClass} border-dashed p-8 text-center`}>
      <p className="text-lg font-semibold text-foreground">{title}</p>
      <p className="mt-2 text-sm leading-7 text-muted">{description}</p>
    </div>
  );
}

export function PaginationNav({
  summary,
  previousHref,
  previousLabel,
  nextHref,
  nextLabel,
}: {
  summary: ReactNode;
  previousHref?: string | null;
  previousLabel: string;
  nextHref?: string | null;
  nextLabel: string;
}) {
  return (
    <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-xs text-muted">{summary}</p>
      <div className="flex flex-wrap gap-3">
        {previousHref ? (
          <Link href={previousHref} className={subtleButtonClass}>
            {previousLabel}
          </Link>
        ) : (
          <span className={`${subtleButtonClass} cursor-not-allowed opacity-45`}>{previousLabel}</span>
        )}
        {nextHref ? (
          <Link href={nextHref} className={subtleButtonClass}>
            {nextLabel}
          </Link>
        ) : (
          <span className={`${subtleButtonClass} cursor-not-allowed opacity-45`}>{nextLabel}</span>
        )}
      </div>
    </div>
  );
}
