"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { RegistryPaidPricingPlanKind } from "../../../../lib/runtime/state";

const PLAN_KIND_OPTIONS: Array<{ value: RegistryPaidPricingPlanKind; zh: string; en: string }> = [
  { value: "PER_INSTANCE_ONE_TIME", zh: "按实例一次性", en: "One-time per instance" },
  { value: "PER_MERCHANT_SUBSCRIPTION", zh: "按商户订阅", en: "Subscription per merchant" },
  { value: "PER_USAGE", zh: "按量计费", en: "Usage based" },
];

export function PricingEditor(props: {
  slug: string;
  locale: "zh" | "en";
  pricingMode: "FREE" | "PAID";
  pricingPlanKind: RegistryPaidPricingPlanKind | null;
  priceAmountCents: number | null;
  priceCurrency: string | null;
  priceLabel: string | null;
  purchaseUrl: string | null;
  formattedPricing: string;
}) {
  const router = useRouter();
  const [pricingMode, setPricingMode] = useState<"FREE" | "PAID">(props.pricingMode);
  const [pricingPlanKind, setPricingPlanKind] = useState<RegistryPaidPricingPlanKind>(
    props.pricingPlanKind ?? "PER_INSTANCE_ONE_TIME",
  );
  const [priceAmount, setPriceAmount] = useState(
    props.priceAmountCents ? (props.priceAmountCents / 100).toFixed(2) : "",
  );
  const [priceCurrency, setPriceCurrency] = useState(props.priceCurrency ?? "CNY");
  const [priceLabel, setPriceLabel] = useState(props.priceLabel ?? "");
  const [purchaseUrl, setPurchaseUrl] = useState(props.purchaseUrl ?? "");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const copy =
    props.locale === "en"
      ? {
          title: "Pricing management",
          desc: "Set the public pricing emitted by the remote registry catalog. Changes are persisted to the bundle metadata so restarts do not reset the price.",
          current: "Current pricing",
          mode: "Pricing mode",
          free: "Free",
          paid: "Paid",
          plan: "Billing plan",
          amount: "Amount",
          currency: "Currency",
          label: "Price label",
          labelHelp: "Optional. If empty, NovaPay generates a label from amount and plan.",
          purchaseUrl: "Purchase URL",
          purchaseUrlHelp: "Optional external checkout/help URL shown to consumers.",
          save: "Save pricing",
          saving: "Saving...",
          saved: "Pricing updated.",
          failed: "Failed to update pricing.",
        }
      : {
          title: "定价管理",
          desc: "设置远程插件目录对外暴露的价格。变更会写入插件包元数据，服务重启后不会丢失。",
          current: "当前定价",
          mode: "定价模式",
          free: "免费",
          paid: "收费",
          plan: "计费计划",
          amount: "金额",
          currency: "币种",
          label: "价格展示文案",
          labelHelp: "可选。留空时会按金额和计费计划自动生成。",
          purchaseUrl: "购买链接",
          purchaseUrlHelp: "可选，消费者侧展示的外部购买/说明链接。",
          save: "保存定价",
          saving: "保存中...",
          saved: "定价已更新。",
          failed: "更新定价失败。",
        };

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);

    try {
      const response = await fetch(`/api/admin/plugins/${props.slug}/pricing`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pricingMode,
          pricingPlanKind: pricingMode === "PAID" ? pricingPlanKind : null,
          priceAmount: pricingMode === "PAID" ? priceAmount : null,
          priceCurrency: pricingMode === "PAID" ? priceCurrency : null,
          priceLabel,
          purchaseUrl,
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.message || payload?.error || copy.failed);
      }
      setMessage(copy.saved);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="enterprise-panel" style={{ marginTop: 24 }}>
      <div className="risk-card">
        <div className="risk-card-head">
          <div className="risk-meta">
            <p className="risk-title">{copy.title}</p>
            <p className="risk-subtitle">{copy.desc}</p>
          </div>
          <span className="badge badge-ink">{copy.current}: {props.formattedPricing}</span>
        </div>

        <form onSubmit={submit} style={{ display: "grid", gap: 16, marginTop: 18 }}>
          <label className="form-field">
            <span className="label-text">{copy.mode}</span>
            <select
              className="input"
              value={pricingMode}
              onChange={(event) => setPricingMode(event.target.value === "PAID" ? "PAID" : "FREE")}
              disabled={busy}
            >
              <option value="FREE">{copy.free}</option>
              <option value="PAID">{copy.paid}</option>
            </select>
          </label>

          {pricingMode === "PAID" ? (
            <div className="grid-3">
              <label className="form-field">
                <span className="label-text">{copy.plan}</span>
                <select
                  className="input"
                  value={pricingPlanKind}
                  onChange={(event) => setPricingPlanKind(event.target.value as RegistryPaidPricingPlanKind)}
                  disabled={busy}
                >
                  {PLAN_KIND_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {props.locale === "en" ? option.en : option.zh}
                    </option>
                  ))}
                </select>
              </label>

              <label className="form-field">
                <span className="label-text">{copy.amount}</span>
                <input
                  className="input"
                  value={priceAmount}
                  onChange={(event) => setPriceAmount(event.target.value)}
                  placeholder="99.00"
                  inputMode="decimal"
                  disabled={busy}
                />
              </label>

              <label className="form-field">
                <span className="label-text">{copy.currency}</span>
                <input
                  className="input"
                  value={priceCurrency}
                  onChange={(event) => setPriceCurrency(event.target.value.toUpperCase())}
                  placeholder="CNY"
                  maxLength={3}
                  disabled={busy}
                />
              </label>
            </div>
          ) : null}

          <label className="form-field">
            <span className="label-text">{copy.label}</span>
            <input
              className="input"
              value={priceLabel}
              onChange={(event) => setPriceLabel(event.target.value)}
              placeholder={pricingMode === "PAID" ? "CNY 99.00 / instance" : ""}
              disabled={busy}
            />
            <span className="text-caption text-mute">{copy.labelHelp}</span>
          </label>

          <label className="form-field">
            <span className="label-text">{copy.purchaseUrl}</span>
            <input
              className="input"
              value={purchaseUrl}
              onChange={(event) => setPurchaseUrl(event.target.value)}
              placeholder="https://example.com/buy"
              disabled={busy}
            />
            <span className="text-caption text-mute">{copy.purchaseUrlHelp}</span>
          </label>

          <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <button type="submit" className="btn btn-primary btn-sm" disabled={busy}>
              {busy ? copy.saving : copy.save}
            </button>
            {message ? <p className="text-caption">{message}</p> : null}
          </div>
        </form>
      </div>
    </div>
  );
}
