"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export function AuthStatusModal(props: {
  tone: "error" | "success";
  title: string;
  message: string;
  closeLabel: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(true);

  useEffect(() => {
    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, []);

  useEffect(() => {
    if (!open) {
      const timer = window.setTimeout(() => {
        startTransition(() => {
          const url = new URL(window.location.href);
          url.searchParams.delete("error");
          url.searchParams.delete("success");
          router.replace(`${url.pathname}${url.search}${url.hash}`, { scroll: false });
        });
      }, 80);

      return () => window.clearTimeout(timer);
    }
  }, [open, router, startTransition]);

  if (!open) {
    return null;
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        display: "grid",
        placeItems: "center",
        padding: 24,
        background: "rgba(9, 17, 29, 0.36)",
        backdropFilter: "blur(10px)",
      }}
      onClick={() => setOpen(false)}
    >
      <div
        className="card"
        style={{
          width: "min(100%, 440px)",
          gap: 14,
          padding: 24,
          borderRadius: 20,
          borderColor:
            props.tone === "error"
              ? "rgba(240, 68, 56, 0.18)"
              : "rgba(18, 183, 106, 0.18)",
          boxShadow: "0 24px 72px rgba(15, 23, 42, 0.18)",
        }}
        onClick={(event) => event.stopPropagation()}
      >
        <div
          style={{
            display: "inline-flex",
            width: 42,
            height: 42,
            borderRadius: 9999,
            alignItems: "center",
            justifyContent: "center",
            background:
              props.tone === "error"
                ? "rgba(240, 68, 56, 0.10)"
                : "rgba(18, 183, 106, 0.10)",
            color:
              props.tone === "error"
                ? "var(--color-negative-deep)"
                : "var(--color-positive-deep)",
            fontWeight: 800,
            fontSize: 18,
          }}
        >
          {props.tone === "error" ? "!" : "✓"}
        </div>
        <h2 className="text-display-xs">{props.title}</h2>
        <p className="text-body-md text-body-color">{props.message}</p>
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button type="button" className="btn btn-primary btn-sm" disabled={isPending} onClick={() => setOpen(false)}>
            {props.closeLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
