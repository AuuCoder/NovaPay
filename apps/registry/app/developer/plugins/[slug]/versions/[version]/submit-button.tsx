"use client";

import { useState } from "react";

export function SubmitVersionButton(props: {
  slug: string;
  version: string;
  label: string;
  runningLabel: string;
  successLabel: string;
  failedLabel: string;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleSubmit() {
    setSubmitting(true);
    setMessage(null);
    try {
      const response = await fetch(
        `/api/developer/plugins/${props.slug}/versions/${props.version}/submit`,
        {
          method: "POST",
        },
      );
      const payload = (await response.json()) as { message?: string };
      if (!response.ok) {
        throw new Error(payload.message ?? props.failedLabel);
      }
      setMessage(props.successLabel);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        className="btn btn-primary"
        style={{ width: "100%", marginTop: 16 }}
        onClick={handleSubmit}
        disabled={submitting}
      >
        {submitting ? props.runningLabel : props.label}
      </button>
      {message ? (
        <p className="text-caption" style={{ marginTop: 8 }}>
          {message}
        </p>
      ) : null}
    </div>
  );
}
