import Link from "next/link";
import { retryCallbackAction } from "@/app/admin/actions";
import {
  buildPageHref,
  formatDateTime,
  getPaginationState,
  getAttemptStatusLabel,
  getAttemptStatusTone,
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
import { CallbackAttemptStatus } from "@/generated/prisma/enums";
import { requireAdminPermission } from "@/lib/admin-session";
import { getCurrentLocale } from "@/lib/i18n-server";
import { getMerchantDisplayName } from "@/lib/merchant-profile-completion";
import { getPrismaClient } from "@/lib/prisma";

const CALLBACK_PAGE_SIZE = 30;

export default async function CallbacksPage({
  searchParams,
}: {
  searchParams?: SearchParamsInput;
}) {
  await requireAdminPermission("callback:read");
  const prisma = getPrismaClient();
  const filters = await readSearchFilters(searchParams, ["merchantCode", "status", "orderId", "q", "page"]);
  const locale = await getCurrentLocale();
  const keyword = filters.q;
  const requestedPage = parsePageParam(filters.page);
  const content =
    locale === "en"
      ? {
          eyebrow: "Callback Center",
          title: "Callback center",
          description:
            "Inspect every callback attempt NovaPay sends to merchant systems, including HTTP status, destination URL, failure reason, and the latest completion time.",
          backToOrders: "Back to Order Center",
          attempts: "Attempts",
          attemptsDetail: "Records returned by the current filter",
          succeeded: "Succeeded",
          succeededDetail: "Successful deliveries",
          failed: "Failed",
          failedDetail: "Failed deliveries",
          pageWindow: "Page Window",
          pageWindowDetail: "30 callback attempts per page for operational review",
          filterTitle: "Callback filters",
          merchantLabel: "Merchant",
          allMerchants: "All Merchants",
          statusLabel: "Delivery Status",
          allStatuses: "All Statuses",
          orderIdLabel: "Order ID",
          keywordLabel: "Keyword",
          keywordPlaceholder: "Target URL / error message / order ID",
          submit: "Search Callbacks",
          deliveriesEyebrow: "Deliveries",
          deliveriesTitle: "Callback delivery records",
          deliveriesDesc:
            "Failed records include both error messages and destination URLs so teams can distinguish merchant endpoint issues from gateway configuration issues.",
          orderCol: "Order / Merchant",
          statusCol: "Status",
          targetCol: "Target URL",
          httpCol: "HTTP",
          errorCol: "Error",
          completedCol: "Completed At",
          actionsCol: "Actions",
          merchantDetail: "Merchant Detail",
          retry: "Retry Callback",
          pageSummary: "Page",
          pageRange: "Showing",
          pageConnector: "of",
          previous: "Previous Page",
          next: "Next Page",
        }
      : {
          eyebrow: "Callback Center",
          title: "回调中心",
          description:
            "用于查看 NovaPay 发往商户系统的每一次回调尝试，确认 HTTP 状态、目标地址、失败原因和最近完成时间。",
          backToOrders: "返回订单中心",
          attempts: "Attempts",
          attemptsDetail: "当前筛选结果数量",
          succeeded: "Succeeded",
          succeededDetail: "成功投递次数",
          failed: "Failed",
          failedDetail: "失败投递次数",
          pageWindow: "Page Window",
          pageWindowDetail: "每页展示 30 条回调记录，便于运营排查",
          filterTitle: "回调筛选",
          merchantLabel: "商户",
          allMerchants: "全部商户",
          statusLabel: "投递状态",
          allStatuses: "全部状态",
          orderIdLabel: "订单 ID",
          keywordLabel: "关键词",
          keywordPlaceholder: "目标地址 / 错误信息 / 订单号",
          submit: "查询回调",
          deliveriesEyebrow: "Deliveries",
          deliveriesTitle: "回调投递记录",
          deliveriesDesc: "失败记录会带上错误信息和目标地址，便于分辨是商户接口问题还是网关配置问题。",
          orderCol: "订单 / 商户",
          statusCol: "状态",
          targetCol: "目标地址",
          httpCol: "HTTP",
          errorCol: "错误",
          completedCol: "完成时间",
          actionsCol: "操作",
          merchantDetail: "商户详情",
          retry: "重试回调",
          pageSummary: "页码",
          pageRange: "当前显示",
          pageConnector: "共",
          previous: "上一页",
          next: "下一页",
        };
  const where = {
    ...(filters.status ? { status: filters.status as CallbackAttemptStatus } : {}),
    ...(filters.orderId ? { paymentOrderId: filters.orderId } : {}),
    ...(filters.merchantCode
      ? {
          paymentOrder: {
            merchant: {
              code: filters.merchantCode,
            },
          },
        }
      : {}),
    ...(keyword
      ? {
          OR: [
            { paymentOrderId: { contains: keyword, mode: "insensitive" as const } },
            { targetUrl: { contains: keyword, mode: "insensitive" as const } },
            { errorMessage: { contains: keyword, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const [merchants, totalCount, successCount, failedCount] = await Promise.all([
    prisma.merchant.findMany({
      orderBy: [{ code: "asc" }],
      select: {
        code: true,
        name: true,
      },
    }),
    prisma.paymentCallbackAttempt.count({ where }),
    prisma.paymentCallbackAttempt.count({
      where: {
        ...where,
        status: CallbackAttemptStatus.SUCCEEDED,
      },
    }),
    prisma.paymentCallbackAttempt.count({
      where: {
        ...where,
        status: CallbackAttemptStatus.FAILED,
      },
    }),
  ]);
  const { currentPage, totalPages, offset, pageStart, pageEnd } = getPaginationState(
    totalCount,
    requestedPage,
    CALLBACK_PAGE_SIZE,
  );
  const attempts = await prisma.paymentCallbackAttempt.findMany({
    where,
    orderBy: [{ createdAt: "desc" }],
    skip: offset,
    take: CALLBACK_PAGE_SIZE,
    include: {
      paymentOrder: {
        include: {
          merchant: {
            select: {
              id: true,
              code: true,
              name: true,
            },
          },
        },
      },
    },
  });
  const baseFilters = {
    merchantCode: filters.merchantCode,
    status: filters.status,
    orderId: filters.orderId,
    q: keyword,
  };
  const currentPageHref = buildPageHref("/admin/callbacks", baseFilters, currentPage);

  return (
    <div className="space-y-8">
      <AdminPageHeader
        eyebrow={content.eyebrow}
        title={content.title}
        description={content.description}
        actions={
          <Link href="/admin/orders" className={buttonClass}>
            {content.backToOrders}
          </Link>
        }
      />

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label={content.attempts} value={totalCount} detail={content.attemptsDetail} />
        <StatCard label={content.succeeded} value={successCount} detail={content.succeededDetail} />
        <StatCard label={content.failed} value={failedCount} detail={content.failedDetail} />
        <StatCard
          label={content.pageWindow}
          value={`${currentPage}/${totalPages}`}
          detail={content.pageWindowDetail}
        />
      </section>

      <section className={`${panelClass} p-6`}>
        <h2 className="text-2xl font-semibold text-foreground">{content.filterTitle}</h2>
        <form className="mt-6 grid gap-4 lg:grid-cols-4">
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
          <LabeledField label={content.statusLabel}>
            <select name="status" defaultValue={filters.status} className={selectClass}>
              <option value="">{content.allStatuses}</option>
              <option value="SUCCEEDED">{getAttemptStatusLabel("SUCCEEDED", locale)}</option>
              <option value="FAILED">{getAttemptStatusLabel("FAILED", locale)}</option>
            </select>
          </LabeledField>
          <LabeledField label={content.orderIdLabel}>
            <input name="orderId" defaultValue={filters.orderId} className={inputClass} />
          </LabeledField>
          <LabeledField label={content.keywordLabel}>
            <input
              name="q"
              defaultValue={keyword}
              placeholder={content.keywordPlaceholder}
              className={inputClass}
            />
          </LabeledField>
          <div className="lg:col-span-4">
            <button type="submit" className={buttonClass}>
              {content.submit}
            </button>
          </div>
        </form>
      </section>

      <section className={`${panelClass} p-6`}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.22em] text-muted">{content.deliveriesEyebrow}</p>
            <h2 className="mt-2 text-2xl font-semibold text-foreground">{content.deliveriesTitle}</h2>
          </div>
          <div className="max-w-2xl">
            <p className="text-sm leading-7 text-muted">{content.deliveriesDesc}</p>
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
                  <th className="px-4 py-3">{content.statusCol}</th>
                  <th className="px-4 py-3">{content.targetCol}</th>
                  <th className="px-4 py-3">{content.httpCol}</th>
                  <th className="px-4 py-3">{content.errorCol}</th>
                  <th className="px-4 py-3">{content.completedCol}</th>
                  <th className="px-4 py-3">{content.actionsCol}</th>
                </tr>
              </thead>
              <tbody>
                {attempts.map((attempt) => (
                  <tr key={attempt.id} className="border-t border-line/70 align-top">
                    <td className="px-4 py-4">
                      <Link
                        href={`/admin/orders?merchantCode=${attempt.paymentOrder.merchant.code}&q=${attempt.paymentOrder.id}`}
                        className="font-mono text-xs text-foreground hover:text-accent"
                      >
                        {attempt.paymentOrder.id}
                      </Link>
                      <p className="mt-1 text-xs text-muted">
                        {attempt.paymentOrder.merchant.code} / {getMerchantDisplayName(attempt.paymentOrder.merchant.name, locale)}
                      </p>
                    </td>
                    <td className="px-4 py-4">
                      <StatusBadge tone={getAttemptStatusTone(attempt.status)}>
                        {getAttemptStatusLabel(attempt.status, locale)}
                      </StatusBadge>
                    </td>
                    <td className="px-4 py-4 text-xs text-muted">
                      <p className="max-w-[260px] break-all">{attempt.targetUrl}</p>
                    </td>
                    <td className="px-4 py-4 text-xs text-muted">{attempt.httpStatus ?? "—"}</td>
                    <td className="px-4 py-4 text-xs text-muted">
                      <p className="max-w-[240px] break-all">{attempt.errorMessage ?? "—"}</p>
                    </td>
                    <td className="px-4 py-4 text-xs text-muted">{formatDateTime(attempt.completedAt ?? attempt.createdAt, locale)}</td>
                    <td className="px-4 py-4">
                      <div className="flex flex-wrap gap-2">
                        <Link
                          href={`/admin/merchants/${attempt.paymentOrder.merchant.id}`}
                          className="rounded-xl border border-line bg-white px-3 py-2 text-xs font-medium text-foreground"
                        >
                          {content.merchantDetail}
                        </Link>
                        <form action={retryCallbackAction}>
                          <input type="hidden" name="orderId" value={attempt.paymentOrderId} />
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
            currentPage > 1
              ? buildPageHref("/admin/callbacks", baseFilters, currentPage - 1)
              : null
          }
          previousLabel={content.previous}
          nextHref={
            currentPage < totalPages
              ? buildPageHref("/admin/callbacks", baseFilters, currentPage + 1)
              : null
          }
          nextLabel={content.next}
        />
      </section>
    </div>
  );
}
