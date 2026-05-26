"use client";

import { useState } from "react";

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

export function UploadVersionForm(props: {
  slug: string;
  copy: {
    dropTitle: string;
    dropEmpty: string;
    replaceHint: (sizeKb: string) => string;
    browseHint: string;
    pricingMode: string;
    free: string;
    paid: string;
    priceLabel: string;
    priceLabelPlaceholder: string;
    billingPlan: string;
    planInstance: string;
    planMerchant: string;
    planUsage: string;
    priceAmount: string;
    currency: string;
    purchaseUrl: string;
    purchaseUrlPlaceholder: string;
    uploading: string;
    upload: string;
    clear: string;
    networkError: string;
    uploaded: string;
    deduplicated: string;
    version: string;
    sha256: string;
    signature: string;
    status: string;
  };
}) {
  const [file, setFile] = useState<File | null>(null);
  const [pricingMode, setPricingMode] = useState<"FREE" | "PAID">("FREE");
  const [pricingPlanKind, setPricingPlanKind] = useState<
    "PER_INSTANCE_ONE_TIME" | "PER_MERCHANT_SUBSCRIPTION" | "PER_USAGE"
  >("PER_INSTANCE_ONE_TIME");
  const [priceAmount, setPriceAmount] = useState("");
  const [priceCurrency, setPriceCurrency] = useState("CNY");
  const [priceLabel, setPriceLabel] = useState("");
  const [purchaseUrl, setPurchaseUrl] = useState("");
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
      formData.append("pricingMode", pricingMode);
      if (pricingMode === "PAID") {
        formData.append("pricingPlanKind", pricingPlanKind);
        formData.append("priceAmount", priceAmount.trim());
        formData.append("priceCurrency", priceCurrency.trim().toUpperCase());
      }
      if (priceLabel.trim()) {
        formData.append("priceLabel", priceLabel.trim());
      }
      if (purchaseUrl.trim()) {
        formData.append("purchaseUrl", purchaseUrl.trim());
      }

      const res = await fetch(`/api/developer/plugins/${props.slug}/versions`, {
        method: "POST",
        body: formData,
      });

      const json = (await res.json()) as UploadResult;
      setResult(json);
    } catch (err) {
      setResult({
        error: props.copy.networkError,
        message: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
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
            {file ? `${props.copy.dropTitle}: ${file.name}` : props.copy.dropEmpty}
          </p>
          <p className="text-body-sm text-mute" style={{ marginTop: 8 }}>
            {file
              ? props.copy.replaceHint((file.size / 1024).toFixed(1))
              : props.copy.browseHint}
          </p>
        </label>

        <div className="grid-2">
          <label className="label-block">
            <span className="label-text">{props.copy.pricingMode}</span>
            <select
              className="input"
              value={pricingMode}
              onChange={(event) =>
                setPricingMode(event.target.value === "PAID" ? "PAID" : "FREE")
              }
            >
              <option value="FREE">{props.copy.free}</option>
              <option value="PAID">{props.copy.paid}</option>
            </select>
          </label>

          <label className="label-block">
            <span className="label-text">{props.copy.priceLabel}</span>
            <input
              type="text"
              className="input"
              value={priceLabel}
              onChange={(event) => setPriceLabel(event.target.value)}
              placeholder={props.copy.priceLabelPlaceholder}
            />
          </label>
        </div>

        {pricingMode === "PAID" ? (
          <div
            className="grid-3"
            style={{
              display: "grid",
              gridTemplateColumns:
                "minmax(0, 1.3fr) minmax(0, 1fr) minmax(0, 0.7fr)",
              gap: 16,
            }}
          >
            <label className="label-block">
              <span className="label-text">{props.copy.billingPlan}</span>
              <select
                className="input"
                value={pricingPlanKind}
                onChange={(event) =>
                  setPricingPlanKind(
                    event.target.value as
                      | "PER_INSTANCE_ONE_TIME"
                      | "PER_MERCHANT_SUBSCRIPTION"
                      | "PER_USAGE",
                  )
                }
              >
                <option value="PER_INSTANCE_ONE_TIME">{props.copy.planInstance}</option>
                <option value="PER_MERCHANT_SUBSCRIPTION">{props.copy.planMerchant}</option>
                <option value="PER_USAGE">{props.copy.planUsage}</option>
              </select>
            </label>

            <label className="label-block">
              <span className="label-text">{props.copy.priceAmount}</span>
              <input
                type="text"
                className="input"
                inputMode="decimal"
                value={priceAmount}
                onChange={(event) => setPriceAmount(event.target.value)}
                placeholder="199.00"
              />
            </label>

            <label className="label-block">
              <span className="label-text">{props.copy.currency}</span>
              <input
                type="text"
                className="input"
                value={priceCurrency}
                onChange={(event) => setPriceCurrency(event.target.value.toUpperCase())}
                placeholder="CNY"
                maxLength={3}
              />
            </label>
          </div>
        ) : null}

        <label className="label-block">
          <span className="label-text">{props.copy.purchaseUrl}</span>
          <input
            type="url"
            className="input"
            value={purchaseUrl}
            onChange={(event) => setPurchaseUrl(event.target.value)}
            placeholder={props.copy.purchaseUrlPlaceholder}
          />
        </label>

        <div style={{ display: "flex", gap: 12 }}>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={!file || submitting}
          >
            {submitting ? props.copy.uploading : props.copy.upload}
          </button>
          {file ? (
            <button
              type="button"
              className="btn btn-tertiary"
              onClick={() => setFile(null)}
            >
              {props.copy.clear}
            </button>
          ) : null}
        </div>
      </form>

      {result ? (
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
                {result.error}
              </p>
              <p className="text-body-sm" style={{ marginTop: 8, color: "var(--color-negative-deep)" }}>
                {result.message}
              </p>
            </>
          ) : (
            <>
              <p className="text-body-md-strong" style={{ color: "var(--color-positive-deep)" }}>
                {props.copy.uploaded}{" "}
                {result.alreadyExisted ? `(${props.copy.deduplicated})` : ""}
              </p>
              <dl
                style={{
                  marginTop: 12,
                  display: "grid",
                  gridTemplateColumns: "120px 1fr",
                  rowGap: 6,
                  fontSize: 13,
                }}
              >
                <dt className="text-mute">{props.copy.version}</dt>
                <dd>{result.version}</dd>
                <dt className="text-mute">{props.copy.sha256}</dt>
                <dd style={{ fontFamily: "ui-monospace, monospace", wordBreak: "break-all" }}>
                  {result.sha256}
                </dd>
                <dt className="text-mute">{props.copy.signature}</dt>
                <dd style={{ fontFamily: "ui-monospace, monospace", wordBreak: "break-all" }}>
                  {result.signature?.slice(0, 60)}…
                </dd>
                <dt className="text-mute">{props.copy.status}</dt>
                <dd>{result.status}</dd>
              </dl>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
