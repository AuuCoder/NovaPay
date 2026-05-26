import { getCurrentLocale } from "@/lib/i18n-server";
import { requireRegistryAdminSession } from "../../../lib/auth/session";
import { getRegistryRuntime } from "../../../lib/runtime/state";
import { getPayoutAccountById } from "../../../lib/payouts/payout-accounts";
import { PayoutReviewActions } from "./review-actions";

function formatCny(cents: number) {
  return `¥${(cents / 100).toFixed(2)}`;
}

export default async function AdminPayoutsPage() {
  await requireRegistryAdminSession();
  const locale = await getCurrentLocale();
  const state = await getRegistryRuntime();
  const [payouts, orders] = await Promise.all([
    state.ledger.listPayouts(),
    state.orderStore.listAll(),
  ]);
  const allEntries = await Promise.all(
    [...new Set(orders.map((order) => order.developerId))].map((developerId) =>
      state.ledger.listEntries(developerId),
    ),
  ).then((groups) => groups.flat());

  const payoutRows = await Promise.all(
    payouts.map(async (request) => ({
      request,
      account: await getPayoutAccountById(request.payoutAccountId),
    })),
  );

  const paidOrders = orders.filter((order) => order.state === "PAID");
  const platformGmv = paidOrders.reduce((sum, order) => sum + order.priceAmountCents, 0);

  const developerIds = [
    ...new Set([
      ...paidOrders.map((order) => order.developerId),
      ...payouts.map((request) => request.developerId),
    ]),
  ];

  const developerRows = await Promise.all(
    developerIds.map(async (developerId) => {
      const [entries, balance, requests] = await Promise.all([
        state.ledger.listEntries(developerId),
        state.ledger.getBalance(developerId),
        state.ledger.listPayouts(developerId),
      ]);

      const credited = entries
        .filter((entry) => entry.amountCents > 0)
        .reduce((sum, entry) => sum + entry.amountCents, 0);
      const debited = entries
        .filter((entry) => entry.amountCents < 0)
        .reduce((sum, entry) => sum + Math.abs(entry.amountCents), 0);

      return {
        developerId,
        credited,
        debited,
        balance,
        requestCount: requests.length,
      };
    }),
  );

  const developerShareTotal = developerRows.reduce((sum, row) => sum + row.credited, 0);
  const pendingPayoutTotal = payouts
    .filter((request) => request.state === "PENDING_REVIEW")
    .reduce((sum, request) => sum + request.amountCents, 0);
  const approvedPayoutTotal = payouts
    .filter((request) => request.state === "APPROVED")
    .reduce((sum, request) => sum + request.amountCents, 0);

  const paidOrderRows = paidOrders.map((order) => {
    const revenueEntry = allEntries.find(
      (entry) => entry.externalRef === order.id && entry.reason === "LICENSE_SALE",
    );
    const developerShare = revenueEntry?.amountCents ?? 0;
    const platformShare = Math.max(order.priceAmountCents - developerShare, 0);

    return {
      order,
      developerShare,
      platformShare,
    };
  });

  return (
    <section className="admin-shell">
      <div className="container admin-page">
        <div className="admin-header">
          <div className="admin-header-copy">
            <p className="text-eyebrow">{locale === "en" ? "Settlement" : "结算审核"}</p>
            <h1 className="admin-title">{locale === "en" ? "Payout review" : "打款审核"}</h1>
            <p className="admin-subtitle">
              {locale === "en"
                ? "Review developer payout requests after the platform has collected plugin marketplace revenue, recorded developer share, and prepared settlement balances."
                : "平台代收插件市场收入后，会先核算开发者分成，再在这里审核开发者打款申请和平台结算总账。"}
            </p>
          </div>
        </div>

        <div className="grid-3">
          <div className="stat-card feature">
            <p className="stat-label">{locale === "en" ? "Platform GMV" : "平台 GMV"}</p>
            <p className="stat-value">{formatCny(platformGmv)}</p>
          </div>
          <div className="stat-card">
            <p className="stat-label">{locale === "en" ? "Developer share" : "开发者分成"}</p>
            <p className="stat-value">{formatCny(developerShareTotal)}</p>
          </div>
          <div className="stat-card">
            <p className="stat-label">{locale === "en" ? "Pending payouts" : "待审核打款"}</p>
            <p className="stat-value">{formatCny(pendingPayoutTotal)}</p>
          </div>
        </div>

        <div className="enterprise-panel">
          <div className="admin-header" style={{ marginBottom: 12 }}>
            <div className="admin-header-copy">
              <h2 className="text-display-sm">{locale === "en" ? "Developer settlement summary" : "开发者结算汇总"}</h2>
            </div>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>{locale === "en" ? "Developer" : "开发者"}</th>
                  <th>{locale === "en" ? "Credited" : "累计入账"}</th>
                  <th>{locale === "en" ? "Debited" : "累计打款"}</th>
                  <th>{locale === "en" ? "Available" : "可用"}</th>
                  <th>{locale === "en" ? "Frozen" : "冻结"}</th>
                  <th>{locale === "en" ? "Requests" : "申请数"}</th>
                </tr>
              </thead>
              <tbody>
                {developerRows.map((row) => (
                  <tr key={row.developerId}>
                    <td className="text-body-sm text-body-color">{row.developerId}</td>
                    <td className="text-body-sm text-body-color">{formatCny(row.credited)}</td>
                    <td className="text-body-sm text-body-color">{formatCny(row.debited)}</td>
                    <td className="text-body-sm text-body-color">{formatCny(row.balance.available)}</td>
                    <td className="text-body-sm text-body-color">{formatCny(row.balance.frozen)}</td>
                    <td className="text-body-sm text-body-color">{row.requestCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="enterprise-panel">
          <div className="admin-header" style={{ marginBottom: 12 }}>
            <div className="admin-header-copy">
              <h2 className="text-display-sm">{locale === "en" ? "Settlement orders" : "结算订单"}</h2>
            </div>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>{locale === "en" ? "Order" : "订单"}</th>
                  <th>{locale === "en" ? "Developer" : "开发者"}</th>
                  <th>{locale === "en" ? "Buyer" : "购买方"}</th>
                  <th>{locale === "en" ? "GMV" : "GMV"}</th>
                  <th>{locale === "en" ? "Developer share" : "开发者分成"}</th>
                  <th>{locale === "en" ? "Platform share" : "平台分成"}</th>
                  <th>{locale === "en" ? "State" : "状态"}</th>
                </tr>
              </thead>
              <tbody>
                {paidOrderRows.map(({ order, developerShare, platformShare }) => (
                  <tr key={order.id}>
                    <td>
                      <div style={{ display: "grid", gap: 4 }}>
                        <span className="text-body-sm text-body-color">{order.pluginSlug}</span>
                        <span className="text-caption">{order.orderNumber}</span>
                      </div>
                    </td>
                    <td className="text-body-sm text-body-color">{order.developerId}</td>
                    <td className="text-body-sm text-body-color">
                      {order.buyerMerchantId ?? order.buyerInstanceId}
                    </td>
                    <td className="text-body-sm text-body-color">{formatCny(order.priceAmountCents)}</td>
                    <td className="text-body-sm text-body-color">{formatCny(developerShare)}</td>
                    <td className="text-body-sm text-body-color">{formatCny(platformShare)}</td>
                    <td>
                      <span className="badge badge-positive">{order.state}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="enterprise-panel">
          <div className="admin-header" style={{ marginBottom: 12 }}>
            <div className="admin-header-copy">
              <h2 className="text-display-sm">{locale === "en" ? "Payout requests" : "打款申请"}</h2>
            </div>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>{locale === "en" ? "Developer" : "开发者"}</th>
                  <th>{locale === "en" ? "Account" : "收款账户"}</th>
                  <th>{locale === "en" ? "Amount" : "金额"}</th>
                  <th>{locale === "en" ? "Status" : "状态"}</th>
                  <th>{locale === "en" ? "Created" : "创建时间"}</th>
                  <th style={{ textAlign: "right" }}>{locale === "en" ? "Action" : "操作"}</th>
                </tr>
              </thead>
              <tbody>
                {payoutRows.map(({ request, account }) => (
                  <tr key={request.id}>
                    <td className="text-body-sm text-body-color">{request.developerId}</td>
                    <td>
                      <div style={{ display: "grid", gap: 4 }}>
                        <span className="text-body-sm text-body-color">
                          {account?.accountHolder ?? (locale === "en" ? "Unknown account" : "未知账户")}
                        </span>
                        <span className="text-caption">
                          {account?.accountType === "paypal"
                            ? account.paypalEmail
                            : account?.bankName ?? request.payoutAccountId}
                        </span>
                      </div>
                    </td>
                    <td className="text-body-sm text-body-color">{formatCny(request.amountCents)}</td>
                    <td>
                      <span className={request.state === "PENDING_REVIEW" ? "badge badge-warning" : request.state === "APPROVED" ? "badge badge-positive" : "badge badge-neutral"}>
                        {request.state === "PENDING_REVIEW"
                          ? locale === "en"
                            ? "Pending review"
                            : "待审核"
                          : request.state === "APPROVED"
                            ? locale === "en"
                              ? "Approved"
                              : "已批准"
                            : request.state === "REJECTED"
                              ? locale === "en"
                                ? "Rejected"
                                : "已拒绝"
                              : request.state}
                      </span>
                    </td>
                    <td className="text-body-sm text-body-color">{request.createdAt.toISOString()}</td>
                    <td style={{ textAlign: "right" }}>
                      <PayoutReviewActions id={request.id} state={request.state} locale={locale} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ marginTop: 16 }} className="text-body-sm text-mute">
            {locale === "en"
              ? `Approved payout total: ${formatCny(approvedPayoutTotal)}`
              : `已批准打款总额：${formatCny(approvedPayoutTotal)}`}
          </div>
        </div>
      </div>
    </section>
  );
}
