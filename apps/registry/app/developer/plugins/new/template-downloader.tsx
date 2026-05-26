"use client";

import { useMemo, useState } from "react";

export function TemplateDownloader(props: {
  locale: "zh" | "en";
  labels: {
    slug: string;
    preset: string;
    providerKey: string;
    channelCode: string;
    vendor: string;
    displayName: string;
    packageName: string;
    description: string;
    download: string;
    sampleUpload: string;
    presetWxpay: string;
    presetAlipay: string;
    presetCrypto: string;
    presetGeneric: string;
  };
}) {
  const defaults =
    props.locale === "en"
      ? {
          vendor: "Acme Payments",
          displayName: "Acme WeChat Native Plus",
          description: "Third-party payment plugin for NovaPay Registry.",
          alipayDisplayName: "Acme Alipay Web",
          cryptoDisplayName: "Acme USDT On-chain",
          genericDisplayName: "Acme Third-Party Checkout",
        }
      : {
          vendor: "Acme 支付",
          displayName: "Acme 微信原生增强版",
          description: "用于 NovaPay Registry 的第三方支付插件。",
          alipayDisplayName: "Acme 支付宝网页支付",
          cryptoDisplayName: "Acme USDT 链上支付",
          genericDisplayName: "Acme 第三方聚合收银",
        };
  const [slug, setSlug] = useState("acme.wxpay-native-plus");
  const [preset, setPreset] = useState<"wxpay" | "alipay" | "crypto" | "generic">("wxpay");
  const [providerKey, setProviderKey] = useState("wxpay");
  const [channelCode, setChannelCode] = useState("wxpay.native.custom");
  const [vendor, setVendor] = useState(defaults.vendor);
  const [displayName, setDisplayName] = useState(defaults.displayName);
  const [packageName, setPackageName] = useState("@acme/plugin-wxpay-native-plus");
  const [description, setDescription] = useState(defaults.description);

  const uploadHref = useMemo(() => `/developer/plugins/${slug}/upload`, [slug]);

  const downloadHref = useMemo(() => {
    const params = new URLSearchParams({
      slug,
      preset,
      providerKey,
      channelCode,
      vendor,
      displayName,
      packageName,
      description,
    });
    return `/api/developer/plugin-template?${params.toString()}`;
  }, [slug, preset, providerKey, channelCode, vendor, displayName, packageName, description]);

  return (
    <div className="card card-lg" style={{ display: "grid", gap: 20 }}>
      <div className="grid-2">
        <label className="label-block">
          <span className="label-text">{props.labels.slug}</span>
          <input className="input" value={slug} onChange={(event) => setSlug(event.target.value)} />
        </label>

        <label className="label-block">
          <span className="label-text">{props.labels.preset}</span>
          <select
            className="input"
            value={preset}
            onChange={(event) => {
              const nextPreset = event.target.value as "wxpay" | "alipay" | "crypto" | "generic";
              setPreset(nextPreset);

              if (nextPreset === "alipay") {
                setProviderKey("alipay");
                setChannelCode("alipay.page.custom");
                setDisplayName(defaults.alipayDisplayName);
              } else if (nextPreset === "crypto") {
                setProviderKey("crypto");
                setChannelCode("usdt.custom");
                setDisplayName(defaults.cryptoDisplayName);
              } else if (nextPreset === "generic") {
                setProviderKey("thirdparty");
                setChannelCode("thirdparty.checkout.custom");
                setDisplayName(defaults.genericDisplayName);
              } else {
                setProviderKey("wxpay");
                setChannelCode("wxpay.native.custom");
                setDisplayName(defaults.displayName);
              }
            }}
          >
            <option value="wxpay">{props.labels.presetWxpay}</option>
            <option value="alipay">{props.labels.presetAlipay}</option>
            <option value="crypto">{props.labels.presetCrypto}</option>
            <option value="generic">{props.labels.presetGeneric}</option>
          </select>
        </label>

        <label className="label-block">
          <span className="label-text">{props.labels.providerKey}</span>
          <input className="input" value={providerKey} onChange={(event) => setProviderKey(event.target.value)} />
        </label>
      </div>

      <div className="grid-2">
        <label className="label-block">
          <span className="label-text">{props.labels.channelCode}</span>
          <input className="input" value={channelCode} onChange={(event) => setChannelCode(event.target.value)} />
        </label>
        <label className="label-block">
          <span className="label-text">{props.labels.vendor}</span>
          <input className="input" value={vendor} onChange={(event) => setVendor(event.target.value)} />
        </label>
      </div>

      <div className="grid-2">
        <label className="label-block">
          <span className="label-text">{props.labels.displayName}</span>
          <input className="input" value={displayName} onChange={(event) => setDisplayName(event.target.value)} />
        </label>
        <label className="label-block">
          <span className="label-text">{props.labels.packageName}</span>
          <input className="input" value={packageName} onChange={(event) => setPackageName(event.target.value)} />
        </label>
      </div>

      <label className="label-block">
        <span className="label-text">{props.labels.description}</span>
        <input className="input" value={description} onChange={(event) => setDescription(event.target.value)} />
      </label>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <a href={downloadHref} className="btn btn-primary">
          {props.labels.download}
        </a>
        <a href={uploadHref} className="btn btn-tertiary">
          {props.labels.sampleUpload}
        </a>
      </div>
    </div>
  );
}
