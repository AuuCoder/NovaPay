import {
  buildPageHref,
  formatDateTime,
  getPaginationState,
  parsePageParam,
  prettyJson,
  readSearchFilters,
  type SearchParamsInput,
} from "@/app/admin/support";
import {
  AdminPageHeader,
  LabeledField,
  PaginationNav,
  StatCard,
  buttonClass,
  inputClass,
  panelClass,
  tableWrapperClass,
} from "@/app/admin/ui";
import { requireAdminPermission } from "@/lib/admin-session";
import { getCurrentLocale } from "@/lib/i18n-server";
import { getPrismaClient } from "@/lib/prisma";

const AUDIT_LOG_PAGE_SIZE = 50;

export default async function AuditLogsPage({
  searchParams,
}: {
  searchParams?: SearchParamsInput;
}) {
  await requireAdminPermission("audit:read");
  const prisma = getPrismaClient();
  const filters = await readSearchFilters(searchParams, ["action", "resourceType", "q", "page"]);
  const locale = await getCurrentLocale();
  const keyword = filters.q;
  const requestedPage = parsePageParam(filters.page);
  const content =
    locale === "en"
      ? {
          headerEyebrow: "Audit Trail",
          headerTitle: "Audit logs",
          headerDesc:
            "Captures critical back-office operations with actor, resource, summary, and metadata to meet enterprise traceability requirements.",
          statLogs: "Logs",
          statLogsDetail: "Records returned by the current filter",
          statWindow: "Window",
          statWindowDetail: "50 audit records per page for traceability review",
          statActor: "Actor",
          statActorDetail: "Audit actors are normalized to admin sessions or system jobs",
          filterTitle: "Audit filters",
          actionLabel: "Action",
          resourceTypeLabel: "Resource Type",
          keywordLabel: "Keyword",
          keywordPlaceholder: "Summary / resource ID / actor",
          submit: "Search Logs",
          eventsEyebrow: "Audit Events",
          eventsTitle: "Back-office event stream",
          eventsDesc:
            "Critical operations for merchants, payment accounts, bindings, system configuration, and callback retries are already recorded here.",
          timeCol: "Time",
          actionCol: "Action",
          resourceCol: "Resource",
          summaryCol: "Summary",
          metadataCol: "Metadata",
          pageSummary: "Page",
          pageRange: "Showing",
          pageConnector: "of",
          previous: "Previous Page",
          next: "Next Page",
        }
      : {
          headerEyebrow: "Audit Trail",
          headerTitle: "审计日志",
          headerDesc:
            "记录后台关键操作的动作、资源对象、摘要和元数据，是企业级后台最基础的可追溯能力。",
          statLogs: "Logs",
          statLogsDetail: "当前筛选结果数量",
          statWindow: "Window",
          statWindowDetail: "每页展示 50 条审计记录，便于追溯排查",
          statActor: "Actor",
          statActorDetail: "审计主体已统一为管理员会话账号或系统任务",
          filterTitle: "审计筛选",
          actionLabel: "动作",
          resourceTypeLabel: "资源类型",
          keywordLabel: "关键词",
          keywordPlaceholder: "摘要 / 资源 ID / actor",
          submit: "查询日志",
          eventsEyebrow: "Audit Events",
          eventsTitle: "后台动作流水",
          eventsDesc: "当前已经接入商户、支付账号、绑定、系统配置与回调重试等关键动作。",
          timeCol: "时间",
          actionCol: "动作",
          resourceCol: "资源",
          summaryCol: "摘要",
          metadataCol: "元数据",
          pageSummary: "页码",
          pageRange: "当前显示",
          pageConnector: "共",
          previous: "上一页",
          next: "下一页",
        };
  const where = {
    ...(filters.action
      ? {
          action: {
            contains: filters.action,
            mode: "insensitive" as const,
          },
        }
      : {}),
    ...(filters.resourceType
      ? {
          resourceType: {
            contains: filters.resourceType,
            mode: "insensitive" as const,
          },
        }
      : {}),
    ...(keyword
      ? {
          OR: [
            { summary: { contains: keyword, mode: "insensitive" as const } },
            { resourceId: { contains: keyword, mode: "insensitive" as const } },
            { actor: { contains: keyword, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const totalCount = await prisma.adminAuditLog.count({ where });
  const { currentPage, totalPages, offset, pageStart, pageEnd } = getPaginationState(
    totalCount,
    requestedPage,
    AUDIT_LOG_PAGE_SIZE,
  );
  const logs = await prisma.adminAuditLog.findMany({
    where,
    orderBy: [{ createdAt: "desc" }],
    skip: offset,
    take: AUDIT_LOG_PAGE_SIZE,
  });
  const baseFilters = {
    action: filters.action,
    resourceType: filters.resourceType,
    q: keyword,
  };

  return (
    <div className="space-y-8">
      <AdminPageHeader
        eyebrow={content.headerEyebrow}
        title={content.headerTitle}
        description={content.headerDesc}
      />

      <section className="grid gap-4 md:grid-cols-3">
        <StatCard label={content.statLogs} value={totalCount} detail={content.statLogsDetail} />
        <StatCard
          label={content.statWindow}
          value={`${currentPage}/${totalPages}`}
          detail={content.statWindowDetail}
        />
        <StatCard label={content.statActor} value="admin session" detail={content.statActorDetail} />
      </section>

      <section className={`${panelClass} p-6`}>
        <h2 className="text-2xl font-semibold text-foreground">{content.filterTitle}</h2>
        <form className="mt-6 grid gap-4 lg:grid-cols-4">
          <LabeledField label={content.actionLabel}>
            <input name="action" defaultValue={filters.action} placeholder="merchant.update" className={inputClass} />
          </LabeledField>
          <LabeledField label={content.resourceTypeLabel}>
            <input name="resourceType" defaultValue={filters.resourceType} placeholder="payment_order" className={inputClass} />
          </LabeledField>
          <LabeledField label={content.keywordLabel}>
            <input name="q" defaultValue={keyword} placeholder={content.keywordPlaceholder} className={inputClass} />
          </LabeledField>
          <div className="flex items-end">
            <button type="submit" className={buttonClass}>
              {content.submit}
            </button>
          </div>
        </form>
      </section>

      <section className={`${panelClass} p-6`}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.22em] text-muted">{content.eventsEyebrow}</p>
            <h2 className="mt-2 text-2xl font-semibold text-foreground">{content.eventsTitle}</h2>
          </div>
          <div className="max-w-2xl">
            <p className="text-sm leading-7 text-muted">{content.eventsDesc}</p>
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
                  <th className="px-4 py-3">{content.actionCol}</th>
                  <th className="px-4 py-3">{content.resourceCol}</th>
                  <th className="px-4 py-3">{content.summaryCol}</th>
                  <th className="px-4 py-3">{content.metadataCol}</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id} className="border-t border-line/70 align-top">
                    <td className="px-4 py-4 text-xs text-muted">{formatDateTime(log.createdAt, locale)}</td>
                    <td className="px-4 py-4">
                      <p className="font-mono text-xs text-foreground">{log.action}</p>
                      <p className="mt-1 text-xs text-muted">{log.actor}</p>
                    </td>
                    <td className="px-4 py-4 text-xs text-muted">
                      <p>{log.resourceType}</p>
                      <p className="mt-1 font-mono">{log.resourceId ?? "—"}</p>
                    </td>
                    <td className="px-4 py-4 text-xs text-muted">
                      <p className="max-w-[260px] break-all">{log.summary}</p>
                    </td>
                    <td className="px-4 py-4">
                      <pre className="max-w-[320px] overflow-x-auto whitespace-pre-wrap rounded-2xl bg-[#f8f2ea] p-3 text-[11px] leading-6 text-muted">
                        {prettyJson(log.metadata) || "—"}
                      </pre>
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
              ? buildPageHref("/admin/audit-logs", baseFilters, currentPage - 1)
              : null
          }
          previousLabel={content.previous}
          nextHref={
            currentPage < totalPages
              ? buildPageHref("/admin/audit-logs", baseFilters, currentPage + 1)
              : null
          }
          nextLabel={content.next}
        />
      </section>
    </div>
  );
}
