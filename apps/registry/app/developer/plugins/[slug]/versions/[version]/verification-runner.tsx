"use client";

import { useState } from "react";

interface VerificationSessionStep {
  id: string;
  stepKey: string;
  status: string;
  errorMessage: string | null;
  resultSnapshot: Record<string, unknown> | null;
}

interface VerificationSession {
  id: string;
  status: string;
  failureReason: string | null;
  submittedConfig: Record<string, string>;
  resultSnapshot: Record<string, unknown> | null;
  steps: VerificationSessionStep[];
  createdAt: string;
  completedAt: string | null;
}

export function VerificationRunner(props: {
  slug: string;
  version: string;
  requiredConfigKeys: string[];
  labels: {
    title: string;
    run: string;
    running: string;
    config: string;
    latestResult: string;
    noRuns: string;
    statusPassed: string;
    statusFailed: string;
    failedGeneric: string;
    statusLabels: Record<string, string>;
    stepLabels: Record<string, string>;
  };
  initialSessions: VerificationSession[];
}) {
  const [sessions, setSessions] = useState(props.initialSessions);
  const [config, setConfig] = useState<Record<string, string>>(
    Object.fromEntries(props.requiredConfigKeys.map((key) => [key, ""])),
  );
  const [submitting, setSubmitting] = useState(false);

  const latestSession = sessions[0] ?? null;

  async function handleRun() {
    setSubmitting(true);
    try {
      const response = await fetch(
        `/api/developer/plugins/${props.slug}/versions/${props.version}/test-sessions`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ config }),
        },
      );
      const payload = (await response.json()) as { session?: VerificationSession; message?: string };
      if (!response.ok || !payload.session) {
        throw new Error(payload.message ?? props.labels.failedGeneric);
      }
      setSessions((current) => [payload.session!, ...current]);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="card-feature-sage" style={{ padding: 24 }}>
      <p className="text-eyebrow">{props.labels.title}</p>
      <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 12 }}>
        {props.requiredConfigKeys.map((key) => (
          <label key={key} className="label-block">
            <span className="label-text">{props.labels.config} · {key}</span>
            <input
              className="input"
              value={config[key] ?? ""}
              onChange={(event) =>
                setConfig((current) => ({
                  ...current,
                  [key]: event.target.value,
                }))
              }
            />
          </label>
        ))}
      </div>

      <button
        type="button"
        className="btn btn-primary"
        style={{ width: "100%", marginTop: 16 }}
        onClick={handleRun}
        disabled={submitting}
      >
        {submitting ? props.labels.running : props.labels.run}
      </button>

      <div style={{ marginTop: 20 }}>
        <p className="text-eyebrow">{props.labels.latestResult}</p>
        {!latestSession ? (
          <p className="text-body-sm text-mute" style={{ marginTop: 8 }}>
            {props.labels.noRuns}
          </p>
        ) : (
          <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 10 }}>
            <span className={`badge ${latestSession.status === "PASSED" ? "badge-positive" : "badge-negative"}`}>
              {latestSession.status === "PASSED"
                ? props.labels.statusPassed
                : props.labels.statusFailed}
            </span>
            {latestSession.failureReason ? (
              <p className="text-body-sm text-mute">{latestSession.failureReason}</p>
            ) : null}
            {latestSession.steps.map((step) => (
              <div key={step.id} style={{ borderTop: "1px solid var(--color-line)", paddingTop: 10 }}>
                <p className="text-body-sm-strong">
                  {props.labels.stepLabels[step.stepKey] ?? step.stepKey}
                </p>
                <p className="text-caption">
                  {props.labels.statusLabels[step.status] ?? step.status}
                </p>
                {step.errorMessage ? (
                  <p className="text-body-sm text-mute">{step.errorMessage}</p>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
