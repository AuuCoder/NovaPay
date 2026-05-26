import Link from "next/link";
import { requireRegistryAdminSession } from "../../../lib/auth/session";
import { getCurrentLocale } from "@/lib/i18n-server";
import {
  getRegistryRuntime,
  listAllPluginVersionRecords,
} from "../../../lib/runtime/state";
import { governancePath } from "../../../lib/governance-paths";

function formatCny(cents: number) {
  return `¥${(cents / 100).toFixed(2)}`;
}

export default async function AdminOverviewPage() {
  await requireRegistryAdminSession();
  const locale = (await getCurrentLocale()) as "zh" | "en";
  const state = await getRegistryRuntime();

  const [licenses, payouts, orders, trustAnchors] = await Promise.all([
    state.licenseStore.listAll(),
    state.ledger.listPayouts(),
    state.orderStore.listAll(),
    state.keyStore.listTrustAnchors(),
  ]);
  const records = listAllPluginVersionRecords(state);
  const submittedRecords = records.filter(
    (record) => record.reviewState === "SUBMITTED" || record.reviewState === "APPROVED",
  );
  const issuedLicenses = licenses.filter((license) => license.state === "ISSUED");
  const revokedLicenses = licenses.filter((license) => license.state === "REVOKED");
  const pendingPayouts = payouts.filter((payout) => payout.state === "PENDING_REVIEW");
  const paidOrders = orders.filter((order) => order.state === "PAID");
  const platformGmv = orders
    .filter((order) => order.state === "PAID")
    .reduce((sum, order) => sum + order.priceAmountCents, 0);

  const content =
    locale === "en"
      ? {
          eyebrow: "Control Center",
          title: "Governance overview",
          subtitle:
            "Start from a single governance workspace for review load, live entitlements, payout pressure, and trust infrastructure.",
          stats: {
            review: "Review load",
            licenses: "Issued licenses",
            payouts: "Pending payouts",
            trust: "Trust anchors",
          },
          notes: {
            review: "Submitted or approved versions still waiting for a final admin action",
            licenses: "Active entitlements still trusted by downstream NovaPay installs",
            payouts: "Developer payout requests waiting for settlement review",
            trust: "Active and retired signing keys still trusted by the registry",
          },
          sections: {
            alerts: "Priority alerts",
            alertsNote:
              "Use these operational alerts to decide where governance attention is needed first.",
            queue: "Review spotlight",
            queueNote:
              "The highest-signal items that usually deserve first attention from operations and governance staff.",
            finance: "Revenue watch",
            financeNote:
              "Fast health check for the marketplace money flow before you drill into payout review and settlement policy.",
            actions: "Quick actions",
            actionsNote:
              "Jump directly into the module you need instead of hunting through deep routes.",
          },
          finance: {
            gmv: "Platform GMV",
            orders: "Paid orders",
            revoked: "Revoked licenses",
          },
          alerts: {
            review: "Versions waiting for governance decision",
            payout: "Payout requests awaiting review",
            revoked: "Recently revoked entitlements",
            trust: "Retired trust anchors still active",
            none: "No elevated alerts right now.",
          },
          quick: {
            review: "Open review queue",
            plugins: "Open plugin inventory",
            licenses: "Open license control",
            payouts: "Open payout review",
            keys: "Open signing keys",
          },
          empty: "No urgent items right now.",
          open: "Open",
        }
      : {
          eyebrow: "总控中心",
          title: "治理总览",
          subtitle:
            "从一个统一治理工作台进入审核负载、在线授权、打款压力和信任基础设施，而不是分散跳转到各个子模块。",
          stats: {
            review: "审核负载",
            licenses: "有效授权",
            payouts: "待审打款",
            trust: "信任锚点",
          },
          notes: {
            review: "仍需要管理员继续处理的已提交或已批准版本",
            licenses: "仍被下游 NovaPay 安装信任的在线授权数量",
            payouts: "等待结算审核的开发者打款申请",
            trust: "当前仍被注册中心信任的活跃与退役签名密钥",
          },
          sections: {
            alerts: "优先告警",
            alertsNote: "先用这些治理告警判断管理员当前最应该优先处理的方向。",
            queue: "审核焦点",
            queueNote: "优先给运营和治理人员展示最需要先看的审核条目。",
            finance: "资金观察",
            financeNote: "在进入打款审核和结算策略前，先快速判断插件市场资金流状态。",
            actions: "快捷操作",
            actionsNote: "直接进入你要处理的模块，而不是继续猜测隐藏路径。",
          },
          finance: {
            gmv: "平台 GMV",
            orders: "已支付订单",
            revoked: "已吊销授权",
          },
          alerts: {
            review: "等待治理决策的版本",
            payout: "等待审核的打款申请",
            revoked: "最近被吊销的授权",
            trust: "仍处于信任窗口的退役密钥",
            none: "当前没有需要优先处理的高等级告警。",
          },
          quick: {
            review: "打开审核队列",
            plugins: "打开插件总览",
            licenses: "打开授权控制",
            payouts: "打开打款审核",
            keys: "打开签名密钥",
          },
          empty: "当前没有高优先级事项。",
          open: "打开",
        };

  const spotlight = submittedRecords.slice(0, 5);

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
            <Link href={governancePath("/review-queue")} className="governance-metric governance-metric-link">
              <span className="governance-metric-label">{content.stats.review}</span>
              <span className="governance-metric-value">{submittedRecords.length}</span>
              <span className="governance-metric-note">{content.notes.review}</span>
            </Link>
            <Link href={`${governancePath("/licenses")}?state=ISSUED`} className="governance-metric governance-metric-link">
              <span className="governance-metric-label">{content.stats.licenses}</span>
              <span className="governance-metric-value">{issuedLicenses.length}</span>
              <span className="governance-metric-note">{content.notes.licenses}</span>
            </Link>
            <Link href={governancePath("/payouts")} className="governance-metric governance-metric-link">
              <span className="governance-metric-label">{content.stats.payouts}</span>
              <span className="governance-metric-value">{pendingPayouts.length}</span>
              <span className="governance-metric-note">{content.notes.payouts}</span>
            </Link>
            <Link href={governancePath("/signing-keys")} className="governance-metric governance-metric-link">
              <span className="governance-metric-label">{content.stats.trust}</span>
              <span className="governance-metric-value">{trustAnchors.length}</span>
              <span className="governance-metric-note">{content.notes.trust}</span>
            </Link>
          </div>
        </div>

        <div className="detail-grid">
          <section className="detail-section">
            <div className="detail-surface">
              <div className="detail-surface-head">
                <h2 className="detail-surface-title">{content.sections.alerts}</h2>
                <p className="detail-surface-note">{content.sections.alertsNote}</p>
              </div>
              <div className="activity-list">
                {submittedRecords.length > 0 ? (
                  <Link href={governancePath("/review-queue")} className="activity-item activity-item-warning">
                    <p className="activity-item-title">{content.alerts.review}</p>
                    <p className="activity-item-note">{submittedRecords.length}</p>
                  </Link>
                ) : null}
                {pendingPayouts.length > 0 ? (
                  <Link href={governancePath("/payouts")} className="activity-item activity-item-warning">
                    <p className="activity-item-title">{content.alerts.payout}</p>
                    <p className="activity-item-note">{pendingPayouts.length}</p>
                  </Link>
                ) : null}
                {revokedLicenses.length > 0 ? (
                  <Link href={`${governancePath("/licenses")}?state=REVOKED`} className="activity-item activity-item-danger">
                    <p className="activity-item-title">{content.alerts.revoked}</p>
                    <p className="activity-item-note">{revokedLicenses.length}</p>
                  </Link>
                ) : null}
                {trustAnchors.filter((item) => item.status === "RETIRED").length > 0 ? (
                  <Link href={governancePath("/signing-keys")} className="activity-item activity-item-positive">
                    <p className="activity-item-title">{content.alerts.trust}</p>
                    <p className="activity-item-note">
                      {trustAnchors.filter((item) => item.status === "RETIRED").length}
                    </p>
                  </Link>
                ) : null}
                {submittedRecords.length === 0 &&
                pendingPayouts.length === 0 &&
                revokedLicenses.length === 0 &&
                trustAnchors.filter((item) => item.status === "RETIRED").length === 0 ? (
                  <p className="text-body-sm text-mute">{content.alerts.none}</p>
                ) : null}
              </div>
            </div>

            <div className="detail-surface">
              <div className="detail-surface-head">
                <h2 className="detail-surface-title">{content.sections.queue}</h2>
                <p className="detail-surface-note">{content.sections.queueNote}</p>
              </div>
              {spotlight.length === 0 ? (
                <p className="text-body-sm text-mute">{content.empty}</p>
              ) : (
                <div className="activity-list">
                  {spotlight.map((record) => (
                    <div key={`${record.slug}@${record.version}`} className="activity-item">
                      <p className="activity-item-title">{record.slug}</p>
                      <p className="activity-item-note">
                        {record.reviewState} · v{record.version}
                      </p>
                      <p className="activity-item-time">{record.updatedAt.toISOString()}</p>
                      <div>
                        <Link href={`/plugins/${record.slug}`} className="btn btn-tertiary btn-sm">
                          {content.open}
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="detail-surface">
              <div className="detail-surface-head">
                <h2 className="detail-surface-title">{content.sections.finance}</h2>
                <p className="detail-surface-note">{content.sections.financeNote}</p>
              </div>
              <div className="detail-kpi-grid">
                <div className="risk-kpi">
                  <p className="risk-kpi-label">{content.finance.gmv}</p>
                  <p className="risk-kpi-value">{formatCny(platformGmv)}</p>
                </div>
                <div className="risk-kpi">
                  <p className="risk-kpi-label">{content.finance.orders}</p>
                  <p className="risk-kpi-value">
                    {paidOrders.length}
                  </p>
                </div>
                <div className="risk-kpi">
                  <p className="risk-kpi-label">{content.finance.revoked}</p>
                  <p className="risk-kpi-value">
                    {revokedLicenses.length}
                  </p>
                </div>
              </div>
            </div>
          </section>

          <aside className="detail-section sticky-side">
            <div className="detail-surface">
              <div className="detail-surface-head">
                <h2 className="detail-surface-title">{content.sections.actions}</h2>
                <p className="detail-surface-note">{content.sections.actionsNote}</p>
              </div>
              <div className="activity-list">
                <Link href={governancePath("/review-queue")} className="activity-item">
                  <p className="activity-item-title">{content.quick.review}</p>
                </Link>
                <Link href={governancePath("/plugins")} className="activity-item">
                  <p className="activity-item-title">{content.quick.plugins}</p>
                </Link>
                <Link href={governancePath("/licenses")} className="activity-item">
                  <p className="activity-item-title">{content.quick.licenses}</p>
                </Link>
                <Link href={governancePath("/payouts")} className="activity-item">
                  <p className="activity-item-title">{content.quick.payouts}</p>
                </Link>
                <Link href={governancePath("/signing-keys")} className="activity-item">
                  <p className="activity-item-title">{content.quick.keys}</p>
                </Link>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </section>
  );
}
