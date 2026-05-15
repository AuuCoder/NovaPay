"use client";

import { useState } from "react";
import Link from "next/link";
import { use } from "react";

interface UploadResult {
  slug?: string;
  version?: string;
  sha256?: string;
  signature?: string;
  signatureKeyId?: string;
  sizeBytes?: number;
  status?: string;
  alreadyExisted?: boolean;
  error?: string;
  message?: string;
}

export default function UploadVersionPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<UploadResult | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!file) return;

    setSubmitting(true);
    setResult(null);

    try {
      const formData = new FormData();
      formData.append("package", file);

      const res = await fetch(`/api/developer/plugins/${slug}/versions`, {
        method: "POST",
        body: formData,
      });

      const json = (await res.json()) as UploadResult;
      setResult(json);
    } catch (err) {
      setResult({
        error: "NETWORK_ERROR",
        message: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <section className="hero-band">
        <div className="container">
          <Link
            href={`/developer/plugins/${slug}`}
            className="text-body-sm"
            style={{ color: "var(--color-positive-deep)", fontWeight: 600 }}
          >
            ← Back to plugin
          </Link>
          <p className="text-eyebrow" style={{ marginTop: 16 }}>Upload</p>
          <h1 className="text-display-md" style={{ marginTop: 8 }}>Upload a new version</h1>
          <p className="text-lead" style={{ marginTop: 12, maxWidth: 640 }}>
            Drop a signed bundle (tar.gz, JSON, or zip) up to 50&nbsp;MB. The
            registry verifies the manifest, computes sha256, signs with the
            active Ed25519 key, and queues a static scan.
          </p>
        </div>
      </section>

      <section className="content-band">
        <div className="container" style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.4fr) minmax(0, 1fr)", gap: 32 }}>
          <div className="card card-lg">
            <form onSubmit={handleSubmit} className="flex-col" style={{ gap: 20 }}>
              <label
                style={{
                  border: "2px dashed var(--color-line-strong)",
                  borderRadius: 16,
                  padding: 32,
                  display: "block",
                  cursor: "pointer",
                  textAlign: "center",
                  background: file ? "var(--color-primary-pale)" : "var(--color-canvas-soft)",
                }}
              >
                <input
                  type="file"
                  accept=".tar.gz,.tgz,.zip,.json,application/gzip,application/json"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  style={{ display: "none" }}
                />
                <p className="text-display-xs">
                  {file ? "📦 " + file.name : "Drop your bundle here"}
                </p>
                <p className="text-body-sm text-mute" style={{ marginTop: 8 }}>
                  {file
                    ? `${(file.size / 1024).toFixed(1)} KB · click to replace`
                    : "or click to browse · tar.gz / json / zip"}
                </p>
              </label>

              <div style={{ display: "flex", gap: 12 }}>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={!file || submitting}
                >
                  {submitting ? "Uploading…" : "Upload version"}
                </button>
                {file && (
                  <button
                    type="button"
                    className="btn btn-tertiary"
                    onClick={() => setFile(null)}
                  >
                    Clear
                  </button>
                )}
              </div>
            </form>

            {result && (
              <div
                style={{
                  marginTop: 24,
                  padding: 20,
                  borderRadius: 16,
                  background: result.error
                    ? "var(--color-negative-bg)"
                    : "var(--color-primary-pale)",
                }}
              >
                {result.error ? (
                  <>
                    <p className="text-body-md-strong" style={{ color: "var(--color-negative-deep)" }}>
                      ⚠️ {result.error}
                    </p>
                    <p className="text-body-sm" style={{ marginTop: 8, color: "var(--color-negative-deep)" }}>
                      {result.message}
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-body-md-strong" style={{ color: "var(--color-positive-deep)" }}>
                      ✓ Uploaded {result.alreadyExisted ? "(deduplicated)" : ""}
                    </p>
                    <dl style={{ marginTop: 12, display: "grid", gridTemplateColumns: "120px 1fr", rowGap: 6, fontSize: 13 }}>
                      <dt className="text-mute">Version</dt>
                      <dd>{result.version}</dd>
                      <dt className="text-mute">sha256</dt>
                      <dd style={{ fontFamily: "ui-monospace, monospace", wordBreak: "break-all" }}>
                        {result.sha256}
                      </dd>
                      <dt className="text-mute">Signature</dt>
                      <dd style={{ fontFamily: "ui-monospace, monospace", wordBreak: "break-all" }}>
                        {result.signature?.slice(0, 60)}…
                      </dd>
                      <dt className="text-mute">Status</dt>
                      <dd>{result.status}</dd>
                    </dl>
                  </>
                )}
              </div>
            )}
          </div>

          <div className="card-feature-sage" style={{ padding: 24 }}>
            <p className="text-eyebrow">What happens next</p>
            <ol style={{ marginTop: 16, paddingLeft: 20, display: "flex", flexDirection: "column", gap: 12, fontSize: 14 }}>
              <li>The bundle is extracted and the manifest is validated.</li>
              <li>sha256 + Ed25519 signature are computed and persisted.</li>
              <li>A static scan job runs against your code.</li>
              <li>The version enters the <strong>DRAFT</strong> state.</li>
              <li>You submit it for review when ready.</li>
            </ol>
          </div>
        </div>
      </section>
    </>
  );
}
