import {
  buildPageHref,
  formatDateTime,
  formatMoney,
  getPaginationState,
  parsePageParam,
  getRefundStatusLabel,
  getRefundStatusTone,
  readPageMessages,
  readSearchFilters,
  type SearchParamsInput,
} from "@/app/admin/support";
import {
  AdminPageHeader,
  FlashMessage,
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
import {
  createMerchantRefundAction,
  syncMerchantRefundAction,
} from "@/app/merchant/actions";
import { PaymentRefundStatus } from "@/generated/prisma/enums";
import { getCurrentLocale } from "@/lib/i18n-server";
import { hasMerchantPermission } from "@/lib/merchant-rbac";
import { requireMerchantPermission } from "@/lib/merchant-session";
import { getPrismaClient } from "@/lib/prisma";

const refundStatuses = ["", "PENDING", "PROCESSING", "SUCCEEDED", "FAILED"];
const MERCHANT_REFUND_PAGE_SIZE = 30;

export default async function MerchantRefundsPage({
  searchParams,
}: {
  searchParams?: SearchParamsInput;
}) {
  const session = await requireMerchantPermission("refund:read");
  const prisma = getPrismaClient();
  const locale = await getCurrentLocale();
  const [filters, messages] = await Promise.all([
    readSearchFilters(searchParams, ["status", "q", "orderReference", "page"]),
    readPageMessages(searchParams),
  ]);
  const requestedPage = parsePageParam(filters.page);
  const canManageRefunds = hasMerchantPermission(session.merchantUser.role, "refund:write");
  const content =
    locale === "en"
      ? {
          eyebrow: "Refunds",
          title: "Refund management",
          description:
            "Create refunds, inspect refund status, and actively synchronize the latest refund results from Alipay or WeChat Pay.",
          openOrders: "Open Orders",
          statRefunds: "Refunds",
          statRefundsDetail: "Total refunds for the current merchant",
          statSucceeded: "Succeeded",
          statSucceededDetail: "Successful refunds",
          statPending: "Pending",
          statPendingDetail: "Pending or processing refunds",
          statFailed: "Failed",
          statFailedDetail: "Failed refunds",
          createEyebrow: "Create Refund",
          createTitle: "Create refund",
          noPermission: "Your current role can view refunds but cannot create new refund requests.",
          orderRefLabel: "Merchant Order ID or Platform Order ID",
          orderRefPlaceholder: "externalOrderId or orderId",
          autoRefundIdHint: "Refund ID is generated automatically by the platform after submission.",
          amountLabel: "Refund Amount",
          reasonLabel: "Refund Reason",
          reasonPlaceholder: "Customer requested refund",
          submitRefund: "Submit Refund",
          filterEyebrow: "Filter",
          filterTitle: "Refund filters",
          keywordLabel: "Keyword",
          keywordPlaceholder: "Refund ID / order ID / provider refund ID",
          statusLabel: "Refund Status",
          allStatuses: "All Statuses",
          search: "Search Refunds",
          refundIdCol: "Refund ID",
          orderCol: "Related Order",
          amountCol: "Amount",
          statusCol: "Refund Status",
          timeCol: "Time",
          actionsCol: "Actions",
          noResults: "No refunds matched the current filter.",
          waitingProvider: "Waiting for provider refund ID",
          orderAmount: "Order Amount",
          route: "Route",
          merchantAccount: "Merchant Instance",
          missingBinding: "No instance binding",
          providerPending: "Waiting for provider status",
          createdAt: "Created",
          refundedAt: "Refunded",
          sync: "Sync Status",
          pageSummary: "Page",
          pageRange: "Showing",
          pageConnector: "of",
          previous: "Previous Page",
          next: "Next Page",
        }
      : {
          eyebrow: "Refunds",
          title: "退款管理",
          description: "在这里发起退款、查看退款状态，并主动向支付宝或微信同步最新退款结果。",
          openOrders: "打开订单列表",
          statRefunds: "Refunds",
          statRefundsDetail: "当前商户累计退款单数",
          statSucceeded: "Succeeded",
          statSucceededDetail: "已成功退款",
          statPending: "Pending",
          statPendingDetail: "处理中或待处理退款",
          statFailed: "Failed",
          statFailedDetail: "退款失败数量",
          createEyebrow: "Create Refund",
          createTitle: "发起退款",
          noPermission: "当前角色只能查看退款，不能发起新的退款请求。",
          orderRefLabel: "商户订单号或平台订单号",
          orderRefPlaceholder: "externalOrderId 或 orderId",
          autoRefundIdHint: "退款单号会在提交后由系统自动生成，无需手动填写。",
          amountLabel: "退款金额",
          reasonLabel: "退款原因",
          reasonPlaceholder: "用户申请退款",
          submitRefund: "提交退款",
          filterEyebrow: "Filter",
          filterTitle: "退款筛选",
          keywordLabel: "关键词",
          keywordPlaceholder: "退款单号 / 订单号 / 平台退款号",
          statusLabel: "退款状态",
          allStatuses: "全部状态",
          search: "查询退款",
          refundIdCol: "退款单号",
          orderCol: "关联订单",
          amountCol: "金额",
          statusCol: "退款状态",
          timeCol: "时间",
          actionsCol: "操作",
          noResults: "当前筛选条件下没有找到退款记录。",
          waitingProvider: "等待平台退款号",
          orderAmount: "订单金额",
          route: "路由",
          merchantAccount: "商户实例",
          missingBinding: "缺少实例绑定",
          providerPending: "等待支付平台状态",
          createdAt: "创建",
          refundedAt: "退款",
          sync: "同步状态",
          pageSummary: "页码",
          pageRange: "当前显示",
          pageConnector: "共",
          previous: "上一页",
          next: "下一页",
        };

  const where = {
    merchantId: session.merchantUser.merchantId,
    ...(filters.status ? { status: filters.status as PaymentRefundStatus } : {}),
    ...(filters.q
      ? {
          OR: [
            { id: { contains: filters.q, mode: "insensitive" as const } },
            { externalRefundId: { contains: filters.q, mode: "insensitive" as const } },
            { paymentOrder: { externalOrderId: { contains: filters.q, mode: "insensitive" as const } } },
          ],
        }
      : {}),
  };

  const [totalCount, successCount, pendingCount, failedCount] = await Promise.all([
    prisma.paymentRefund.count({
      where,
    }),
    prisma.paymentRefund.count({
      where: {
        merchantId: session.merchantUser.merchantId,
        status: PaymentRefundStatus.SUCCEEDED,
      },
    }),
    prisma.paymentRefund.count({
      where: {
        merchantId: session.merchantUser.merchantId,
        status: {
          in: [PaymentRefundStatus.PENDING, PaymentRefundStatus.PROCESSING],
        },
      },
    }),
    prisma.paymentRefund.count({
      where: {
        merchantId: session.merchantUser.merchantId,
        status: PaymentRefundStatus.FAILED,
      },
    }),
  ]);
  const { currentPage, totalPages, offset, pageStart, pageEnd } = getPaginationState(
    totalCount,
    requestedPage,
    MERCHANT_REFUND_PAGE_SIZE,
  );
  const refunds = await prisma.paymentRefund.findMany({
    where,
    orderBy: [{ createdAt: "desc" }],
    skip: offset,
    take: MERCHANT_REFUND_PAGE_SIZE,
    select: {
      id: true,
      externalRefundId: true,
      providerRefundId: true,
      amount: true,
      currency: true,
      status: true,
      providerStatus: true,
      createdAt: true,
      refundedAt: true,
      merchantChannelAccountId: true,
      paymentOrder: {
        select: {
          id: true,
          externalOrderId: true,
          amount: true,
          currency: true,
          status: true,
          merchantChannelAccountId: true,
        },
      },
    },
  });
  const currentPageHref = buildPageHref(
    "/merchant/refunds",
    {
      status: filters.status,
      q: filters.q,
      orderReference: filters.orderReference,
    },
    currentPage,
  );

  return (
    <div className="space-y-8">
      <AdminPageHeader
        eyebrow={content.eyebrow}
        title={content.title}
        description={content.description}
        actions={
          <a href="/merchant/orders" className={buttonClass}>
            {content.openOrders}
          </a>
        }
      />

      <FlashMessage success={messages.success} error={messages.error} />

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label={content.statRefunds} value={totalCount} detail={content.statRefundsDetail} />
        <StatCard label={content.statSucceeded} value={successCount} detail={content.statSucceededDetail} />
        <StatCard label={content.statPending} value={pendingCount} detail={content.statPendingDetail} />
        <StatCard label={content.statFailed} value={failedCount} detail={content.statFailedDetail} />
      </section>

      <section className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <article className={`${panelClass} p-6`}>
          <div>
            <p className="text-xs uppercase tracking-[0.22em] text-muted">{content.createEyebrow}</p>
            <h2 className="mt-2 text-2xl font-semibold text-foreground">{content.createTitle}</h2>
          </div>
          {!canManageRefunds ? (
            <div className="mt-6 rounded-[1.25rem] border border-[#f3d1ab] bg-[#fff4e7] p-4 text-sm text-[#8a4d18]">
              {content.noPermission}
            </div>
          ) : null}
          <form action={createMerchantRefundAction} className="mt-6 grid gap-4">
            <input type="hidden" name="redirectTo" value={currentPageHref} />
            <LabeledField label={content.orderRefLabel}>
              <input
                name="orderReference"
                defaultValue={filters.orderReference}
                placeholder={content.orderRefPlaceholder}
                className={inputClass}
              />
            </LabeledField>
            <div className="rounded-[1.25rem] border border-[#d7e7db] bg-[#f4faf6] px-4 py-3 text-sm leading-7 text-[#355846]">
              {content.autoRefundIdHint}
            </div>
            <LabeledField label={content.amountLabel}>
              <input name="amount" placeholder="8.80" className={inputClass} />
            </LabeledField>
            <LabeledField label={content.reasonLabel}>
              <input name="reason" placeholder={content.reasonPlaceholder} className={inputClass} />
            </LabeledField>
            {canManageRefunds ? (
              <div>
                <button type="submit" className={buttonClass}>
                  {content.submitRefund}
                </button>
              </div>
            ) : null}
          </form>
        </article>

        <article className={`${panelClass} p-6`}>
          <div>
            <p className="text-xs uppercase tracking-[0.22em] text-muted">{content.filterEyebrow}</p>
            <h2 className="mt-2 text-2xl font-semibold text-foreground">{content.filterTitle}</h2>
          </div>
          <form className="mt-6 grid gap-4">
            <LabeledField label={content.keywordLabel}>
              <input
                name="q"
                defaultValue={filters.q}
                placeholder={content.keywordPlaceholder}
                className={inputClass}
              />
            </LabeledField>
            <LabeledField label={content.statusLabel}>
              <select name="status" defaultValue={filters.status} className={selectClass}>
                {refundStatuses.map((status) => (
                  <option key={status || "all"} value={status}>
                    {status ? getRefundStatusLabel(status, locale) : content.allStatuses}
                  </option>
                ))}
              </select>
            </LabeledField>
            <div>
              <button type="submit" className={buttonClass}>
                {content.search}
              </button>
            </div>
          </form>
        </article>
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
                  <th className="px-4 py-3">{content.refundIdCol}</th>
                  <th className="px-4 py-3">{content.orderCol}</th>
                  <th className="px-4 py-3">{content.amountCol}</th>
                  <th className="px-4 py-3">{content.statusCol}</th>
                  <th className="px-4 py-3">{content.timeCol}</th>
                  <th className="px-4 py-3">{content.actionsCol}</th>
                </tr>
              </thead>
              <tbody>
                {refunds.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-sm text-muted">
                      {content.noResults}
                    </td>
                  </tr>
                ) : (
                refunds.map((refund) => (
                  <tr key={refund.id} className="border-t border-line/70 align-top">
                    <td className="px-4 py-4">
                      <p className="font-medium text-foreground">{refund.externalRefundId}</p>
                      <p className="mt-1 font-mono text-xs text-muted">{refund.id}</p>
                      <p className="mt-1 text-xs text-muted">{refund.providerRefundId ?? content.waitingProvider}</p>
                    </td>
                    <td className="px-4 py-4">
                      <p className="text-foreground">{refund.paymentOrder.externalOrderId}</p>
                      <p className="mt-1 text-xs text-muted">
                        {content.orderAmount} {formatMoney(refund.paymentOrder.amount.toString(), refund.paymentOrder.currency, locale)}
                      </p>
                      <p className="mt-1 text-xs text-muted">
                        {content.route}
                        {refund.merchantChannelAccountId ?? refund.paymentOrder.merchantChannelAccountId
                          ? ` ${content.merchantAccount}`
                          : ` ${content.missingBinding}`}
                      </p>
                    </td>
                    <td className="px-4 py-4 text-sm text-foreground">
                      {formatMoney(refund.amount.toString(), refund.currency, locale)}
                    </td>
                    <td className="px-4 py-4">
                      <StatusBadge tone={getRefundStatusTone(refund.status)}>
                        {getRefundStatusLabel(refund.status, locale)}
                      </StatusBadge>
                      <p className="mt-1 text-xs text-muted">{refund.providerStatus ?? content.providerPending}</p>
                    </td>
                    <td className="px-4 py-4 text-xs text-muted">
                      <p>{content.createdAt} {formatDateTime(refund.createdAt, locale)}</p>
                      <p className="mt-1">{content.refundedAt} {formatDateTime(refund.refundedAt, locale)}</p>
                    </td>
                    <td className="px-4 py-4">
                      <form action={syncMerchantRefundAction}>
                        <input type="hidden" name="refundReference" value={refund.externalRefundId} />
                        <input type="hidden" name="redirectTo" value={currentPageHref} />
                        <button
                          type="submit"
                          className="rounded-xl border border-line bg-white px-3 py-2 text-xs font-medium text-foreground"
                        >
                          {content.sync}
                        </button>
                      </form>
                    </td>
                  </tr>
                ))
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
                  "/merchant/refunds",
                  {
                    status: filters.status,
                    q: filters.q,
                    orderReference: filters.orderReference,
                  },
                  currentPage - 1,
                )
              : null
          }
          previousLabel={content.previous}
          nextHref={
            currentPage < totalPages
              ? buildPageHref(
                  "/merchant/refunds",
                  {
                    status: filters.status,
                    q: filters.q,
                    orderReference: filters.orderReference,
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
