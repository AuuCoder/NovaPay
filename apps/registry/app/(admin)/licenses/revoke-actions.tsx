"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function LicenseRevokeActions(props: {
  id: string;
  state: "ISSUED" | "REVOKED" | "EXPIRED";
  locale: "zh" | "en";
}) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (props.state !== "ISSUED") {
    return (
      <span className="text-body-sm text-mute">
        {props.locale === "en" ? "No further action required." : "当前无需进一步操作。"}
      </span>
    );
  }

  async function handleRevoke() {
    setSubmitting(true);
    setMessage(null);
    setError(null);

    try {
      const response = await fetch(`/api/admin/licenses/${props.id}/revoke`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          reason: reason.trim(),
        }),
      });

      const payload = (await response.json()) as { message?: string };

      if (!response.ok) {
        throw new Error(
          payload.message ??
            (props.locale === "en"
              ? "Failed to revoke license."
              : "吊销授权失败。"),
        );
      }

      setMessage(props.locale === "en" ? "License revoked." : "授权已吊销。");
      router.refresh();
    } catch (revokeError) {
      setError(
        revokeError instanceof Error ? revokeError.message : String(revokeError),
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <input
        className="input"
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        placeholder={
          props.locale === "en"
            ? "Revocation reason"
            : "请输入吊销原因"
        }
      />
      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={handleRevoke}
          disabled={submitting || !reason.trim()}
        >
          {submitting
            ? props.locale === "en"
              ? "Revoking..."
              : "吊销中..."
            : props.locale === "en"
              ? "Revoke license"
              : "吊销授权"}
        </button>
        {message ? (
          <span className="text-body-sm" style={{ color: "var(--color-positive-deep)" }}>
            {message}
          </span>
        ) : null}
        {error ? (
          <span className="text-body-sm" style={{ color: "var(--color-negative-deep)" }}>
            {error}
          </span>
        ) : null}
      </div>
    </div>
  );
}
