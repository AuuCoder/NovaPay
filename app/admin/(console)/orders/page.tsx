import Link from "next/link";
import { retryCallbackAction } from "@/app/admin/actions";
import {
  buildPageHref,
  formatDateTime,
  formatMoney,
  getPaginationState,
  getCallbackStatusLabel,
  getCallbackStatusTone,
  getPaymentChannelOptions,
  getPaymentStatusLabel,
  getPaymentStatusTone,
  parsePageParam,
  readSearchFilters,
  type SearchParamsInput,
} from "@/app/admin/support";
import {
  AdminPageHeader,
  LabeledField,
  PaginationNav,
  StatCard,
  StatusBadge,
  buttonClass,
  inputClass,
  panelClass,
  selectClass,
  tableWrapperClass,
} from "@/app/admin/ui";
import { PaymentStatus } from "@/generated/prisma/enums";
import { requireAdminPermission } from "@/lib/admin-session";
import { getCurrentLocale } from "@/lib/i18n-server";
import { getMerchantDisplayName } from "@/lib/merchant-profile-completion";
import { getPrismaClient } from "@/lib/prisma";

const ORDER_PAGE_SIZE = 30;

export default async function OrdersPage({
  searchParams,
}: {
  searchParams?: SearchParamsInput;
}) {
  await requireAdminPermission("order:read");
  const prisma = getPrismaClient();
  const locale = await getCurrentLocale();
  const paymentChannelOptions = getPaymentChannelOptions(locale);
  const filters = await readSearchFilters(searchParams, [
    "merchantCode",
    "channelCode",
    "status",
    "callbackStatus",
    "q",
    "page",
  ]);
  const requestedPage = parsePageParam(filters.page);
  const content =
    locale === "en"
      ? {
          eyebrow: "Order Center",
          title: "Order center",
          description:
            "This is the core multi-merchant operations page for filtering transactions by merchant, channel, payment status, and merchant callback status, then taking operational actions.",
          callbacksButton: "Open Callback Center",
          filteredOrders: "Filtered Orders",
          filteredOrdersDetail: "Records returned by the current filter",
          succeeded: "Succeeded",
          succeededDetail: "Successful payment orders",
          pending: "Pending",
          pendingDetail: "Orders awaiting payment",
          failed: "Failed",
          failedDetail: "Failed orders",
          filterTitle: "Order filters",
          merchantLabel: "Merchant",
          allMerchants: "All Merchants",
          channelLabel: "Channel",
          allChannels: "All Channels",
          paymentStatusLabel: "Payment Status",
          allStatuses: "All Statuses",
          callbackStatusLabel: "Merchant Callback",
          allCallbackStatuses: "All Callback Statuses",
          keywordLabel: "Keyword",
          keywordPlaceholder: "Order ID / external order ID / gateway order ID",
          submit: "Search Orders",
          transactionsEyebrow: "Transactions",
          transactionsTitle: "Order list",
          transactionsDesc:
            "Supports callback redelivery for terminal orders while continuously tracking callback status and failure reasons.",
          pageWindow: "Page Window",
          pageWindowDetail: "30 records per page for large-volume operations",
          orderCol: "Order",
          merchantCol: "Merchant",
          channelCol: "Channel",
          amountCol: "Amount",
          paymentStatusCol: "Payment Status",
          callbackCol: "Merchant Callback",
          timeCol: "Time",
          actionsCol: "Actions",
          createdAt: "Created",
          paidAt: "Paid",
          openPay: "Open Payment Page",
          retry: "Retry Callback",
          pageSummary: "Page",
          pageRange: "Showing",
          pageConnector: "of",
          previous: "Previous Page",
          next: "Next Page",
        }
      : {
          eyebrow: "Order Center",
          title: "订单中心",
          description:
            "这是多商户后台的核心页面，用来按商户、通道、支付状态、商户回调状态统一检索交易，并进行运营动作。",
          callbacksButton: "查看回调中心",
          filteredOrders: "Filtered Orders",
          filteredOrdersDetail: "当前筛选结果数量",
          succeeded: "Succeeded",
          succeededDetail: "已成功支付订单数",
          pending: "Pending",
          pendingDetail: "待支付订单数",
          failed: "Failed",
          failedDetail: "失败订单数",
          filterTitle: "订单筛选",
          merchantLabel: "商户",
          allMerchants: "全部商户",
          channelLabel: "通道",
          allChannels: "全部通道",
          paymentStatusLabel: "支付状态",
          allStatuses: "全部状态",
          callbackStatusLabel: "商户回调",
          allCallbackStatuses: "全部回调状态",
          keywordLabel: "关键词",
          keywordPlaceholder: "订单号 / 外部单号 / 网关单号",
          submit: "查询订单",
          transactionsEyebrow: "Transactions",
          transactionsTitle: "订单列表",
          transactionsDesc: "支持针对终态订单重新投递商户回调，并持续跟踪回调状态与失败原因。",
          pageWindow: "Page Window",
          pageWindowDetail: "每页展示 30 条，适合大规模订单检索",
          orderCol: "订单",
          merchantCol: "商户",
          channelCol: "通道",
          amountCol: "金额",
          paymentStatusCol: "支付状态",
          callbackCol: "商户回调",
          timeCol: "时间",
          actionsCol: "操作",
          createdAt: "创建",
          paidAt: "支付",
          openPay: "打开支付页",
          retry: "重试回调",
          pageSummary: "页码",
          pageRange: "当前显示",
          pageConnector: "共",
          previous: "上一页",
          next: "下一页",
        };

  const keyword = filters.q;
  const where = {
    ...(filters.merchantCode ? { merchant: { code: filters.merchantCode } } : {}),
    ...(filters.channelCode ? { channelCode: filters.channelCode } : {}),
    ...(filters.status ? { status: filters.status as PaymentStatus } : {}),
    ...(filters.callbackStatus ? { callbackStatus: filters.callbackStatus as never } : {}),
    ...(keyword
      ? {
          OR: [
            { id: { contains: keyword, mode: "insensitive" as const } },
            { externalOrderId: { contains: keyword, mode: "insensitive" as const } },
            { gatewayOrderId: { contains: keyword, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const [merchants, totalCount, successCount, pendingCount, failedCount] = await Promise.all([
    prisma.merchant.findMany({
      orderBy: [{ code: "asc" }],
      select: {
        code: true,
        name: true,
      },
    }),
    prisma.paymentOrder.count({ where }),
    prisma.paymentOrder.count({
      where: {
        ...where,
        status: PaymentStatus.SUCCEEDED,
      },
    }),
    prisma.paymentOrder.count({
      where: {
        ...where,
        status: PaymentStatus.PENDING,
      },
    }),
    prisma.paymentOrder.count({
      where: {
        ...where,
        status: PaymentStatus.FAILED,
      },
    }),
  ]);
  const { currentPage, totalPages, offset, pageStart, pageEnd } = getPaginationState(
    totalCount,
    requestedPage,
    ORDER_PAGE_SIZE,
  );
  const orders = await prisma.paymentOrder.findMany({
    where,
    orderBy: [{ createdAt: "desc" }],
    skip: offset,
    take: ORDER_PAGE_SIZE,
    include: {
      merchant: {
        select: {
          id: true,
          code: true,
          name: true,
        },
      },
    },
  });
  const baseFilters = {
    merchantCode: filters.merchantCode,
    channelCode: filters.channelCode,
    status: filters.status,
    callbackStatus: filters.callbackStatus,
    q: keyword,
  };
  const currentPageHref = buildPageHref("/admin/orders", baseFilters, currentPage);

  return (
    <div className="space-y-8">
      <AdminPageHeader
        eyebrow={content.eyebrow}
        title={content.title}
        description={content.description}
        actions={
          <Link href="/admin/callbacks" className={buttonClass}>
            {content.callbacksButton}
          </Link>
        }
      />

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <StatCard label={content.filteredOrders} value={totalCount} detail={content.filteredOrdersDetail} />
        <StatCard label={content.succeeded} value={successCount} detail={content.succeededDetail} />
        <StatCard label={content.pending} value={pendingCount} detail={content.pendingDetail} />
        <StatCard label={content.failed} value={failedCount} detail={content.failedDetail} />
        <StatCard
          label={content.pageWindow}
          value={`${currentPage}/${totalPages}`}
          detail={content.pageWindowDetail}
        />
      </section>

      <section className={`${panelClass} p-6`}>
        <h2 className="text-2xl font-semibold text-foreground">{content.filterTitle}</h2>
        <form className="mt-6 grid gap-4 lg:grid-cols-5">
          <LabeledField label={content.merchantLabel}>
            <select name="merchantCode" defaultValue={filters.merchantCode} className={selectClass}>
              <option value="">{content.allMerchants}</option>
              {merchants.map((merchant) => (
                <option key={merchant.code} value={merchant.code}>
                  {merchant.code} / {getMerchantDisplayName(merchant.name, locale)}
                </option>
              ))}
            </select>
          </LabeledField>
          <LabeledField label={content.channelLabel}>
            <select name="channelCode" defaultValue={filters.channelCode} className={selectClass}>
              <option value="">{content.allChannels}</option>
              {paymentChannelOptions.map((channel) => (
                <option key={channel.code} value={channel.code}>
                  {channel.title}
                </option>
              ))}
            </select>
          </LabeledField>
          <LabeledField label={content.paymentStatusLabel}>
            <select name="status" defaultValue={filters.status} className={selectClass}>
              <option value="">{content.allStatuses}</option>
              <option value="PENDING">{getPaymentStatusLabel("PENDING", locale)}</option>
              <option value="PROCESSING">{getPaymentStatusLabel("PROCESSING", locale)}</option>
              <option value="SUCCEEDED">{getPaymentStatusLabel("SUCCEEDED", locale)}</option>
              <option value="FAILED">{getPaymentStatusLabel("FAILED", locale)}</option>
              <option value="CANCELLED">{getPaymentStatusLabel("CANCELLED", locale)}</option>
            </select>
          </LabeledField>
          <LabeledField label={content.callbackStatusLabel}>
            <select name="callbackStatus" defaultValue={filters.callbackStatus} className={selectClass}>
              <option value="">{content.allCallbackStatuses}</option>
              <option value="NOT_REQUIRED">{getCallbackStatusLabel("NOT_REQUIRED", locale)}</option>
              <option value="PENDING">{getCallbackStatusLabel("PENDING", locale)}</option>
              <option value="PROCESSING">{getCallbackStatusLabel("PROCESSING", locale)}</option>
              <option value="DELIVERED">{getCallbackStatusLabel("DELIVERED", locale)}</option>
              <option value="FAILED">{getCallbackStatusLabel("FAILED", locale)}</option>
            </select>
          </LabeledField>
          <LabeledField label={content.keywordLabel}>
            <input
              name="q"
              defaultValue={keyword}
              placeholder={content.keywordPlaceholder}
              className={inputClass}
            />
          </LabeledField>
          <div className="lg:col-span-5">
            <button type="submit" className={buttonClass}>
              {content.submit}
            </button>
          </div>
        </form>
      </section>

      <section className={`${panelClass} p-6`}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.22em] text-muted">{content.transactionsEyebrow}</p>
            <h2 className="mt-2 text-2xl font-semibold text-foreground">{content.transactionsTitle}</h2>
          </div>
          <div className="max-w-2xl">
            <p className="text-sm leading-7 text-muted">{content.transactionsDesc}</p>
            <p className="mt-2 text-xs text-muted">
              {content.pageSummary} {currentPage}/{totalPages} · {content.pageRange} {pageStart}-{pageEnd} {content.pageConnector} {totalCount}
            </p>
          </div>
        </div>

        <div className={`mt-6 ${tableWrapperClass}`}>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-[#f3e7d7] text-xs uppercase tracking-[0.18em] text-muted">
                <tr>
                  <th className="px-4 py-3">{content.orderCol}</th>
                  <th className="px-4 py-3">{content.merchantCol}</th>
                  <th className="px-4 py-3">{content.channelCol}</th>
                  <th className="px-4 py-3">{content.amountCol}</th>
                  <th className="px-4 py-3">{content.paymentStatusCol}</th>
                  <th className="px-4 py-3">{content.callbackCol}</th>
                  <th className="px-4 py-3">{content.timeCol}</th>
                  <th className="px-4 py-3">{content.actionsCol}</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => (
                  <tr key={order.id} className="border-t border-line/70 align-top">
                    <td className="px-4 py-4">
                      <p className="font-mono text-xs text-foreground">{order.id}</p>
                      <p className="mt-1 text-xs text-muted">{order.externalOrderId}</p>
                      <p className="mt-1 text-xs text-muted">{order.gatewayOrderId ?? "—"}</p>
                    </td>
                    <td className="px-4 py-4">
                      <Link href={`/admin/merchants/${order.merchant.id}`} className="font-medium text-foreground hover:text-accent">
                        {getMerchantDisplayName(order.merchant.name, locale)}
                      </Link>
                      <p className="mt-1 text-xs text-muted">{order.merchant.code}</p>
                    </td>
                    <td className="px-4 py-4 font-mono text-xs text-foreground">{order.channelCode}</td>
                    <td className="px-4 py-4 text-xs text-foreground">
                      {formatMoney(order.amount.toString(), order.currency, locale)}
                    </td>
                    <td className="px-4 py-4">
                      <StatusBadge tone={getPaymentStatusTone(order.status)}>
                        {getPaymentStatusLabel(order.status, locale)}
                      </StatusBadge>
                      <p className="mt-2 text-xs text-muted">{order.providerStatus ?? "—"}</p>
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
                        {order.checkoutUrl ? (
                          <Link
                          href={`/pay/${order.id}`}
                          className="rounded-xl border border-line bg-white px-3 py-2 text-xs font-medium text-foreground"
                        >
                          {content.openPay}
                        </Link>
                        ) : null}
                        <form action={retryCallbackAction}>
                          <input type="hidden" name="orderId" value={order.id} />
                          <input type="hidden" name="redirectTo" value={currentPageHref} />
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

        <PaginationNav
          summary={`${content.pageSummary} ${currentPage}/${totalPages} · ${content.pageRange} ${pageStart}-${pageEnd} ${content.pageConnector} ${totalCount}`}
          previousHref={
            currentPage > 1 ? buildPageHref("/admin/orders", baseFilters, currentPage - 1) : null
          }
          previousLabel={content.previous}
          nextHref={
            currentPage < totalPages
              ? buildPageHref("/admin/orders", baseFilters, currentPage + 1)
              : null
          }
          nextLabel={content.next}
        />
      </section>
    </div>
  );
}
