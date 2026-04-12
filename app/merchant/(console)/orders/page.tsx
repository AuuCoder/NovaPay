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
  readPageMessages,
  readSearchFilters,
  type SearchParamsInput,
} from "@/app/admin/support";
import {
  FlashMessage,
  AdminPageHeader,
  PaginationNav,
  StatCard,
  StatusBadge,
  buttonClass,
  inputClass,
  panelClass,
  selectClass,
  tableWrapperClass,
} from "@/app/admin/ui";
import { closeMerchantOrderAction, syncMerchantOrderAction } from "@/app/merchant/actions";
import { PaymentRefundStatus, PaymentStatus } from "@/generated/prisma/enums";
import { getCurrentLocale } from "@/lib/i18n-server";
import { hasMerchantPermission } from "@/lib/merchant-rbac";
import { requireMerchantPermission } from "@/lib/merchant-session";
import { getPrismaClient } from "@/lib/prisma";

const paymentStatuses = ["", "PENDING", "PROCESSING", "SUCCEEDED", "FAILED", "CANCELLED"];
const MERCHANT_ORDER_PAGE_SIZE = 30;

export default async function MerchantOrdersPage({
  searchParams,
}: {
  searchParams?: SearchParamsInput;
}) {
  const session = await requireMerchantPermission("order:read");
  const prisma = getPrismaClient();
  const locale = await getCurrentLocale();
  const [filters, messages] = await Promise.all([
    readSearchFilters(searchParams, ["status", "channelCode", "q", "page"]),
    readPageMessages(searchParams),
  ]);
  const requestedPage = parsePageParam(filters.page);
  const paymentChannelOptions = getPaymentChannelOptions(locale);
  const canManageOrders = hasMerchantPermission(session.merchantUser.role, "order:write");
  const canReadRefunds = hasMerchantPermission(session.merchantUser.role, "refund:read");
  const content =
    locale === "en"
      ? {
          eyebrow: "Orders",
          title: "My orders",
          description:
            "Only orders that belong to the current merchant are shown here. Filter quickly by payment status, channel, or keyword.",
          statOrders: "Orders",
          statOrdersDetail: "Total orders for the current merchant",
          statSucceeded: "Succeeded",
          statSucceededDetail: "Successful payment orders",
          statPending: "Pending",
          statPendingDetail: "Orders awaiting payment",
          statFailed: "Failed",
          statFailedDetail: "Failed payment orders",
          keyword: "Keyword",
          keywordPlaceholder: "Order ID / merchant order ID / subject",
          status: "Payment Status",
          allStatuses: "All Statuses",
          channel: "Payment Channel",
          allChannels: "All Channels",
          filter: "Filter",
          externalOrderId: "Merchant Order ID",
          subject: "Subject",
          amount: "Amount",
          paymentStatus: "Payment Status",
          callbackStatus: "Callback Status",
          time: "Time",
          actions: "Actions",
          noResults: "No orders matched the current filter.",
          providerPending: "Waiting for provider status",
          refundableAmount: "Refundable Balance",
          merchantAccount: "Merchant Instance",
          missingBinding: "No instance binding",
          createdAt: "Created",
          paidAt: "Paid",
          sync: "Sync Status",
          close: "Close Order",
          openPay: "Open Payment Page",
          createRefund: "Create Refund",
          pageSummary: "Page",
          pageRange: "Showing",
          pageConnector: "of",
          previous: "Previous Page",
          next: "Next Page",
        }
      : {
          eyebrow: "Orders",
          title: "我的订单",
          description:
            "这里只显示当前商户自己的订单，不会混入其他商户的数据。你可以按支付状态、通道和关键字快速筛选。",
          statOrders: "Orders",
          statOrdersDetail: "当前商户累计订单",
          statSucceeded: "Succeeded",
          statSucceededDetail: "支付成功订单数",
          statPending: "Pending",
          statPendingDetail: "待支付订单数",
          statFailed: "Failed",
          statFailedDetail: "支付失败订单数",
          keyword: "关键词",
          keywordPlaceholder: "订单号 / 商户订单号 / 标题",
          status: "支付状态",
          allStatuses: "全部状态",
          channel: "支付通道",
          allChannels: "全部通道",
          filter: "筛选",
          externalOrderId: "商户订单号",
          subject: "标题",
          amount: "金额",
          paymentStatus: "支付状态",
          callbackStatus: "回调状态",
          time: "时间",
          actions: "操作",
          noResults: "当前筛选条件下没有找到订单。",
          providerPending: "等待支付平台状态",
          refundableAmount: "可退余额",
          merchantAccount: "商户实例",
          missingBinding: "缺少实例绑定",
          createdAt: "创建",
          paidAt: "支付",
          sync: "同步状态",
          close: "关闭订单",
          openPay: "打开支付页",
          createRefund: "发起退款",
          pageSummary: "页码",
          pageRange: "当前显示",
          pageConnector: "共",
          previous: "上一页",
          next: "下一页",
        };
  const where = {
    merchantId: session.merchantUser.merchantId,
    ...(filters.status ? { status: filters.status as PaymentStatus } : {}),
    ...(filters.channelCode ? { channelCode: filters.channelCode } : {}),
    ...(filters.q
      ? {
          OR: [
            { id: { contains: filters.q, mode: "insensitive" as const } },
            { externalOrderId: { contains: filters.q, mode: "insensitive" as const } },
            { subject: { contains: filters.q, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const [totalCount, successCount, pendingCount, failedCount] = await Promise.all([
    prisma.paymentOrder.count({
      where,
    }),
    prisma.paymentOrder.count({
      where: {
        merchantId: session.merchantUser.merchantId,
        status: PaymentStatus.SUCCEEDED,
      },
    }),
    prisma.paymentOrder.count({
      where: {
        merchantId: session.merchantUser.merchantId,
        status: PaymentStatus.PENDING,
      },
    }),
    prisma.paymentOrder.count({
      where: {
        merchantId: session.merchantUser.merchantId,
        status: PaymentStatus.FAILED,
      },
    }),
  ]);
  const { currentPage, totalPages, offset, pageStart, pageEnd } = getPaginationState(
    totalCount,
    requestedPage,
    MERCHANT_ORDER_PAGE_SIZE,
  );
  const orders = await prisma.paymentOrder.findMany({
    where,
    orderBy: [{ createdAt: "desc" }],
    skip: offset,
    take: MERCHANT_ORDER_PAGE_SIZE,
    select: {
      id: true,
      externalOrderId: true,
      subject: true,
      channelCode: true,
      merchantChannelAccountId: true,
      amount: true,
      currency: true,
      status: true,
      callbackStatus: true,
      providerStatus: true,
      checkoutUrl: true,
      createdAt: true,
      paidAt: true,
      refunds: {
        select: {
          amount: true,
          status: true,
        },
      },
    },
  });
  const currentPageHref = buildPageHref(
    "/merchant/orders",
    {
      status: filters.status,
      channelCode: filters.channelCode,
      q: filters.q,
    },
    currentPage,
  );

  return (
    <div className="space-y-8">
      <AdminPageHeader
        eyebrow={content.eyebrow}
        title={content.title}
        description={content.description}
      />

      <FlashMessage success={messages.success} error={messages.error} />

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label={content.statOrders} value={totalCount} detail={content.statOrdersDetail} />
        <StatCard label={content.statSucceeded} value={successCount} detail={content.statSucceededDetail} />
        <StatCard label={content.statPending} value={pendingCount} detail={content.statPendingDetail} />
        <StatCard label={content.statFailed} value={failedCount} detail={content.statFailedDetail} />
      </section>

      <section className={`${panelClass} p-6`}>
        <form className="grid gap-4 md:grid-cols-[1.2fr_0.8fr_0.8fr_auto]">
          <label className="block space-y-2">
            <span className="text-sm font-medium text-foreground">{content.keyword}</span>
            <input
              name="q"
              defaultValue={filters.q}
              placeholder={content.keywordPlaceholder}
              className={inputClass}
            />
          </label>
          <label className="block space-y-2">
            <span className="text-sm font-medium text-foreground">{content.status}</span>
            <select name="status" defaultValue={filters.status} className={selectClass}>
              {paymentStatuses.map((status) => (
                <option key={status || "all"} value={status}>
                  {status ? getPaymentStatusLabel(status, locale) : content.allStatuses}
                </option>
              ))}
            </select>
          </label>
          <label className="block space-y-2">
            <span className="text-sm font-medium text-foreground">{content.channel}</span>
            <select name="channelCode" defaultValue={filters.channelCode} className={selectClass}>
              <option value="">{content.allChannels}</option>
              {paymentChannelOptions.map((channel) => (
                <option key={channel.code} value={channel.code}>
                  {channel.title}
                </option>
              ))}
            </select>
          </label>
          <div className="flex items-end">
            <button
              type="submit"
              className="inline-flex w-full items-center justify-center rounded-2xl bg-foreground px-4 py-3 text-sm font-medium text-white transition hover:opacity-90"
            >
              {content.filter}
            </button>
          </div>
        </form>
      </section>

      <section className={`${panelClass} p-6`}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm leading-7 text-muted">{content.description}</p>
          </div>
          <p className="text-xs text-muted">
            {content.pageSummary} {currentPage}/{totalPages} · {content.pageRange} {pageStart}-{pageEnd} {content.pageConnector} {totalCount}
          </p>
        </div>

        <div className={`mt-6 ${tableWrapperClass}`}>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-[#f3e7d7] text-xs uppercase tracking-[0.18em] text-muted">
                <tr>
                  <th className="px-4 py-3">{content.externalOrderId}</th>
                  <th className="px-4 py-3">{content.subject}</th>
                  <th className="px-4 py-3">{content.channel}</th>
                  <th className="px-4 py-3">{content.amount}</th>
                  <th className="px-4 py-3">{content.paymentStatus}</th>
                  <th className="px-4 py-3">{content.callbackStatus}</th>
                  <th className="px-4 py-3">{content.time}</th>
                  <th className="px-4 py-3">{content.actions}</th>
                </tr>
              </thead>
              <tbody>
                {orders.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-10 text-center text-sm text-muted">
                      {content.noResults}
                    </td>
                  </tr>
                ) : (
                orders.map((order) => {
                  const reservedRefundStatuses: PaymentRefundStatus[] = [
                    PaymentRefundStatus.PENDING,
                    PaymentRefundStatus.PROCESSING,
                    PaymentRefundStatus.SUCCEEDED,
                  ];
                  const reservedRefundAmount = order.refunds
                    .filter((refund) => reservedRefundStatuses.includes(refund.status))
                    .reduce((sum, refund) => sum + Number(refund.amount.toString()), 0);
                  const refundableAmount = Math.max(
                    Number(order.amount.toString()) - reservedRefundAmount,
                    0,
                  );

                  return (
                    <tr key={order.id} className="border-t border-line/70 align-top">
                      <td className="px-4 py-4">
                        <p className="font-medium text-foreground">{order.externalOrderId}</p>
                        <p className="mt-1 font-mono text-xs text-muted">{order.id}</p>
                      </td>
                      <td className="px-4 py-4">
                        <p className="text-foreground">{order.subject}</p>
                        <p className="mt-1 text-xs text-muted">{order.providerStatus ?? content.providerPending}</p>
                        <p className="mt-1 text-xs text-muted">
                          {content.refundableAmount} {formatMoney(refundableAmount.toFixed(2), order.currency, locale)}
                        </p>
                      </td>
                      <td className="px-4 py-4 font-mono text-xs text-foreground">
                        <p>{order.channelCode}</p>
                        <p className="mt-1 text-[11px] text-muted">
                          {order.merchantChannelAccountId
                            ? content.merchantAccount
                            : content.missingBinding}
                        </p>
                      </td>
                      <td className="px-4 py-4 text-sm text-foreground">
                        {formatMoney(order.amount.toString(), order.currency, locale)}
                      </td>
                      <td className="px-4 py-4">
                        <StatusBadge tone={getPaymentStatusTone(order.status)}>
                          {getPaymentStatusLabel(order.status, locale)}
                        </StatusBadge>
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
                          <form action={syncMerchantOrderAction}>
                            <input type="hidden" name="orderReference" value={order.externalOrderId} />
                            <input type="hidden" name="redirectTo" value={currentPageHref} />
                            <button
                              type="submit"
                              className="rounded-xl border border-line bg-white px-3 py-2 text-xs font-medium text-foreground"
                            >
                              {content.sync}
                            </button>
                          </form>
                          {canManageOrders &&
                          (order.status === "PENDING" || order.status === "PROCESSING") ? (
                            <form action={closeMerchantOrderAction}>
                              <input type="hidden" name="orderReference" value={order.externalOrderId} />
                              <input type="hidden" name="redirectTo" value={currentPageHref} />
                              <button
                                type="submit"
                                className="rounded-xl border border-line bg-white px-3 py-2 text-xs font-medium text-foreground"
                              >
                                {content.close}
                              </button>
                            </form>
                          ) : null}
                          {order.checkoutUrl ? (
                            <a
                              href={`/pay/${order.id}`}
                              className={`${buttonClass} rounded-xl px-3 py-2 text-xs`}
                            >
                              {content.openPay}
                            </a>
                          ) : null}
                          {canReadRefunds && order.status === "SUCCEEDED" ? (
                            <a
                              href={`/merchant/refunds?orderReference=${encodeURIComponent(order.externalOrderId)}`}
                              className="rounded-xl border border-line bg-white px-3 py-2 text-xs font-medium text-foreground"
                            >
                              {content.createRefund}
                            </a>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        </div>

        <PaginationNav
          summary={`${content.pageSummary} ${currentPage}/${totalPages} · ${content.pageRange} ${pageStart}-${pageEnd} ${content.pageConnector} ${totalCount}`}
          previousHref={
            currentPage > 1
              ? buildPageHref(
                  "/merchant/orders",
                  {
                    status: filters.status,
                    channelCode: filters.channelCode,
                    q: filters.q,
                  },
                  currentPage - 1,
                )
              : null
          }
          previousLabel={content.previous}
          nextHref={
            currentPage < totalPages
              ? buildPageHref(
                  "/merchant/orders",
                  {
                    status: filters.status,
                    channelCode: filters.channelCode,
                    q: filters.q,
                  },
                  currentPage + 1,
                )
              : null
          }
          nextLabel={content.next}
        />
      </section>
    </div>
  );
}
