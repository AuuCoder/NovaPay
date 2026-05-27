import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentLocale } from "@/lib/i18n-server";
import { getEffectiveDeveloperIdFromSession, requireRegistryUserSession } from "../../../../lib/auth/session";
import { canDeveloperManagePlugin } from "../../../../lib/developer/plugin-ownership";
import {
  formatRegistryPluginPricing,
  getRegistryRuntime,
} from "../../../../lib/runtime/state";

export default async function DeveloperPluginDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const session = await requireRegistryUserSession();
  const locale = await getCurrentLocale();
  const { slug } = await params;
  const state = await getRegistryRuntime();
  const entry = state.catalog.find((plugin) => plugin.slug === slug);

  if (!entry) {
    notFound();
  }

  const versions = [...state.demoBundles.values()]
    .filter((bundle) => bundle.slug === slug)
    .map((bundle) => ({
      version: bundle.pipelineResult.manifest.version,
      sizeKb: Math.ceil(bundle.pipelineResult.sizeBytes / 1024),
      sha256: bundle.pipelineResult.sha256,
    }))
    .sort((left, right) => right.version.localeCompare(left.version));

  const developerId = getEffectiveDeveloperIdFromSession(session);
  const canManage = await canDeveloperManagePlugin(slug, developerId);

  const content =
    locale === "en"
      ? {
          back: "Back to plugins",
          title: "Plugin detail",
          subtitle: "A quieter operational detail view focused on ownership, versions, and metadata.",
          configurePricing: "Pricing",
          uploadNewVersion: "Upload version",
          firstUpload: "Upload guide",
          viewOnly: "Read-only",
          overview: "Overview",
          versions: "Versions",
          metadata: "Metadata",
          current: "Current",
          free: "Free",
          noLicense: "No license required",
          channel: "Channel",
          size: "Size",
          action: "Action",
          open: "Open",
          paid: "Paid",
        }
      : {
          back: "返回插件列表",
          title: "插件详情",
          subtitle: "更克制的运营详情视图，重点放在归属、版本和元数据本身。",
          configurePricing: "定价",
          uploadNewVersion: "上传版本",
          firstUpload: "上传指南",
          viewOnly: "只读",
          overview: "概览",
          versions: "版本",
          metadata: "元数据",
          current: "当前",
          free: "免费",
          noLicense: "无需许可证",
          channel: "通道",
          size: "大小",
          action: "操作",
          open: "打开",
          paid: "收费",
        };

  return (
    <section className="admin-shell">
      <div className="container admin-page">
        <div className="admin-header">
          <div className="admin-header-copy">
            <p className="text-eyebrow">{content.title}</p>
            <h1 className="admin-title">{entry.displayName}</h1>
            <p className="admin-subtitle">{entry.slug} · {entry.vendor}</p>
            <p className="text-body-sm text-mute">{content.subtitle}</p>
          </div>
          <div className="admin-toolbar">
            <Link href="/developer/plugins" className="btn btn-tertiary">
              {content.back}
            </Link>
            {canManage ? (
              <>
                <button className="btn btn-tertiary">{content.configurePricing}</button>
                <Link href={`/developer/plugins/${slug}/upload`} className="btn btn-primary">
                  {content.uploadNewVersion}
                </Link>
              </>
            ) : (
              <>
                <span className="badge badge-neutral">{content.viewOnly}</span>
                <Link href="/developer/plugins/new" className="btn btn-primary">
                  {content.firstUpload}
                </Link>
              </>
            )}
          </div>
        </div>

        <div className="grid-3">
          <div className="stat-card feature">
            <p className="stat-label">{content.current}</p>
            <p className="stat-value">v{entry.version}</p>
          </div>
          <div className="stat-card">
            <p className="stat-label">{content.configurePricing}</p>
            <p className="stat-value" style={{ fontSize: 24 }}>
              {formatRegistryPluginPricing(entry, locale)}
            </p>
            <p className="text-body-sm text-mute">
              {entry.pricingMode === "PAID" ? entry.purchaseUrl ?? "—" : content.noLicense}
            </p>
          </div>
          <div className="stat-card">
            <p className="stat-label">{content.channel}</p>
            <p className="stat-value" style={{ fontSize: 24 }}>{entry.channelCode}</p>
            <p className="text-body-sm text-mute">{entry.providerKey}</p>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1.75fr) 320px", gap: 24 }}>
          <div className="enterprise-panel">
            <div className="enterprise-grid">
              <section>
                <h2 className="text-display-xs">{content.overview}</h2>
                <p className="text-body-md text-body-color" style={{ marginTop: 12 }}>{entry.description}</p>
              </section>

              <section>
                <h2 className="text-display-xs">{content.versions}</h2>
                <div style={{ overflowX: "auto", marginTop: 12 }}>
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>{content.versions}</th>
                        <th>sha256</th>
                        <th>{content.size}</th>
                        <th style={{ textAlign: "right" }}>{content.action}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {versions.map((row) => (
                        <tr key={row.version}>
                          <td className="text-body-sm text-body-color">v{row.version}</td>
                          <td className="text-caption" style={{ fontFamily: "ui-monospace, monospace" }}>
                            {row.sha256.slice(0, 12)}…
                          </td>
                          <td className="text-body-sm text-body-color">{row.sizeKb} KB</td>
                          <td style={{ textAlign: "right" }}>
                            <Link href={`/developer/plugins/${slug}/versions/${row.version}`} className="btn btn-tertiary btn-sm">
                              {content.open}
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </div>
          </div>

          <aside className="enterprise-panel sticky-side">
            <div className="enterprise-grid">
              <section>
                <h2 className="text-display-xs">{content.metadata}</h2>
                <div style={{ marginTop: 16, display: "grid", gap: 12 }}>
                  <div className="risk-kpi">
                    <p className="risk-kpi-label">channelCode</p>
                    <p className="risk-kpi-value">{entry.channelCode}</p>
                  </div>
                  <div className="risk-kpi">
                    <p className="risk-kpi-label">providerKey</p>
                    <p className="risk-kpi-value">{entry.providerKey}</p>
                  </div>
                  <div className="risk-kpi">
                    <p className="risk-kpi-label">packageName</p>
                    <p className="risk-kpi-value" style={{ fontSize: 13 }}>{entry.packageName}</p>
                  </div>
                  <div className="risk-kpi">
                    <p className="risk-kpi-label">vendor</p>
                    <p className="risk-kpi-value">{entry.vendor}</p>
                  </div>
                </div>
              </section>
            </div>
          </aside>
        </div>
      </div>
    </section>
  );
}
