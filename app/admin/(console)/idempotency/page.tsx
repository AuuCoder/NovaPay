import {
  EmptyState,
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
import {
  buildPageHref,
  formatDateTime,
  getPaginationState,
  getIdempotencyScopeLabel,
  getIdempotencyStatusLabel,
  getIdempotencyStatusTone,
  parsePageParam,
  prettyJson,
  readSearchFilters,
  type SearchParamsInput,
} from "@/app/admin/support";
import { requireAdminPermission } from "@/lib/admin-session";
import { getCurrentLocale } from "@/lib/i18n-server";
import { getMerchantDisplayName } from "@/lib/merchant-profile-completion";
import { getPrismaClient } from "@/lib/prisma";

const IDEMPOTENCY_PAGE_SIZE = 30;

export default async function AdminIdempotencyPage({
  searchParams,
}: {
  searchParams?: SearchParamsInput;
}) {
  await requireAdminPermission("audit:read");
  const prisma = getPrismaClient();
  const locale = await getCurrentLocale();
  const filters = await readSearchFilters(searchParams, ["merchantCode", "scope", "status", "q", "page"]);
  const keyword = filters.q;
  const requestedPage = parsePageParam(filters.page);
  const content =
    locale === "en"
      ? {
          eyebrow: "Request Safety",
          title: "Idempotency tracker",
          description:
            "Search merchant write-request idempotency records by merchant, scope, status, or key to trace retries, terminal outcomes, and records that are still being processed.",
          totalLabel: "Records",
          totalDetail: "Idempotency records returned by the current filter",
          replayedLabel: "Replayed",
          replayedDetail: "Records that have served at least one cached replay",
          processingLabel: "Processing",
          processingDetail: "Records that are currently holding an active processing lease",
          retryableLabel: "Retryable",
          retryableDetail: "Records that failed but can still be retried safely",
          filterTitle: "Tracking filters",
          merchantLabel: "Merchant",
          allMerchants: "All Merchants",
          scopeLabel: "Scope",
          allScopes: "All Scopes",
          statusLabel: "Status",
          allStatuses: "All Statuses",
          keywordLabel: "Keyword",
          keywordPlaceholder: "Idempotency key / request hash / resource ID / error code",
          submit: "Search Records",
          recordsEyebrow: "Trace Records",
          recordsTitle: "Idempotency event ledger",
          recordsDesc:
            "Repeated requests with the same business payload reuse the first result. Conflicting payloads under the same key are rejected at runtime and can be correlated here by key and last-seen time.",
          timeCol: "Time",
          merchantCol: "Merchant / Credential",
          scopeCol: "Scope / Key",
          statusCol: "Status",
          resourceCol: "Resource / Error",
          detailCol: "Request / Response",
          firstSeen: "First seen",
          lastSeen: "Last seen",
          completedAt: "Completed",
          leaseUntil: "Lease until",
          expiresAt: "Retention until",
          requestHash: "Request hash",
          replayCount: "Replay count",
          httpStatus: "HTTP status",
          resourceType: "Resource type",
          resourceId: "Resource ID",
          errorCode: "Error code",
          errorMessage: "Error message",
          requestSummary: "Request summary",
          responseBody: "Response body",
          showPayload: "View payload",
          emptyTitle: "No idempotency records matched the current filter",
          emptyDescription:
            "Merchant write requests start to appear here after they send `Idempotency-Key` on create-order, close-order, or refund operations.",
          noCredential: "Credential not recorded",
          systemValue: "System managed",
          pageSummary: "Page",
          pageRange: "Showing",
          pageConnector: "of",
          previous: "Previous Page",
          next: "Next Page",
        }
      : {
          eyebrow: "Request Safety",
          title: "幂等追踪",
          description:
            "按商户、作用域、状态或幂等键检索商户写接口的幂等记录，统一追踪安全重试、终态结果与仍在处理中的请求。",
          totalLabel: "Records",
          totalDetail: "当前筛选条件下的幂等记录数",
          replayedLabel: "Replayed",
          replayedDetail: "至少发生过一次结果复用的记录数",
          processingLabel: "Processing",
          processingDetail: "当前仍处于处理租约中的记录数",
          retryableLabel: "Retryable",
          retryableDetail: "执行失败但允许再次安全重试的记录数",
          filterTitle: "追踪筛选",
          merchantLabel: "商户",
          allMerchants: "全部商户",
          scopeLabel: "作用域",
          allScopes: "全部作用域",
          statusLabel: "状态",
          allStatuses: "全部状态",
          keywordLabel: "关键词",
          keywordPlaceholder: "幂等键 / 请求哈希 / 资源 ID / 错误码",
          submit: "查询记录",
          recordsEyebrow: "Trace Records",
          recordsTitle: "幂等记录台账",
          recordsDesc:
            "相同业务载荷重复请求时会复用首次结果；同 key 对应不同载荷会在运行时直接拒绝，可结合幂等键和最后访问时间在此排查。",
          timeCol: "时间",
          merchantCol: "商户 / 凭证",
          scopeCol: "作用域 / 幂等键",
          statusCol: "状态",
          resourceCol: "资源 / 错误",
          detailCol: "请求 / 响应",
          firstSeen: "首次记录",
          lastSeen: "最后访问",
          completedAt: "完成时间",
          leaseUntil: "租约截止",
          expiresAt: "保留至",
          requestHash: "请求哈希",
          replayCount: "复用次数",
          httpStatus: "HTTP 状态",
          resourceType: "资源类型",
          resourceId: "资源 ID",
          errorCode: "错误码",
          errorMessage: "错误原因",
          requestSummary: "请求摘要",
          responseBody: "响应结果",
          showPayload: "查看载荷",
          emptyTitle: "当前筛选条件下没有幂等记录",
          emptyDescription:
            "商户在创建订单、关闭订单、发起退款等写接口中带上 `Idempotency-Key` 之后，相关记录就会出现在这里。",
          noCredential: "未记录调用凭证",
          systemValue: "系统托管",
          pageSummary: "页码",
          pageRange: "当前显示",
          pageConnector: "共",
          previous: "上一页",
          next: "下一页",
        };

  const where = {
    ...(filters.merchantCode ? { merchant: { code: filters.merchantCode } } : {}),
    ...(filters.scope ? { scope: filters.scope } : {}),
    ...(filters.status ? { status: filters.status as never } : {}),
    ...(keyword
      ? {
          OR: [
            { idempotencyKey: { contains: keyword, mode: "insensitive" as const } },
            { requestHash: { contains: keyword, mode: "insensitive" as const } },
            { resourceId: { contains: keyword, mode: "insensitive" as const } },
            { errorCode: { contains: keyword, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const [merchants, totalCount, replayedCount, processingCount, retryableCount] =
    await Promise.all([
      prisma.merchant.findMany({
        orderBy: [{ code: "asc" }],
        select: {
          code: true,
          name: true,
        },
      }),
      prisma.merchantIdempotencyRecord.count({ where }),
      prisma.merchantIdempotencyRecord.count({
        where: {
          ...where,
          replayCount: {
            gt: 0,
          },
        },
      }),
      prisma.merchantIdempotencyRecord.count({
        where: {
          ...where,
          status: "PROCESSING",
        },
      }),
      prisma.merchantIdempotencyRecord.count({
        where: {
          ...where,
          status: "FAILED_RETRYABLE",
        },
      }),
    ]);
  const { currentPage, totalPages, offset, pageStart, pageEnd } = getPaginationState(
    totalCount,
    requestedPage,
    IDEMPOTENCY_PAGE_SIZE,
  );
  const records = await prisma.merchantIdempotencyRecord.findMany({
    where,
    orderBy: [{ createdAt: "desc" }],
    skip: offset,
    take: IDEMPOTENCY_PAGE_SIZE,
    include: {
      merchant: {
        select: {
          code: true,
          name: true,
        },
      },
      apiCredential: {
        select: {
          label: true,
          keyId: true,
        },
      },
    },
  });
  const baseFilters = {
    merchantCode: filters.merchantCode,
    scope: filters.scope,
    status: filters.status,
    q: keyword,
  };

  return (
    <div className="space-y-8">
      <AdminPageHeader
        eyebrow={content.eyebrow}
        title={content.title}
        description={content.description}
      />

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label={content.totalLabel} value={totalCount} detail={content.totalDetail} />
        <StatCard label={content.replayedLabel} value={replayedCount} detail={content.replayedDetail} />
        <StatCard
          label={content.processingLabel}
          value={processingCount}
          detail={content.processingDetail}
        />
        <StatCard
          label={content.retryableLabel}
          value={retryableCount}
          detail={content.retryableDetail}
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
          <LabeledField label={content.scopeLabel}>
            <select name="scope" defaultValue={filters.scope} className={selectClass}>
              <option value="">{content.allScopes}</option>
              <option value="payment_order.create">
                {getIdempotencyScopeLabel("payment_order.create", locale)}
              </option>
              <option value="payment_order.close">
                {getIdempotencyScopeLabel("payment_order.close", locale)}
              </option>
              <option value="payment_refund.create">
                {getIdempotencyScopeLabel("payment_refund.create", locale)}
              </option>
            </select>
          </LabeledField>
          <LabeledField label={content.statusLabel}>
            <select name="status" defaultValue={filters.status} className={selectClass}>
              <option value="">{content.allStatuses}</option>
              <option value="PROCESSING">{getIdempotencyStatusLabel("PROCESSING", locale)}</option>
              <option value="SUCCEEDED">{getIdempotencyStatusLabel("SUCCEEDED", locale)}</option>
              <option value="FAILED_FINAL">
                {getIdempotencyStatusLabel("FAILED_FINAL", locale)}
              </option>
              <option value="FAILED_RETRYABLE">
                {getIdempotencyStatusLabel("FAILED_RETRYABLE", locale)}
              </option>
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
          <div className="lg:col-span-4">
            <button type="submit" className={buttonClass}>
              {content.submit}
            </button>
          </div>
        </form>
      </section>

      {records.length === 0 ? (
        <EmptyState title={content.emptyTitle} description={content.emptyDescription} />
      ) : (
        <section className={`${panelClass} p-6`}>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.22em] text-muted">{content.recordsEyebrow}</p>
              <h2 className="mt-2 text-2xl font-semibold text-foreground">{content.recordsTitle}</h2>
            </div>
            <div className="max-w-2xl">
              <p className="text-sm leading-7 text-muted">{content.recordsDesc}</p>
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
                    <th className="px-4 py-3">{content.timeCol}</th>
                    <th className="px-4 py-3">{content.merchantCol}</th>
                    <th className="px-4 py-3">{content.scopeCol}</th>
                    <th className="px-4 py-3">{content.statusCol}</th>
                    <th className="px-4 py-3">{content.resourceCol}</th>
                    <th className="px-4 py-3">{content.detailCol}</th>
                  </tr>
                </thead>
                <tbody>
                  {records.map((record) => (
                    <tr key={record.id} className="border-t border-line/70 align-top">
                      <td className="px-4 py-4 text-xs text-muted">
                        <p>
                          {content.firstSeen}: {formatDateTime(record.firstSeenAt, locale)}
                        </p>
                        <p className="mt-1">
                          {content.lastSeen}: {formatDateTime(record.lastSeenAt, locale)}
                        </p>
                        <p className="mt-1">
                          {content.completedAt}: {formatDateTime(record.completedAt, locale)}
                        </p>
                        <p className="mt-1">
                          {content.leaseUntil}: {formatDateTime(record.leaseExpiresAt, locale)}
                        </p>
                        <p className="mt-1">
                          {content.expiresAt}: {formatDateTime(record.expiresAt, locale)}
                        </p>
                      </td>
                      <td className="px-4 py-4 text-xs text-muted">
                        <p className="font-medium text-foreground">{record.merchant.code}</p>
                        <p className="mt-1">{getMerchantDisplayName(record.merchant.name, locale)}</p>
                        <p className="mt-3 font-medium text-foreground">
                          {record.apiCredential?.label || content.noCredential}
                        </p>
                        <p className="mt-1 font-mono">
                          {record.apiCredential?.keyId || content.systemValue}
                        </p>
                      </td>
                      <td className="px-4 py-4 text-xs text-muted">
                        <p className="font-medium text-foreground">
                          {getIdempotencyScopeLabel(record.scope, locale)}
                        </p>
                        <p className="mt-1 font-mono">{record.scope}</p>
                        <p className="mt-3 break-all font-mono text-[11px] text-foreground">
                          {record.idempotencyKey}
                        </p>
                        <p className="mt-3 text-muted">
                          {content.requestHash}:{" "}
                          <span className="break-all font-mono text-[11px]">{record.requestHash}</span>
                        </p>
                      </td>
                      <td className="px-4 py-4 text-xs text-muted">
                        <StatusBadge tone={getIdempotencyStatusTone(record.status)}>
                          {getIdempotencyStatusLabel(record.status, locale)}
                        </StatusBadge>
                        <p className="mt-3">
                          {content.replayCount}: {record.replayCount}
                        </p>
                        <p className="mt-1">
                          {content.httpStatus}: {record.httpStatus ?? "—"}
                        </p>
                      </td>
                      <td className="px-4 py-4 text-xs text-muted">
                        <p>
                          {content.resourceType}: {record.resourceType ?? "—"}
                        </p>
                        <p className="mt-1 break-all">
                          {content.resourceId}: <span className="font-mono">{record.resourceId ?? "—"}</span>
                        </p>
                        <p className="mt-3">
                          {content.errorCode}: <span className="font-mono">{record.errorCode ?? "—"}</span>
                        </p>
                        <p className="mt-1 max-w-[280px] whitespace-pre-wrap break-words">
                          {content.errorMessage}: {record.errorMessage ?? "—"}
                        </p>
                      </td>
                      <td className="px-4 py-4">
                        <details className="group rounded-2xl border border-line bg-[#f8f2ea] p-3">
                          <summary className="cursor-pointer list-none text-xs font-medium text-foreground">
                            {content.showPayload}
                          </summary>
                          <div className="mt-3 space-y-3">
                            <div>
                              <p className="text-[11px] uppercase tracking-[0.18em] text-muted">
                                {content.requestSummary}
                              </p>
                              <pre className="mt-2 max-w-[360px] overflow-x-auto whitespace-pre-wrap text-[11px] leading-6 text-muted">
                                {prettyJson(record.requestSummary) || "—"}
                              </pre>
                            </div>
                            <div>
                              <p className="text-[11px] uppercase tracking-[0.18em] text-muted">
                                {content.responseBody}
                              </p>
                              <pre className="mt-2 max-w-[360px] overflow-x-auto whitespace-pre-wrap text-[11px] leading-6 text-muted">
                                {prettyJson(record.responseBody) || "—"}
                              </pre>
                            </div>
                          </div>
                        </details>
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
                ? buildPageHref("/admin/idempotency", baseFilters, currentPage - 1)
                : null
            }
            previousLabel={content.previous}
            nextHref={
              currentPage < totalPages
                ? buildPageHref("/admin/idempotency", baseFilters, currentPage + 1)
                : null
            }
            nextLabel={content.next}
          />
        </section>
      )}
    </div>
  );
}
