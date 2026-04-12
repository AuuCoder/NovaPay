import Link from "next/link";
import { retryCallbackAction } from "@/app/admin/actions";
import {
  getCallbackStatusLabel,
  formatDateTime,
  formatMoney,
  getCallbackStatusTone,
  getPaymentStatusLabel,
  getPaymentStatusTone,
  readPageMessages,
  type SearchParamsInput,
} from "@/app/admin/support";
import {
  AdminPageHeader,
  FlashMessage,
  StatCard,
  StatusBadge,
  buttonClass,
  panelClass,
  subtleButtonClass,
  tableWrapperClass,
} from "@/app/admin/ui";
import { CallbackDeliveryStatus, PaymentStatus } from "@/generated/prisma/enums";
import { requireAdminPermission } from "@/lib/admin-session";
import { getCurrentLocale } from "@/lib/i18n-server";
import { getMerchantDisplayName } from "@/lib/merchant-profile-completion";
import { getPrismaClient } from "@/lib/prisma";

export default async function AdminDashboardPage({
  searchParams,
}: {
  searchParams?: SearchParamsInput;
}) {
  await requireAdminPermission("dashboard:view");
  const prisma = getPrismaClient();
  const messages = await readPageMessages(searchParams);
  const locale = await getCurrentLocale();
  const content =
    locale === "en"
      ? {
          headerEyebrow: "Operations",
          headerTitle: "Multi-merchant operations overview",
          headerDesc:
            "A unified operating overview for payment gateway governance, surfacing merchant scale, channel configuration, transaction performance, and callback exceptions.",
          ordersButton: "Open Order Center",
          docsButton: "API Docs",
          statMerchants: "Merchants",
          statMerchantsDetail: "Total merchants onboarded to the platform",
          statChannels: "Channels",
          statChannelsDetail: "Merchant-owned channel instances configured",
          statBindings: "Bindings",
          statBindingsDetail: "Channel routing rules configured for merchants",
          statOrders: "Orders",
          statOrdersDetail: "Total payment orders processed",
          statSuccessRate: "Success Rate",
          statSuccessRateDetail: "Overall payment success rate",
          statGmv: "GMV",
          statGmvDetail: "Cumulative succeeded transaction amount",
          workbenchEyebrow: "Workbench",
          workbenchTitle: "Operations Workbench",
          workbenchDesc:
            "Core operating workflows are split into dedicated workbenches to support team collaboration and duty segregation in enterprise environments.",
          alertsEyebrow: "Alerts",
          alertsTitle: "Operational Alerts",
          legacyTitle: "Legacy platform bindings",
          legacyDesc:
            "A count above 0 indicates that some merchants are still bound to legacy platform-owned accounts and should be migrated to merchant-owned channel instances.",
          pendingTitle: "Pending merchant callbacks",
          pendingDesc: "Number of orders currently in `PENDING` callback status.",
          failedTitle: "Failed merchant callbacks",
          failedDesc: "Number of orders currently in `FAILED` callback status. Review the callback center first.",
          failedListButton: "Open Failed Callback List",
          recentEyebrow: "Recent Transactions",
          recentTitle: "Recent Orders",
          recentDesc: "The dashboard intentionally shows only the latest 8 orders. Use Order Center for full-volume filtering and paging.",
          recentButton: "Open Full Order Center",
          orderCol: "Order",
          merchantCol: "Merchant",
          amountCol: "Amount",
          paymentStatusCol: "Payment Status",
          callbackCol: "Callback",
          timeCol: "Time",
          actionsCol: "Actions",
          createdAt: "Created",
          paidAt: "Paid",
          retry: "Retry Callback",
          noProviderStatus: "—",
          workbenches: [
            {
              href: "/admin/merchants",
              title: "Merchant Center",
              detail: "Search merchants by code and status, then manage secrets, callbacks, and routing in detail views.",
            },
            {
              href: "/admin/orders",
              title: "Order Center",
              detail: "Query transactions across merchants, inspect payment status, and execute operational actions.",
            },
            {
              href: "/admin/finance",
              title: "Finance Center",
              detail: "Review reconciliation summaries, net changes, and ledger records by merchant and date.",
            },
            {
              href: "/admin/callbacks",
              title: "Callback Center",
              detail: "Handle callback failures, retries, and endpoint exceptions from a central queue.",
            },
            {
              href: "/admin/audit-logs",
              title: "Audit Logs",
              detail: "Track critical back-office actions for accountability and audit readiness.",
            },
            {
              href: "/admin/idempotency",
              title: "Idempotency",
              detail: "Trace merchant write-request retries, cached replays, and retryable failures.",
            },
          ],
          enabled: "enabled",
          disabled: "disabled",
        }
      : {
          headerEyebrow: "Operations",
          headerTitle: "多商户运营总览",
          headerDesc:
            "面向支付网关运营管理提供统一总览，集中展示商户规模、通道配置、交易表现与回调异常，并支持快速进入对应工作台。",
          ordersButton: "进入订单中心",
          docsButton: "查看 API 文档",
          statMerchants: "商户数",
          statMerchantsDetail: "平台已入驻商户总数",
          statChannels: "通道实例",
          statChannelsDetail: "商户已配置的自有支付通道实例数",
          statBindings: "路由绑定",
          statBindingsDetail: "商户通道路由规则总数",
          statOrders: "订单数",
          statOrdersDetail: "累计支付订单总量",
          statSuccessRate: "成功率",
          statSuccessRateDetail: "全平台支付成功率",
          statGmv: "交易总额",
          statGmvDetail: "累计成功交易金额",
          workbenchEyebrow: "Workbench",
          workbenchTitle: "运营工作台",
          workbenchDesc:
            "核心运营流程按功能域划分为独立工作台，便于在企业场景下开展分工协作与职责管控。",
          alertsEyebrow: "Alerts",
          alertsTitle: "运营告警",
          legacyTitle: "遗留平台收款绑定",
          legacyDesc:
            "该数量大于 0 表示仍存在旧的平台账号绑定，需要尽快迁移至商户自有通道实例模式。",
          pendingTitle: "待处理商户回调",
          pendingDesc: "商户回调处于 `PENDING` 的订单数量。",
          failedTitle: "失败商户回调",
          failedDesc: "商户回调处于 `FAILED` 的订单数量，建议优先进入回调中心处理。",
          failedListButton: "打开失败回调列表",
          recentEyebrow: "Recent Transactions",
          recentTitle: "最近订单",
          recentDesc: "首页只展示最新 8 笔订单，完整的大批量检索与翻页统一在订单中心处理。",
          recentButton: "打开完整订单中心",
          orderCol: "订单",
          merchantCol: "商户",
          amountCol: "金额",
          paymentStatusCol: "支付状态",
          callbackCol: "回调状态",
          timeCol: "时间",
          actionsCol: "操作",
          createdAt: "创建",
          paidAt: "支付",
          retry: "重试回调",
          noProviderStatus: "—",
          workbenches: [
            {
              href: "/admin/merchants",
              title: "商户中心",
              detail: "按编码和状态查找商户，进入详情页处理密钥、回调和通道路由。",
            },
            {
              href: "/admin/orders",
              title: "订单中心",
              detail: "从多商户维度统一检索交易、查看支付状态并执行运营动作。",
            },
            {
              href: "/admin/finance",
              title: "资金中心",
              detail: "按日期和商户查看对账日报、净额变化与逐笔资金流水。",
            },
            {
              href: "/admin/callbacks",
              title: "回调中心",
              detail: "集中处理商户回调失败、重试投递和回调目标异常。",
            },
            {
              href: "/admin/audit-logs",
              title: "审计日志",
              detail: "跟踪后台关键动作，支撑企业环境下的追责和留痕。",
            },
            {
              href: "/admin/idempotency",
              title: "幂等追踪",
              detail: "追踪商户写请求的安全重试、结果复用与可重试失败。",
            },
          ],
          enabled: "enabled",
          disabled: "disabled",
        };
  const [
    merchantCount,
    merchantChannelAccountCount,
    legacyPlatformBindingCount,
    bindingCount,
    totalOrders,
    successfulOrders,
    pendingCallbacks,
    failedCallbacks,
    gmv,
    recentOrders,
  ] = await Promise.all([
    prisma.merchant.count(),
    prisma.merchantChannelAccount.count(),
    prisma.merchantChannelBinding.count({
      where: {
        providerAccountId: {
          not: null,
        },
      },
    }),
    prisma.merchantChannelBinding.count(),
    prisma.paymentOrder.count(),
    prisma.paymentOrder.count({
      where: {
        status: PaymentStatus.SUCCEEDED,
      },
    }),
    prisma.paymentOrder.count({
      where: {
        callbackStatus: CallbackDeliveryStatus.PENDING,
      },
    }),
    prisma.paymentOrder.count({
      where: {
        callbackStatus: CallbackDeliveryStatus.FAILED,
      },
    }),
    prisma.paymentOrder.aggregate({
      where: {
        status: PaymentStatus.SUCCEEDED,
      },
      _sum: {
        amount: true,
      },
    }),
    prisma.paymentOrder.findMany({
      orderBy: [{ createdAt: "desc" }],
      take: 8,
      include: {
        merchant: {
          select: {
            id: true,
            code: true,
            name: true,
          },
        },
      },
    }),
  ]);
  const successRate = totalOrders > 0 ? `${((successfulOrders / totalOrders) * 100).toFixed(1)}%` : "0%";

  return (
    <div className="space-y-8">
      <AdminPageHeader
        eyebrow={content.headerEyebrow}
        title={content.headerTitle}
        description={content.headerDesc}
        actions={
          <>
            <Link href="/admin/orders" className={buttonClass}>
              {content.ordersButton}
            </Link>
            <Link href="/docs" className={subtleButtonClass}>
              {content.docsButton}
            </Link>
          </>
        }
      />

      <FlashMessage success={messages.success} error={messages.error} />

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
        <StatCard label={content.statMerchants} value={merchantCount} detail={content.statMerchantsDetail} />
        <StatCard
          label={content.statChannels}
          value={merchantChannelAccountCount}
          detail={content.statChannelsDetail}
        />
        <StatCard label={content.statBindings} value={bindingCount} detail={content.statBindingsDetail} />
        <StatCard label={content.statOrders} value={totalOrders} detail={content.statOrdersDetail} />
        <StatCard label={content.statSuccessRate} value={successRate} detail={content.statSuccessRateDetail} />
        <StatCard
          label={content.statGmv}
          value={formatMoney(gmv._sum.amount?.toString() ?? 0, "CNY", locale)}
          detail={content.statGmvDetail}
        />
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <article className={`${panelClass} p-6`}>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.22em] text-muted">{content.workbenchEyebrow}</p>
              <h2 className="mt-2 text-2xl font-semibold text-foreground">{content.workbenchTitle}</h2>
            </div>
            <p className="max-w-xl text-sm leading-7 text-muted">{content.workbenchDesc}</p>
          </div>
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            {content.workbenches.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-[1.5rem] border border-line bg-white/75 p-5 transition hover:border-accent/40 hover:shadow-[0_16px_40px_rgba(79,46,17,0.08)]"
              >
                <p className="text-lg font-semibold text-foreground">{item.title}</p>
                <p className="mt-2 text-sm leading-7 text-muted">{item.detail}</p>
              </Link>
            ))}
          </div>
        </article>

        <article className={`${panelClass} p-6`}>
          <p className="text-xs uppercase tracking-[0.22em] text-muted">{content.alertsEyebrow}</p>
          <h2 className="mt-2 text-2xl font-semibold text-foreground">{content.alertsTitle}</h2>
          <div className="mt-6 space-y-4">
            <div className="rounded-[1.5rem] border border-line bg-white/75 p-5">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium text-foreground">{content.legacyTitle}</p>
                <StatusBadge tone={legacyPlatformBindingCount > 0 ? "danger" : "success"}>
                  {legacyPlatformBindingCount}
                </StatusBadge>
              </div>
              <p className="mt-2 text-sm leading-7 text-muted">{content.legacyDesc}</p>
            </div>
            <div className="rounded-[1.5rem] border border-line bg-white/75 p-5">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium text-foreground">{content.pendingTitle}</p>
                <StatusBadge tone={pendingCallbacks > 0 ? "warning" : "success"}>
                  {pendingCallbacks}
                </StatusBadge>
              </div>
              <p className="mt-2 text-sm leading-7 text-muted">{content.pendingDesc}</p>
            </div>
            <div className="rounded-[1.5rem] border border-line bg-white/75 p-5">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium text-foreground">{content.failedTitle}</p>
                <StatusBadge tone={failedCallbacks > 0 ? "danger" : "success"}>
                  {failedCallbacks}
                </StatusBadge>
              </div>
              <p className="mt-2 text-sm leading-7 text-muted">{content.failedDesc}</p>
            </div>
            <Link href="/admin/callbacks?status=FAILED" className="inline-flex rounded-2xl border border-line bg-white/80 px-4 py-2.5 text-sm font-medium text-foreground">
              {content.failedListButton}
            </Link>
          </div>
        </article>
      </section>

      <section className={`${panelClass} p-6`}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.22em] text-muted">{content.recentEyebrow}</p>
            <h2 className="mt-2 text-2xl font-semibold text-foreground">{content.recentTitle}</h2>
          </div>
          <div className="flex flex-col gap-3 sm:items-end">
            <p className="max-w-xl text-sm leading-7 text-muted">{content.recentDesc}</p>
            <Link href="/admin/orders" className="rounded-2xl border border-line bg-white/80 px-4 py-2.5 text-sm font-medium text-foreground">
              {content.recentButton}
            </Link>
          </div>
        </div>

        <div className={`mt-6 ${tableWrapperClass}`}>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-[#f3e7d7] text-xs uppercase tracking-[0.18em] text-muted">
                <tr>
                  <th className="px-4 py-3">{content.orderCol}</th>
                  <th className="px-4 py-3">{content.merchantCol}</th>
                  <th className="px-4 py-3">{content.amountCol}</th>
                  <th className="px-4 py-3">{content.paymentStatusCol}</th>
                  <th className="px-4 py-3">{content.callbackCol}</th>
                  <th className="px-4 py-3">{content.timeCol}</th>
                  <th className="px-4 py-3">{content.actionsCol}</th>
                </tr>
              </thead>
              <tbody>
                {recentOrders.map((order) => (
                  <tr key={order.id} className="border-t border-line/70 align-top">
                    <td className="px-4 py-4">
                      <p className="font-mono text-xs text-foreground">{order.id}</p>
                      <p className="mt-1 text-xs text-muted">{order.externalOrderId}</p>
                    </td>
                    <td className="px-4 py-4">
                      <Link href={`/admin/merchants/${order.merchant.id}`} className="font-medium text-foreground hover:text-accent">
                        {getMerchantDisplayName(order.merchant.name, locale)}
                      </Link>
                      <p className="mt-1 text-xs text-muted">{order.merchant.code}</p>
                    </td>
                    <td className="px-4 py-4 text-xs text-foreground">
                      {formatMoney(order.amount.toString(), order.currency, locale)}
                    </td>
                    <td className="px-4 py-4">
                      <StatusBadge tone={getPaymentStatusTone(order.status)}>
                        {getPaymentStatusLabel(order.status, locale)}
                      </StatusBadge>
                      <p className="mt-2 text-xs text-muted">{order.providerStatus ?? content.noProviderStatus}</p>
                    </td>
                    <td className="px-4 py-4">
                      <StatusBadge tone={getCallbackStatusTone(order.callbackStatus)}>
                        {getCallbackStatusLabel(order.callbackStatus, locale)}
                      </StatusBadge>
                    </td>
                    <td className="px-4 py-4 text-xs text-muted">
                      <p>{content.createdAt} {formatDateTime(order.createdAt, locale)}</p>
                      <p className="mt-1">{content.paidAt} {formatDateTime(order.paidAt, locale)}</p>
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex flex-wrap gap-2">
                        <form action={retryCallbackAction}>
                          <input type="hidden" name="orderId" value={order.id} />
                          <input type="hidden" name="redirectTo" value="/admin" />
                          <button
                            type="submit"
                            className="rounded-xl border border-line bg-white px-3 py-2 text-xs font-medium text-foreground"
                          >
                            {content.retry}
                          </button>
                        </form>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}
