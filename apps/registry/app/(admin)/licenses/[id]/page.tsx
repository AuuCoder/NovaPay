import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRegistryAdminSession } from "../../../../lib/auth/session";
import { getCurrentLocale } from "@/lib/i18n-server";
import { getRegistryRuntime } from "../../../../lib/runtime/state";
import { LicenseRevokeActions } from "../revoke-actions";
import { governancePath } from "../../../../lib/governance-paths";

type LicenseState = "ISSUED" | "REVOKED" | "EXPIRED";

function formatAmount(cents: number, currency: string) {
  try {
    return new Intl.NumberFormat("zh-CN", {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(cents / 100);
  } catch {
    return `${currency} ${(cents / 100).toFixed(2)}`;
  }
}

function getLicenseStateBadge(state: LicenseState) {
  switch (state) {
    case "REVOKED":
      return "badge badge-negative";
    case "EXPIRED":
      return "badge badge-warning";
    case "ISSUED":
    default:
      return "badge badge-positive";
  }
}

export default async function AdminLicenseDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireRegistryAdminSession();
  const locale = (await getCurrentLocale()) as "zh" | "en";
  const { id } = await params;
  const state = await getRegistryRuntime();

  const [license, orders, revocations] = await Promise.all([
    state.licenseStore.findById(id),
    state.orderStore.listAll(),
    state.revocations.list(),
  ]);

  if (!license) {
    notFound();
  }

  const content =
    locale === "en"
      ? {
          eyebrow: "License Detail",
          title: "Entitlement governance workspace",
          subtitle:
            "Inspect the entitlement payload, verify its commercial lineage, and revoke the credential when downstream usage must be invalidated.",
          back: "Back to licenses",
          cards: {
            state: "State",
            order: "Order",
            revenue: "Revenue",
          },
          sections: {
            entitlement: "Entitlement profile",
            entitlementNote:
              "Identity, scope, payload digest, and lifecycle markers for the signed license token.",
            commerce: "Commercial lineage",
            commerceNote:
              "How this entitlement maps back to buyer scope, revenue, and the originating marketplace transaction.",
            governance: "Governance actions",
            governanceNote:
              "Revoke the entitlement when compromise, refund, or policy enforcement requires downstream invalidation.",
            activity: "Lifecycle activity",
            activityNote:
              "Operational timeline for issuance, order settlement, and any revocation action already taken.",
          },
          labels: {
            licenseId: "License ID",
            pluginSlug: "Plugin slug",
            instanceId: "Instance ID",
            merchantId: "Merchant ID",
            issuedAt: "Issued at",
            expiresAt: "Expires at",
            hash: "License hash",
            payload: "Signed payload",
            orderNumber: "Order number",
            buyer: "Buyer scope",
            developerId: "Developer ID",
            pricingPlan: "Pricing plan",
            amount: "Order amount",
            noOrder: "No linked order",
            noBuyer: "Unknown buyer",
            eventIssued: "License issued",
            eventSettled: "Order settled",
            eventRevoked: "License revoked",
            by: "By",
            reason: "Reason",
            noExpiry: "Perpetual",
          },
        }
      : {
          eyebrow: "授权详情",
          title: "授权治理工作台",
          subtitle:
            "查看授权载荷、核对其商业来源，并在下游使用需要失效时执行吊销动作。",
          back: "返回授权列表",
          cards: {
            state: "状态",
            order: "订单",
            revenue: "金额",
          },
          sections: {
            entitlement: "授权画像",
            entitlementNote:
              "展示该签名授权的身份、范围、摘要和生命周期标记，便于快速核验。",
            commerce: "商业链路",
            commerceNote:
              "回溯这份授权对应的购买方范围、收入金额和原始市场订单。",
            governance: "治理操作",
            governanceNote:
              "当发生退款、异常使用或策略要求失效时，在此吊销授权。",
            activity: "生命周期事件",
            activityNote:
              "展示签发、订单结算以及后续吊销动作的时间线。",
          },
          labels: {
            licenseId: "授权 ID",
            pluginSlug: "插件标识",
            instanceId: "实例 ID",
            merchantId: "商户 ID",
            issuedAt: "签发时间",
            expiresAt: "过期时间",
            hash: "授权哈希",
            payload: "签名载荷",
            orderNumber: "订单号",
            buyer: "购买范围",
            developerId: "开发者 ID",
            pricingPlan: "计费计划",
            amount: "订单金额",
            noOrder: "未关联订单",
            noBuyer: "未知购买方",
            eventIssued: "授权已签发",
            eventSettled: "订单已结算",
            eventRevoked: "授权已吊销",
            by: "执行人",
            reason: "原因",
            noExpiry: "长期有效",
          },
        };

  const order = license.orderId
    ? orders.find((item) => item.id === license.orderId) ?? null
    : null;
  const revocation =
    revocations.find((item) => item.licenseId === license.id) ?? null;

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
            <div className="admin-toolbar">
              <Link href={governancePath("/licenses")} className="btn btn-tertiary btn-sm">
                {content.back}
              </Link>
            </div>
          </div>

          <div className="governance-strip">
            <div className="governance-metric">
              <span className="governance-metric-label">{content.cards.state}</span>
              <span className="governance-metric-value">
                <span className={getLicenseStateBadge(license.state)}>{license.state}</span>
              </span>
              <span className="governance-metric-note">{license.id}</span>
            </div>
            <div className="governance-metric">
              <span className="governance-metric-label">{content.cards.order}</span>
              <span className="governance-metric-value">{order?.orderNumber ?? "—"}</span>
              <span className="governance-metric-note">{license.orderId ?? content.labels.noOrder}</span>
            </div>
            <div className="governance-metric">
              <span className="governance-metric-label">{content.cards.revenue}</span>
              <span className="governance-metric-value">
                {order ? formatAmount(order.priceAmountCents, order.priceCurrency) : "—"}
              </span>
              <span className="governance-metric-note">{license.pricingPlanKind}</span>
            </div>
          </div>
        </div>

        <div className="detail-grid">
          <div className="detail-section">
            <section className="detail-surface">
              <div className="detail-surface-head">
                <h2 className="detail-surface-title">{content.sections.entitlement}</h2>
                <p className="detail-surface-note">{content.sections.entitlementNote}</p>
              </div>

              <div className="detail-kpi-grid">
                <div className="risk-kpi">
                  <p className="risk-kpi-label">{content.labels.licenseId}</p>
                  <p className="risk-kpi-value" style={{ fontSize: 13 }}>{license.id}</p>
                </div>
                <div className="risk-kpi">
                  <p className="risk-kpi-label">{content.labels.pluginSlug}</p>
                  <p className="risk-kpi-value">{license.pluginSlug}</p>
                </div>
                <div className="risk-kpi">
                  <p className="risk-kpi-label">{content.labels.instanceId}</p>
                  <p className="risk-kpi-value">{license.instanceId ?? "—"}</p>
                </div>
                <div className="risk-kpi">
                  <p className="risk-kpi-label">{content.labels.merchantId}</p>
                  <p className="risk-kpi-value">{license.merchantId ?? "—"}</p>
                </div>
                <div className="risk-kpi">
                  <p className="risk-kpi-label">{content.labels.issuedAt}</p>
                  <p className="risk-kpi-value">{license.issuedAt.toISOString()}</p>
                </div>
                <div className="risk-kpi">
                  <p className="risk-kpi-label">{content.labels.expiresAt}</p>
                  <p className="risk-kpi-value">{license.expiresAt?.toISOString() ?? content.labels.noExpiry}</p>
                </div>
              </div>

              <div className="detail-surface-head">
                <h3 className="detail-surface-title" style={{ fontSize: 16 }}>{content.labels.hash}</h3>
                <div className="detail-code-block">{license.licenseKeyHash}</div>
              </div>

              <div className="detail-surface-head">
                <h3 className="detail-surface-title" style={{ fontSize: 16 }}>{content.labels.payload}</h3>
                <div className="detail-code-block">{license.jwsCompact}</div>
              </div>
            </section>

            <section className="detail-surface">
              <div className="detail-surface-head">
                <h2 className="detail-surface-title">{content.sections.commerce}</h2>
                <p className="detail-surface-note">{content.sections.commerceNote}</p>
              </div>

              <div className="detail-kpi-grid">
                <div className="risk-kpi">
                  <p className="risk-kpi-label">{content.labels.orderNumber}</p>
                  <p className="risk-kpi-value">{order?.orderNumber ?? content.labels.noOrder}</p>
                </div>
                <div className="risk-kpi">
                  <p className="risk-kpi-label">{content.labels.buyer}</p>
                  <p className="risk-kpi-value">{order?.buyerMerchantId ?? order?.buyerInstanceId ?? content.labels.noBuyer}</p>
                </div>
                <div className="risk-kpi">
                  <p className="risk-kpi-label">{content.labels.developerId}</p>
                  <p className="risk-kpi-value">{license.developerId ?? order?.developerId ?? "—"}</p>
                </div>
                <div className="risk-kpi">
                  <p className="risk-kpi-label">{content.labels.pricingPlan}</p>
                  <p className="risk-kpi-value">{license.pricingPlanKind}</p>
                </div>
                <div className="risk-kpi">
                  <p className="risk-kpi-label">{content.labels.amount}</p>
                  <p className="risk-kpi-value">
                    {order ? formatAmount(order.priceAmountCents, order.priceCurrency) : "—"}
                  </p>
                </div>
              </div>
            </section>
          </div>

          <aside className="detail-section sticky-side">
            <section className="detail-surface">
              <div className="detail-surface-head">
                <h2 className="detail-surface-title">{content.sections.governance}</h2>
                <p className="detail-surface-note">{content.sections.governanceNote}</p>
              </div>
              <LicenseRevokeActions
                id={license.id}
                state={license.state}
                locale={locale}
              />
            </section>

            <section className="detail-surface">
              <div className="detail-surface-head">
                <h2 className="detail-surface-title">{content.sections.activity}</h2>
                <p className="detail-surface-note">{content.sections.activityNote}</p>
              </div>
              <div className="activity-list">
                <div className="activity-item">
                  <p className="activity-item-title">{content.labels.eventIssued}</p>
                  <p className="activity-item-note">{license.pluginSlug}</p>
                  <p className="activity-item-time">{license.issuedAt.toISOString()}</p>
                </div>
                {order ? (
                  <div className="activity-item">
                    <p className="activity-item-title">{content.labels.eventSettled}</p>
                    <p className="activity-item-note">{order.orderNumber}</p>
                    <p className="activity-item-time">{order.paidAt?.toISOString() ?? order.createdAt.toISOString()}</p>
                  </div>
                ) : null}
                {revocation ? (
                  <div className="activity-item">
                    <p className="activity-item-title">{content.labels.eventRevoked}</p>
                    <p className="activity-item-note">
                      {content.labels.reason}: {revocation.reason}
                    </p>
                    <p className="activity-item-note">
                      {content.labels.by}: {revocation.revokedById}
                    </p>
                    <p className="activity-item-time">{revocation.revokedAt.toISOString()}</p>
                  </div>
                ) : null}
              </div>
            </section>
          </aside>
        </div>
      </div>
    </section>
  );
}
