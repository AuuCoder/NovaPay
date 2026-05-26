import { getCurrentLocale } from "@/lib/i18n-server";
import { requireRegistryUserSession } from "../../../lib/auth/session";
import { getRegistryRuntime } from "../../../lib/runtime/state";
import { listPayoutAccountsByDeveloper } from "../../../lib/payouts/payout-accounts";
import { SalesManager } from "../sales-manager";
import Link from "next/link";
import { governancePath } from "../../../lib/governance-paths";

export default async function DeveloperSalesPage() {
  const session = await requireRegistryUserSession();
  const locale = await getCurrentLocale();

  if (session.actorKind !== "DEVELOPER") {
    const content =
      locale === "en"
        ? {
            eyebrow: "Access scope",
            title: "This page is only for developer accounts",
            lead:
              "You are currently signed in with a NovaPay main-site admin SSO session. Sales and payout operations belong to publisher accounts, while review and governance belong to the governance workspace.",
            primary: "Open review queue",
            secondary: "Open license control",
            tertiary: "Open payout review",
          }
        : {
            eyebrow: "访问范围",
            title: "当前页面仅面向开发者账号",
            lead:
              "你当前登录的是 NovaPay 主站管理员 SSO 会话。销售与打款属于发布者账号能力，审核与治理能力请进入治理工作区。",
            primary: "打开审核队列",
            secondary: "打开授权控制",
            tertiary: "打开打款审核",
          };

    return (
      <section className="admin-shell">
        <div className="container admin-page">
          <div className="governance-hero">
            <div className="governance-hero-head">
              <div className="admin-header-copy">
                <p className="text-eyebrow">{content.eyebrow}</p>
                <h1 className="admin-title">{content.title}</h1>
                <p className="admin-subtitle">{content.lead}</p>
              </div>
            </div>
            <div className="admin-toolbar">
              <Link href={governancePath("/review-queue")} className="btn btn-primary">
                {content.primary}
              </Link>
              <Link href={governancePath("/licenses")} className="btn btn-tertiary">
                {content.secondary}
              </Link>
              <Link href={governancePath("/payouts")} className="btn btn-tertiary">
                {content.tertiary}
              </Link>
            </div>
          </div>
        </div>
      </section>
    );
  }

  const state = await getRegistryRuntime();
  const [balance, payouts, entries, accounts] = await Promise.all([
    state.ledger.getBalance(session.actorId),
    state.ledger.listPayouts(session.actorId),
    state.ledger.listEntries(session.actorId),
    listPayoutAccountsByDeveloper(session.actorId),
  ]);
  const orders = await state.orderStore.listByDeveloper(session.actorId);

  const totalRevenue = entries
    .filter((entry) => entry.amountCents > 0)
    .reduce((sum, entry) => sum + entry.amountCents, 0);

  const content =
    locale === "en"
      ? {
          eyebrow: "Revenue",
          title: "Settlement and payouts",
          lead:
            "Plugin marketplace payments are collected by the platform first. After review and settlement, NovaPay releases the developer share through payout requests and admin approval.",
          labels: {
            available: "Available",
            frozen: "Frozen",
            total: "Total",
            accounts: "Payout accounts",
            addAccount: "Add account",
            accountType: "Account type",
            bankTransfer: "Bank transfer",
            paypal: "PayPal",
            accountHolder: "Account holder",
            bankName: "Bank name",
            accountNumber: "Account number",
            routingNumber: "Routing number",
            paypalEmail: "PayPal email",
            submitAccount: "Save payout account",
            payouts: "Payout requests",
            requestPayout: "Request payout",
            amount: "Amount in CNY",
            selectAccount: "Select payout account",
            submitPayout: "Submit payout request",
            status: "Status",
            noAccounts: "No payout accounts have been added yet.",
            noPayouts: "No payout requests yet.",
            ledger: "Revenue ledger",
            noEntries: "No revenue entries yet.",
            orders: "Settlement orders",
            noOrders: "No settlement orders yet.",
            plugin: "Plugin",
            buyer: "Buyer",
            stateLabel: "State",
            reason: "Reason",
            reference: "Reference",
            occurredAt: "Occurred at",
            amountCol: "Amount",
            pendingVerification: "Pending verification",
            verified: "Verified",
            suspended: "Suspended",
            pendingReview: "Pending review",
            approved: "Approved",
            rejected: "Rejected",
            errorCreateAccount: "Failed to create payout account.",
            errorPayout: "Failed to submit payout request.",
          },
          revenue: "Recognized revenue",
        }
      : {
          eyebrow: "结算",
          title: "分账与打款",
          lead:
            "插件市场的用户付款先进入平台账户，再按平台审核与结算规则，把作者应得分成通过打款申请释放给开发者。",
          labels: {
            available: "可用余额",
            frozen: "冻结余额",
            total: "总余额",
            accounts: "收款账户",
            addAccount: "新增账户",
            accountType: "账户类型",
            bankTransfer: "银行卡转账",
            paypal: "PayPal",
            accountHolder: "收款人",
            bankName: "银行名称",
            accountNumber: "银行卡号",
            routingNumber: "路由号",
            paypalEmail: "PayPal 邮箱",
            submitAccount: "保存收款账户",
            payouts: "打款申请",
            requestPayout: "申请打款",
            amount: "打款金额（CNY）",
            selectAccount: "选择收款账户",
            submitPayout: "提交打款申请",
            status: "状态",
            noAccounts: "当前还没有收款账户。",
            noPayouts: "当前还没有打款申请。",
            ledger: "余额流水",
            noEntries: "当前还没有流水记录。",
            orders: "分账订单",
            noOrders: "当前还没有分账订单。",
            plugin: "插件",
            buyer: "购买方",
            stateLabel: "状态",
            reason: "原因",
            reference: "关联标识",
            occurredAt: "发生时间",
            amountCol: "金额",
            pendingVerification: "待校验",
            verified: "已校验",
            suspended: "已停用",
            pendingReview: "待审核",
            approved: "已批准",
            rejected: "已拒绝",
            errorCreateAccount: "创建收款账户失败。",
            errorPayout: "提交打款申请失败。",
          },
          revenue: "累计已确认收入",
        };

  return (
    <section className="admin-shell">
      <div className="container admin-page">
        <div className="admin-header">
          <div className="admin-header-copy">
            <p className="text-eyebrow">{content.eyebrow}</p>
            <h1 className="admin-title">{content.title}</h1>
            <p className="admin-subtitle">{content.lead}</p>
          </div>
        </div>

        <div className="grid-3">
          <div className="stat-card feature">
            <p className="stat-label">{content.revenue}</p>
            <p className="stat-value">¥{(totalRevenue / 100).toFixed(2)}</p>
          </div>
          <div className="stat-card">
            <p className="stat-label">{locale === "en" ? "Available balance" : "可用余额"}</p>
            <p className="stat-value">¥{(balance.available / 100).toFixed(2)}</p>
          </div>
          <div className="stat-card">
            <p className="stat-label">{locale === "en" ? "Frozen balance" : "冻结余额"}</p>
            <p className="stat-value">¥{(balance.frozen / 100).toFixed(2)}</p>
          </div>
        </div>

        <SalesManager
          locale={locale}
          initialAccounts={accounts.map((account) => ({
            ...account,
            verifiedAt: account.verifiedAt?.toISOString() ?? null,
            createdAt: account.createdAt.toISOString(),
          }))}
          initialPayouts={payouts.map((request) => ({
            ...request,
            createdAt: request.createdAt.toISOString(),
            processedAt: request.processedAt?.toISOString() ?? null,
          }))}
          initialEntries={entries.map((entry) => ({
            ...entry,
            occurredAt: entry.occurredAt.toISOString(),
          }))}
          initialOrders={orders.map((order) => ({
            ...order,
            paidAt: order.paidAt?.toISOString() ?? null,
            createdAt: order.createdAt.toISOString(),
          }))}
          initialBalance={balance}
          labels={content.labels}
        />
      </div>
    </section>
  );
}
