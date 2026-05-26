"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function RotateSigningKeyForm(props: {
  locale: "zh" | "en";
  copy: {
    keyId: string;
    keyIdPlaceholder: string;
    grace: string;
    gracePlaceholder: string;
    submit: string;
    submitting: string;
    success: string;
    failed: string;
  };
}) {
  const router = useRouter();
  const [keyId, setKeyId] = useState("");
  const [grace, setGrace] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleRotate() {
    setBusy(true);
    setMessage(null);
    setError(null);

    try {
      const response = await fetch("/api/admin/signing-keys/rotate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          keyId: keyId.trim() || undefined,
          minRetiredGraceMs: grace.trim() ? Number(grace.trim()) : undefined,
        }),
      });

      const payload = (await response.json()) as { message?: string; success?: boolean };
      if (!response.ok || !payload.success) {
        throw new Error(payload.message ?? props.copy.failed);
      }

      setMessage(props.copy.success);
      setKeyId("");
      setGrace("");
      router.refresh();
    } catch (rotateError) {
      setError(rotateError instanceof Error ? rotateError.message : String(rotateError));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="detail-surface">
      <div className="enterprise-grid">
        <label className="label-block">
          <span className="label-text">{props.copy.keyId}</span>
          <input
            className="input"
            value={keyId}
            onChange={(event) => setKeyId(event.target.value)}
            placeholder={props.copy.keyIdPlaceholder}
          />
        </label>
        <label className="label-block">
          <span className="label-text">{props.copy.grace}</span>
          <input
            className="input"
            value={grace}
            onChange={(event) => setGrace(event.target.value)}
            placeholder={props.copy.gracePlaceholder}
            inputMode="numeric"
          />
        </label>
        <button type="button" className="btn btn-primary" onClick={handleRotate} disabled={busy}>
          {busy ? props.copy.submitting : props.copy.submit}
        </button>
        {message ? <p className="text-body-sm" style={{ color: "var(--color-positive-deep)" }}>{message}</p> : null}
        {error ? <p className="text-body-sm" style={{ color: "var(--color-negative-deep)" }}>{error}</p> : null}
      </div>
    </div>
  );
}
