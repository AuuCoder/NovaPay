import Link from "next/link";
import { requireRegistryAdminSession } from "../../../lib/auth/session";
import { getCurrentLocale } from "@/lib/i18n-server";
import {
  formatRegistryPluginPricing,
  getRegistryRuntime,
  listPluginVersionRecords,
} from "../../../lib/runtime/state";
import { getPluginOwner } from "../../../lib/developer/plugin-ownership";
import { governancePath } from "../../../lib/governance-paths";

function getReviewBadge(reviewState: string) {
  switch (reviewState) {
    case "PUBLISHED":
      return "badge badge-positive";
    case "APPROVED":
      return "badge badge-ink";
    case "SUBMITTED":
      return "badge badge-warning";
    case "REJECTED":
      return "badge badge-negative";
    default:
      return "badge badge-neutral";
  }
}

export default async function AdminPluginsPage() {
  await requireRegistryAdminSession();
  const locale = (await getCurrentLocale()) as "zh" | "en";
  const state = await getRegistryRuntime();

  const content =
    locale === "en"
      ? {
          eyebrow: "Plugin Governance",
          title: "Plugin inventory",
          subtitle:
            "A unified admin inventory for catalog entries, publisher ownership, version state, and pricing posture.",
          stats: {
            catalog: "Catalog entries",
            published: "Published",
            submitted: "Pending review",
            paid: "Paid plugins",
          },
          tableTitle: "Registry plugin ledger",
          tableNote:
            "Use this view to move from public catalog inspection into detailed review, publishing, and take-down workflows.",
          headers: {
            plugin: "Plugin",
            owner: "Owner",
            pricing: "Pricing",
            review: "Review",
            versions: "Versions",
            action: "Action",
          },
          official: "Official",
          unknown: "Unknown",
          open: "Open",
        }
      : {
          eyebrow: "插件治理",
          title: "插件总览",
          subtitle: "统一查看目录插件、发布者归属、版本状态和定价姿态，作为管理员治理入口。",
          stats: {
            catalog: "目录条目",
            published: "已发布",
            submitted: "待审核",
            paid: "收费插件",
          },
          tableTitle: "Registry 插件台账",
          tableNote: "从这张清单进入插件详情、审核、发布和下架动作，而不是只依赖隐藏路径。",
          headers: {
            plugin: "插件",
            owner: "归属",
            pricing: "定价",
            review: "审核",
            versions: "版本数",
            action: "操作",
          },
          official: "官方",
          unknown: "未知",
          open: "打开",
        };

  const rows = await Promise.all(
    state.catalog.map(async (plugin) => {
      const versions = listPluginVersionRecords(state, plugin.slug);
      const currentVersionRecord =
        versions.find((item) => item.version === plugin.version) ?? versions[0] ?? null;

      return {
        plugin,
        owner: await getPluginOwner(plugin.slug),
        versionCount: versions.length,
        currentVersionRecord,
      };
    }),
  );

  return (
    <section className="admin-shell">
      <div className="container admin-page">
        <div className="governance-hero">
          <div className="governance-hero-head">
            <div className="admin-header-copy">
              <p className="text-eyebrow">{content.eyebrow}</p>
              <h1 className="admin-title">{content.title}</h1>
              <p className="admin-subtitle">{content.subtitle}</p>
            </div>
          </div>

          <div className="governance-strip">
            <div className="governance-metric">
              <span className="governance-metric-label">{content.stats.catalog}</span>
              <span className="governance-metric-value">{rows.length}</span>
            </div>
            <div className="governance-metric">
              <span className="governance-metric-label">{content.stats.published}</span>
              <span className="governance-metric-value">
                {rows.filter((row) => row.currentVersionRecord?.reviewState === "PUBLISHED").length}
              </span>
            </div>
            <div className="governance-metric">
              <span className="governance-metric-label">{content.stats.submitted}</span>
              <span className="governance-metric-value">
                {rows.filter((row) => row.currentVersionRecord?.reviewState === "SUBMITTED").length}
              </span>
            </div>
            <div className="governance-metric">
              <span className="governance-metric-label">{content.stats.paid}</span>
              <span className="governance-metric-value">
                {rows.filter((row) => row.plugin.pricingMode === "PAID").length}
              </span>
            </div>
          </div>
        </div>

        <div className="enterprise-panel">
          <div className="table-toolbar" style={{ marginBottom: 18 }}>
            <div className="table-toolbar-copy">
              <h2 className="table-toolbar-title">{content.tableTitle}</h2>
              <p className="table-toolbar-note">{content.tableNote}</p>
            </div>
          </div>

          <div style={{ overflowX: "auto" }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>{content.headers.plugin}</th>
                  <th>{content.headers.owner}</th>
                  <th>{content.headers.pricing}</th>
                  <th>{content.headers.review}</th>
                  <th>{content.headers.versions}</th>
                  <th style={{ textAlign: "right" }}>{content.headers.action}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ plugin, owner, versionCount, currentVersionRecord }) => (
                  <tr key={plugin.slug}>
                    <td>
                      <div className="table-stack">
                        <span className="table-row-primary">{plugin.displayName}</span>
                        <span className="table-row-secondary">{plugin.slug}</span>
                      </div>
                    </td>
                    <td>
                      <div className="table-stack">
                        <span className="table-row-primary">
                          {owner ?? content.official}
                        </span>
                        <span className="table-row-secondary">{plugin.vendor || content.unknown}</span>
                      </div>
                    </td>
                    <td className="text-body-sm text-body-color">
                      {formatRegistryPluginPricing(plugin, locale)}
                    </td>
                    <td>
                      <span className={getReviewBadge(currentVersionRecord?.reviewState ?? "DRAFT")}>
                        {currentVersionRecord?.reviewState ?? "DRAFT"}
                      </span>
                    </td>
                    <td className="text-body-sm text-body-color">{versionCount}</td>
                    <td style={{ textAlign: "right" }}>
                      <Link href={governancePath(`/plugins/${plugin.slug}`)} className="btn btn-tertiary btn-sm">
                        {content.open}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  );
}
