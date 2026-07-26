import { notFound } from "next/navigation";
import { requireRegistryAdminSession } from "../../../../lib/auth/session";
import { getCurrentLocale } from "@/lib/i18n-server";
import type {
  CatalogEntry,
  PluginVersionRecord,
} from "../../../../lib/runtime/state";
import {
  formatRegistryPluginPricing,
  getRegistryRuntime,
  listPluginVersionRecords,
  listPluginVersionTestSessions,
} from "../../../../lib/runtime/state";
import { isOfficialPluginSlug } from "../../../../lib/plugins/official";
import { PricingEditor } from "./pricing-editor";
import { ReviewActions } from "./review-actions";
import { summarizeVerificationSession } from "../../verification-summary";

function getStatusBadge(status: string) {
  switch (status) {
    case "PASSED":
      return "badge badge-positive";
    case "FAILED":
      return "badge badge-negative";
    case "NO_TEST":
      return "badge badge-warning";
    case "MISSING_PROFILE":
      return "badge badge-negative";
    case "EXEMPT":
      return "badge badge-ink";
    default:
      return "badge badge-neutral";
  }
}

export default async function AdminPluginDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  await requireRegistryAdminSession();
  const locale = await getCurrentLocale();
  const { slug } = await params;
  const state = await getRegistryRuntime();
  const plugin = state.catalog.find((entry: CatalogEntry) => entry.slug === slug);
  const versions = listPluginVersionRecords(state, slug);

  if (!plugin && versions.length === 0) {
    notFound();
  }

  return (
    <section className="admin-shell">
      <div className="container admin-page">
        <div className="admin-header">
          <div className="admin-header-copy">
            <p className="text-eyebrow">{locale === "en" ? "Governance Plugin Review" : "治理插件审核"}</p>
            <h1 className="admin-title">{plugin?.displayName ?? slug}</h1>
            <p className="admin-subtitle">
              {locale === "en"
                ? "Review operational metadata, publisher self-test evidence, and version state before approving or publishing the plugin."
                : "在批准或发布插件前，查看运营元数据、发布者自测凭证和版本状态。"}
            </p>
          </div>
        </div>

        {plugin ? (
          <>
            <div className="grid-3">
              <div className="stat-card feature">
                <p className="stat-label">{locale === "en" ? "Channel Code" : "通道编码"}</p>
                <p className="stat-value" style={{ fontSize: 24 }}>{plugin.channelCode}</p>
                <p className="text-body-sm text-mute">{plugin.slug}</p>
              </div>
              <div className="stat-card">
                <p className="stat-label">{locale === "en" ? "Pricing" : "定价"}</p>
                <p className="stat-value" style={{ fontSize: 24 }}>
                  {formatRegistryPluginPricing(plugin, locale)}
                </p>
                <p className="text-body-sm text-mute">{plugin.vendor}</p>
              </div>
              <div className="stat-card">
                <p className="stat-label">{locale === "en" ? "Public Version" : "公开版本"}</p>
                <p className="stat-value" style={{ fontSize: 24 }}>{plugin.version}</p>
                <p className="text-body-sm text-mute">{plugin.packageName}</p>
              </div>
            </div>

            <PricingEditor
              slug={plugin.slug}
              locale={locale}
              pricingMode={plugin.pricingMode}
              pricingPlanKind={plugin.pricingPlanKind}
              priceAmountCents={plugin.priceAmountCents}
              priceCurrency={plugin.priceCurrency}
              priceLabel={plugin.priceLabel}
              purchaseUrl={plugin.purchaseUrl}
              formattedPricing={formatRegistryPluginPricing(plugin, locale)}
            />
          </>
        ) : null}

        <div className="enterprise-panel">
          <div className="enterprise-grid">
            {versions.map((record: PluginVersionRecord) => {
              const sessions = listPluginVersionTestSessions({
                state,
                pluginSlug: record.slug,
                version: record.version,
              });
              const bundle = state.demoBundles.get(`${record.slug}@${record.version}`) ?? null;
              const latestSession = summarizeVerificationSession({
                session: sessions[0] ?? null,
                manifest: bundle?.pipelineResult.manifest ?? null,
                officialPlugin: isOfficialPluginSlug(record.slug),
              });

              return (
                <article key={`${record.slug}@${record.version}`} className="risk-card">
                  <div className="risk-card-head">
                    <div className="risk-meta">
                      <p className="risk-title">{locale === "en" ? "Version" : "版本"} {record.version}</p>
                      <p className="risk-subtitle">
                        {(locale === "en" ? "Review state" : "审核状态")} {record.reviewState} · {(locale === "en" ? "Updated" : "更新于")} {record.updatedAt.toISOString()}
                      </p>
                    </div>
                    <span className={getStatusBadge(latestSession?.status ?? "UNKNOWN")}>
                      {latestSession?.status ?? "UNKNOWN"}
                    </span>
                  </div>

                  <div className="risk-kpis">
                    <div className="risk-kpi">
                      <p className="risk-kpi-label">{locale === "en" ? "Self-test mode" : "自测模式"}</p>
                      <p className="risk-kpi-value">{latestSession?.createPaymentMode ?? "—"}</p>
                    </div>
                    <div className="risk-kpi">
                      <p className="risk-kpi-label">{locale === "en" ? "Create payment" : "创建支付"}</p>
                      <p className="risk-kpi-value">{latestSession?.createPaymentStatus ?? "—"}</p>
                    </div>
                    <div className="risk-kpi">
                      <p className="risk-kpi-label">{locale === "en" ? "Config keys" : "参数键"}</p>
                      <p className="risk-kpi-value">
                        {latestSession?.submittedConfigKeys.length ?? 0}
                      </p>
                    </div>
                    <div className="risk-kpi">
                      <p className="risk-kpi-label">{locale === "en" ? "Completed at" : "完成时间"}</p>
                      <p className="risk-kpi-value">{latestSession?.completedAt ?? "—"}</p>
                    </div>
                  </div>

                  <div className="card-feature-sage" style={{ padding: 18 }}>
                    <p className="text-eyebrow">{locale === "en" ? "Publisher self-test evidence" : "发布者自测凭证"}</p>
                    {latestSession ? (
                      <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
                        <p className="text-body-sm text-body-color">
                          {(locale === "en" ? "Ran at" : "执行时间")}：{latestSession.createdAt || "—"}
                        </p>
                        <p className="text-body-sm text-body-color">
                          {(locale === "en" ? "Config keys" : "参数键")}：{latestSession.submittedConfigKeys.length > 0 ? latestSession.submittedConfigKeys.join(", ") : "—"}
                        </p>
                      </div>
                    ) : (
                      <p className="text-body-sm text-mute" style={{ marginTop: 12 }}>
                        {locale === "en" ? "No publisher self-test record." : "当前没有发布者自测记录。"}
                      </p>
                    )}
                  </div>

                  <ReviewActions
                    slug={record.slug}
                    version={record.version}
                    reviewState={record.reviewState}
                    locale={locale}
                  />
                </article>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
