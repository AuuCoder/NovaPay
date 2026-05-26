import Link from "next/link";
import { requireRegistryAdminSession } from "../../../lib/auth/session";
import { getCurrentLocale } from "@/lib/i18n-server";
import { getRegistryRuntime } from "../../../lib/runtime/state";
import { governancePath } from "../../../lib/governance-paths";

type LicenseState = "ISSUED" | "REVOKED" | "EXPIRED";

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

function formatPercent(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

export default async function AdminLicensesPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireRegistryAdminSession();
  const locale = (await getCurrentLocale()) as "zh" | "en";
  const state = await getRegistryRuntime();
  const params = (await searchParams) ?? {};
  const statusFilter =
    typeof params.state === "string"
      ? params.state
      : Array.isArray(params.state)
        ? params.state[0] ?? ""
        : "";
  const keywordValue =
    typeof params.q === "string"
      ? params.q
      : Array.isArray(params.q)
        ? params.q[0] ?? ""
        : "";
  const keyword = keywordValue.trim().toLowerCase();

  const content =
    locale === "en"
      ? {
          eyebrow: "Licensing Governance",
          title: "Entitlement control center",
          subtitle:
            "Track which licenses are live, which ones have been revoked, and how every entitlement maps back to a paid marketplace order.",
          strip: {
            issued: "Issued",
            revoked: "Revoked",
            revokedRate: "Revocation ratio",
            protectedRevenue: "Protected GMV",
          },
          stripNotes: {
            issued: "Active entitlements still trusted by downstream installs",
            revoked: "Licenses already invalidated from the registry side",
            revokedRate: "Share of revoked licenses across the current estate",
            protectedRevenue: "Gross order value covered by issued and revoked licenses",
          },
          toolbarTitle: "License ledger",
          toolbarNote:
            "A single audit table for entitlement issuance, buyer scope, order lineage, and governance actions.",
          filters: {
            all: "All",
            issued: "Issued",
            revoked: "Revoked",
            expired: "Expired",
            search: "Search",
            searchPlaceholder: "Search license, plugin, instance, or order",
          },
          headers: {
            license: "License",
            plugin: "Plugin",
            scope: "Scope",
            order: "Order lineage",
            revenue: "Revenue",
            state: "State",
            issuedAt: "Issued at",
            action: "Action",
          },
          fields: {
            noRows: "No licenses found.",
            open: "Open",
            noOrder: "No linked order",
            instanceScope: "Instance scope",
            merchantScope: "Merchant scope",
            unknownBuyer: "Unknown buyer",
            revokedReason: "Revoked",
          },
        }
      : {
          eyebrow: "授权治理",
          title: "授权控制中枢",
          subtitle:
            "统一查看哪些授权仍在生效、哪些授权已经被吊销，以及每一份授权与市场付费订单之间的映射关系。",
          strip: {
            issued: "已签发",
            revoked: "已吊销",
            revokedRate: "吊销占比",
            protectedRevenue: "覆盖 GMV",
          },
          stripNotes: {
            issued: "仍被下游安装信任的有效授权数量",
            revoked: "已经从注册中心侧作废的授权数量",
            revokedRate: "当前授权资产中被吊销的比例",
            protectedRevenue: "已签发和已吊销授权对应的订单总额",
          },
          toolbarTitle: "授权台账",
          toolbarNote:
            "将授权签发、购买方范围、订单来源和治理动作放在同一张审计视图中统一管理。",
          filters: {
            all: "全部",
            issued: "已签发",
            revoked: "已吊销",
            expired: "已过期",
            search: "搜索",
            searchPlaceholder: "搜索授权、插件、实例或订单",
          },
          headers: {
            license: "授权",
            plugin: "插件",
            scope: "范围",
            order: "订单链路",
            revenue: "金额",
            state: "状态",
            issuedAt: "签发时间",
            action: "操作",
          },
          fields: {
            noRows: "当前没有匹配的授权记录。",
            open: "打开",
            noOrder: "未关联订单",
            instanceScope: "实例授权",
            merchantScope: "商户授权",
            unknownBuyer: "未知购买方",
            revokedReason: "吊销原因",
          },
        };

  const [licenses, orders, revocations] = await Promise.all([
    state.licenseStore.listAll(),
    state.orderStore.listAll(),
    state.revocations.list(),
  ]);

  const rows = licenses
    .map((license) => {
      const order = license.orderId
        ? orders.find((item) => item.id === license.orderId) ?? null
        : null;
      const revocation =
        revocations.find((item) => item.licenseId === license.id) ?? null;

      return {
        license,
        order,
        revocation,
      };
    })
    .filter(({ license, order }) => {
      if (statusFilter && license.state !== statusFilter) {
        return false;
      }

      if (!keyword) {
        return true;
      }

      return [
        license.id,
        license.pluginSlug,
        license.instanceId ?? "",
        license.merchantId ?? "",
        order?.orderNumber ?? "",
      ]
        .join(" ")
        .toLowerCase()
        .includes(keyword);
    });

  const issuedCount = licenses.filter((item) => item.state === "ISSUED").length;
  const revokedCount = licenses.filter((item) => item.state === "REVOKED").length;
  const protectedRevenue = rows.reduce(
    (sum, row) => sum + (row.order?.priceAmountCents ?? 0),
    0,
  );
  const revokedRate = licenses.length === 0 ? 0 : revokedCount / licenses.length;

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
            <div className="governance-meta">
              <span className="governance-meta-label">Control Surface</span>
              <span className="governance-meta-value">License / Revocation / Order</span>
            </div>
          </div>

          <div className="governance-strip">
            <div className="governance-metric">
              <span className="governance-metric-label">{content.strip.issued}</span>
              <span className="governance-metric-value">{issuedCount}</span>
              <span className="governance-metric-note">{content.stripNotes.issued}</span>
            </div>
            <div className="governance-metric">
              <span className="governance-metric-label">{content.strip.revoked}</span>
              <span className="governance-metric-value">{revokedCount}</span>
              <span className="governance-metric-note">{content.stripNotes.revoked}</span>
            </div>
            <div className="governance-metric">
              <span className="governance-metric-label">{content.strip.revokedRate}</span>
              <span className="governance-metric-value">{formatPercent(revokedRate)}</span>
              <span className="governance-metric-note">{content.stripNotes.revokedRate}</span>
            </div>
            <div className="governance-metric">
              <span className="governance-metric-label">{content.strip.protectedRevenue}</span>
              <span className="governance-metric-value">{formatAmount(protectedRevenue, "CNY")}</span>
              <span className="governance-metric-note">{content.stripNotes.protectedRevenue}</span>
            </div>
          </div>
        </div>

        <div className="enterprise-panel">
          <div className="table-toolbar" style={{ marginBottom: 18 }}>
            <div className="table-toolbar-copy">
              <h2 className="table-toolbar-title">{content.toolbarTitle}</h2>
              <p className="table-toolbar-note">{content.toolbarNote}</p>
            </div>
            <div className="console-filterbar">
              <Link href={governancePath("/licenses")} className={statusFilter === "" ? "btn btn-primary btn-sm" : "btn btn-tertiary btn-sm"}>
                {content.filters.all}
              </Link>
              <Link href={`${governancePath("/licenses")}?state=ISSUED`} className={statusFilter === "ISSUED" ? "btn btn-primary btn-sm" : "btn btn-tertiary btn-sm"}>
                {content.filters.issued}
              </Link>
              <Link href={`${governancePath("/licenses")}?state=REVOKED`} className={statusFilter === "REVOKED" ? "btn btn-primary btn-sm" : "btn btn-tertiary btn-sm"}>
                {content.filters.revoked}
              </Link>
              <Link href={`${governancePath("/licenses")}?state=EXPIRED`} className={statusFilter === "EXPIRED" ? "btn btn-primary btn-sm" : "btn btn-tertiary btn-sm"}>
                {content.filters.expired}
              </Link>
            </div>
          </div>

          <div className="admin-header" style={{ marginBottom: 16 }}>
            <form action={governancePath("/licenses")} className="console-filterbar">
              {statusFilter ? <input type="hidden" name="state" value={statusFilter} /> : null}
              <input
                type="search"
                name="q"
                defaultValue={keywordValue}
                className="input console-search"
                placeholder={content.filters.searchPlaceholder}
              />
              <button type="submit" className="btn btn-tertiary btn-sm">
                {content.filters.search}
              </button>
            </form>
          </div>

          <div style={{ overflowX: "auto" }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>{content.headers.license}</th>
                  <th>{content.headers.plugin}</th>
                  <th>{content.headers.scope}</th>
                  <th>{content.headers.order}</th>
                  <th>{content.headers.revenue}</th>
                  <th>{content.headers.state}</th>
                  <th>{content.headers.issuedAt}</th>
                  <th style={{ textAlign: "right" }}>{content.headers.action}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ license, order, revocation }) => (
                  <tr key={license.id}>
                    <td>
                      <div className="table-stack">
                        <span className="table-row-primary">{license.id}</span>
                        <span className="mono-truncate">
                          {revocation
                            ? `${content.fields.revokedReason}: ${revocation.reason}`
                            : license.licenseKeyHash.slice(0, 18) + "…"}
                        </span>
                      </div>
                    </td>
                    <td>
                      <div className="table-stack">
                        <span className="table-row-primary">{license.pluginSlug}</span>
                        <span className="table-row-secondary">v{license.version}</span>
                      </div>
                    </td>
                    <td>
                      <div className="table-stack">
                        <span className="table-row-primary">
                          {license.merchantId
                            ? content.fields.merchantScope
                            : content.fields.instanceScope}
                        </span>
                        <span className="table-row-secondary">
                          {license.merchantId ?? license.instanceId ?? "—"}
                        </span>
                      </div>
                    </td>
                    <td>
                      <div className="table-stack">
                        <span className="table-row-primary">{order?.orderNumber ?? content.fields.noOrder}</span>
                        <span className="table-row-secondary">
                          {order?.buyerMerchantId ?? order?.buyerInstanceId ?? content.fields.unknownBuyer}
                        </span>
                      </div>
                    </td>
                    <td className="text-body-sm text-body-color">
                      {order ? formatAmount(order.priceAmountCents, order.priceCurrency) : "—"}
                    </td>
                    <td>
                      <span className={getLicenseStateBadge(license.state)}>{license.state}</span>
                    </td>
                    <td>
                      <div className="table-stack">
                        <span className="table-row-primary">{license.issuedAt.toISOString().slice(0, 10)}</span>
                        <span className="table-row-secondary">{license.issuedAt.toISOString().slice(11, 19)} UTC</span>
                      </div>
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <Link href={governancePath(`/licenses/${license.id}`)} className="btn btn-tertiary btn-sm">
                        {content.fields.open}
                      </Link>
                    </td>
                  </tr>
                ))}
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="text-body-sm text-mute" style={{ padding: 24 }}>
                      {content.fields.noRows}
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  );
}
