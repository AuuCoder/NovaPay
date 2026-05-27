"use client";

import { useState } from "react";

export function SettlementSettingsForm(props: {
  locale: "zh" | "en";
  initialSettings: {
    developerRevenueSharePercent: number;
    platformRevenueSharePercent: number;
    payoutHoldDays: number;
    registryNovaPayMerchantCode: string | null;
    registryNovaPayApiKeyId: string | null;
    registryNovaPayApiKeySecret: string | null;
    registryNovaPayNotifySecret: string | null;
    registryNovaPayApiKeySecretMasked?: string | null;
    registryNovaPayNotifySecretMasked?: string | null;
    registryNovaPayChannelCode: string | null;
    updatedAt: string;
  };
}) {
  const [developerShare, setDeveloperShare] = useState(
    String(props.initialSettings.developerRevenueSharePercent),
  );
  const [holdDays, setHoldDays] = useState(String(props.initialSettings.payoutHoldDays));
  const [merchantCode, setMerchantCode] = useState(props.initialSettings.registryNovaPayMerchantCode ?? "");
  const [apiKeyId, setApiKeyId] = useState(props.initialSettings.registryNovaPayApiKeyId ?? "");
  const [apiKeySecret, setApiKeySecret] = useState("");
  const [notifySecret, setNotifySecret] = useState("");
  const [channelCode, setChannelCode] = useState(props.initialSettings.registryNovaPayChannelCode ?? "alipay.page");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setMessage(null);
    setError(null);

    try {
      const response = await fetch("/api/admin/settlement-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          developerRevenueSharePercent: Number(developerShare),
          payoutHoldDays: Number(holdDays),
          registryNovaPayMerchantCode: merchantCode.trim() || null,
          registryNovaPayApiKeyId: apiKeyId.trim() || null,
          registryNovaPayApiKeySecret: apiKeySecret.trim() || null,
          registryNovaPayNotifySecret: notifySecret.trim() || null,
          registryNovaPayChannelCode: channelCode.trim() || null,
        }),
      });
      const payload = (await response.json()) as { settings?: unknown; message?: string };

      if (!response.ok || !payload.settings) {
        throw new Error(payload.message || "Failed to update settlement settings.");
      }

      setMessage(props.locale === "en" ? "Saved." : "已保存。");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div className="enterprise-panel">
      <div className="enterprise-grid">
        <div className="grid-2">
          <label className="label-block">
            <span className="label-text">{props.locale === "en" ? "Developer revenue share (%)" : "开发者分成比例（%）"}</span>
            <input className="input" value={developerShare} onChange={(event) => setDeveloperShare(event.target.value)} />
          </label>
          <label className="label-block">
            <span className="label-text">{props.locale === "en" ? "Payout hold days" : "打款冻结天数"}</span>
            <input className="input" value={holdDays} onChange={(event) => setHoldDays(event.target.value)} />
          </label>
        </div>

        <div className="grid-2">
          <label className="label-block">
            <span className="label-text">{props.locale === "en" ? "Registry merchant code" : "Registry 商户编码"}</span>
            <input className="input" value={merchantCode} onChange={(event) => setMerchantCode(event.target.value)} />
          </label>
          <label className="label-block">
            <span className="label-text">{props.locale === "en" ? "Registry API key ID" : "Registry API Key ID"}</span>
            <input className="input" value={apiKeyId} onChange={(event) => setApiKeyId(event.target.value)} />
          </label>
        </div>

        <div className="grid-2">
          <label className="label-block">
            <span className="label-text">{props.locale === "en" ? "Registry API key secret" : "Registry API Key Secret"}</span>
            <input className="input" value={apiKeySecret} onChange={(event) => setApiKeySecret(event.target.value)} />
            {props.initialSettings.registryNovaPayApiKeySecretMasked ? (
              <span className="text-caption">
                {props.locale === "en" ? "Current:" : "当前："} {props.initialSettings.registryNovaPayApiKeySecretMasked}
              </span>
            ) : null}
          </label>
          <label className="label-block">
            <span className="label-text">{props.locale === "en" ? "Registry callback notify secret" : "Registry 回调签名密钥"}</span>
            <input className="input" value={notifySecret} onChange={(event) => setNotifySecret(event.target.value)} />
            {props.initialSettings.registryNovaPayNotifySecretMasked ? (
              <span className="text-caption">
                {props.locale === "en" ? "Current:" : "当前："} {props.initialSettings.registryNovaPayNotifySecretMasked}
              </span>
            ) : null}
          </label>
        </div>

        <div className="grid-2">
          <label className="label-block">
            <span className="label-text">{props.locale === "en" ? "Bridge channel code" : "桥接支付通道编码"}</span>
            <input className="input" value={channelCode} onChange={(event) => setChannelCode(event.target.value)} />
          </label>
        </div>

        <div className="risk-kpi">
          <p className="risk-kpi-label">{props.locale === "en" ? "Last updated" : "最后更新时间"}</p>
          <p className="risk-kpi-value">{new Date(props.initialSettings.updatedAt).toLocaleString(props.locale === "en" ? "en-US" : "zh-CN", { timeZone: "Asia/Shanghai", hour12: false })}</p>
        </div>

        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <button type="button" className="btn btn-primary" onClick={handleSave}>
            {props.locale === "en" ? "Save policy" : "保存策略"}
          </button>
          {message ? <span className="text-body-sm" style={{ color: "var(--color-positive-deep)" }}>{message}</span> : null}
          {error ? <span className="text-body-sm" style={{ color: "var(--color-negative-deep)" }}>{error}</span> : null}
        </div>
      </div>
    </div>
  );
}
