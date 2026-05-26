"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export function RegistryPurchaseFinalizer(props: {
  slug?: string;
  locale: "zh" | "en";
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const registryPluginSlug = searchParams.get("registryPluginSlug");
    const registryOrderId = searchParams.get("registryOrderId");

    if (
      !registryPluginSlug ||
      !registryOrderId ||
      (props.slug && registryPluginSlug !== props.slug)
    ) {
      return;
    }

    let cancelled = false;

    async function run() {
      try {
        const response = await fetch("/admin/plugins/finalize-registry-purchase", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            slug: props.slug ?? registryPluginSlug,
            registryOrderId,
          }),
        });

        const payload = (await response.json()) as {
          success?: boolean;
          pending?: boolean;
          message?: string;
        };

        if (!response.ok) {
          throw new Error(
            payload.message ??
              (props.locale === "en"
                ? "Failed to finalize registry purchase."
                : "完成 Registry 购买回写失败。"),
          );
        }

        if (cancelled) {
          return;
        }

        if (payload.pending) {
          setMessage(
            props.locale === "en"
              ? "Payment is still pending. Refresh this page after checkout is completed."
              : "支付仍在处理中，请完成支付后刷新当前页面。",
          );
          return;
        }

        setMessage(
          props.locale === "en"
            ? "Registry purchase completed and license recorded."
            : "Registry 购买已完成，许可证已自动登记。",
        );

        const url = new URL(window.location.href);
        url.searchParams.delete("registryPluginSlug");
        url.searchParams.delete("registryOrderId");
        router.replace(`${url.pathname}${url.search}`, { scroll: false });
        router.refresh();
      } catch (purchaseError) {
        if (!cancelled) {
          setError(
            purchaseError instanceof Error ? purchaseError.message : String(purchaseError),
          );
        }
      }
    }

    void run();

    return () => {
      cancelled = true;
    };
  }, [props.locale, props.slug, router, searchParams]);

  if (!message && !error) {
    return null;
  }

  return (
    <div
      className="rounded-[1.25rem] border px-4 py-3 text-sm"
      style={{
        borderColor: error ? "#f1c5c0" : "#bde2d5",
        background: error ? "#fff4f1" : "#f1fbf7",
        color: error ? "#973225" : "#165746",
      }}
    >
      {error ?? message}
    </div>
  );
}
