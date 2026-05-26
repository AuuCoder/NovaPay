"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export function RegistryAutoConnect(props: {
  locale: "zh" | "en";
  title: string;
  body: string;
  retryLabel: string;
  successUrl: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) {
      return;
    }

    startedRef.current = true;
    void connect();
  }, []);

  async function connect() {
    setError(null);

    const response = await fetch("/api/internal/setup/auto-connect", {
      method: "POST",
      cache: "no-store",
    }).catch(() => null);

    const payload = (await response?.json().catch(() => null)) as
      | {
          success?: boolean;
          error?: string;
        }
      | null;

    if (!response?.ok || !payload?.success) {
      setError(
        payload?.error ??
          (props.locale === "en"
            ? "Automatic bridge connection failed."
            : "自动桥接失败。"),
      );
      return;
    }

    startTransition(() => {
      router.replace(props.successUrl);
      router.refresh();
    });
  }

  return (
    <section className="risk-card">
      <div className="risk-meta">
        <p className="risk-title">{props.title}</p>
        <p className="risk-subtitle">{props.body}</p>
      </div>

      {error ? (
        <div
          style={{
            marginTop: 16,
            padding: 12,
            borderRadius: 14,
            border: "1px solid rgba(240,68,56,0.18)",
            background: "rgba(240,68,56,0.05)",
            color: "var(--color-negative-deep)",
            fontSize: 14,
          }}
        >
          {error}
        </div>
      ) : null}

      <div style={{ marginTop: 16, display: "flex", justifyContent: "flex-end" }}>
        <button
          type="button"
          className="btn btn-primary"
          disabled={isPending}
          onClick={() => {
            void connect();
          }}
        >
          {isPending
            ? props.locale === "en"
              ? "Connecting..."
              : "连接中..."
            : props.retryLabel}
        </button>
      </div>
    </section>
  );
}
