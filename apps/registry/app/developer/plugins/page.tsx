import Link from "next/link";
import { getCurrentLocale } from "@/lib/i18n-server";
import { requireRegistryUserSession } from "../../../lib/auth/session";
import {
  canDeveloperManagePlugin,
  listPluginOwnerships,
} from "../../../lib/developer/plugin-ownership";
import {
  getRegistryRuntime,
  listPluginVersionRecords,
  listPluginVersionTestSessions,
} from "../../../lib/runtime/state";
import { isOfficialPluginSlug } from "../../../lib/plugins/official";
import { summarizeVerificationSession } from "../../(admin)/verification-summary";

const PAGE_SIZE = 12;

function buildPageHref(input: {
  filter: string;
  q: string;
  sort: string;
  page: number;
}) {
  const params = new URLSearchParams();

  if (input.filter && input.filter !== "all") {
    params.set("filter", input.filter);
  }
  if (input.q.trim()) {
    params.set("q", input.q.trim());
  }
  if (input.sort && input.sort !== "plugin_asc") {
    params.set("sort", input.sort);
  }
  if (input.page > 1) {
    params.set("page", String(input.page));
  }

  const query = params.toString();
  return query ? `/developer/plugins?${query}` : "/developer/plugins";
}

function getReviewBadge(reviewState: string) {
  switch (reviewState) {
    case "PUBLISHED":
      return "badge badge-positive";
    case "SUBMITTED":
      return "badge badge-warning";
    case "APPROVED":
      return "badge badge-ink";
    case "REJECTED":
      return "badge badge-negative";
    default:
      return "badge badge-neutral";
  }
}

function getReviewLabel(reviewState: string, locale: "zh" | "en") {
  const labels: Record<string, { zh: string; en: string }> = {
    PUBLISHED: { zh: "已发布", en: "Published" },
    SUBMITTED: { zh: "已提交", en: "Submitted" },
    APPROVED: { zh: "已批准", en: "Approved" },
    REJECTED: { zh: "已拒绝", en: "Rejected" },
    DRAFT: { zh: "草稿", en: "Draft" },
  };

  return labels[reviewState]?.[locale] ?? reviewState;
}

function getVerificationLabel(status: string, locale: "zh" | "en") {
  const labels: Record<string, { zh: string; en: string }> = {
    PASSED: { zh: "已通过", en: "Passed" },
    FAILED: { zh: "失败", en: "Failed" },
    NO_TEST: { zh: "未自测", en: "No test" },
    MISSING_PROFILE: { zh: "缺少验证配置", en: "Missing profile" },
    EXEMPT: { zh: "官方豁免", en: "Exempt" },
    UNKNOWN: { zh: "未知", en: "Unknown" },
  };

  return labels[status]?.[locale] ?? status;
}

function getVerificationBadge(status: string) {
  switch (status) {
    case "PASSED":
    case "EXEMPT":
      return "badge badge-positive";
    case "FAILED":
    case "MISSING_PROFILE":
      return "badge badge-negative";
    case "NO_TEST":
      return "badge badge-warning";
    default:
      return "badge badge-neutral";
  }
}

export default async function DeveloperPluginsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireRegistryUserSession();
  const locale = await getCurrentLocale();
  const state = await getRegistryRuntime();
  const ownerships = listPluginOwnerships();
  const developerId = session.actorKind === "DEVELOPER" ? session.actorId : null;
  const params = (await searchParams) ?? {};

  const filter =
    typeof params.filter === "string"
      ? params.filter
      : Array.isArray(params.filter)
        ? params.filter[0] ?? "all"
        : "all";
  const keywordValue =
    typeof params.q === "string"
      ? params.q
      : Array.isArray(params.q)
        ? params.q[0] ?? ""
        : "";
  const sort =
    typeof params.sort === "string"
      ? params.sort
      : Array.isArray(params.sort)
        ? params.sort[0] ?? "plugin_asc"
        : "plugin_asc";
  const pageValue =
    typeof params.page === "string"
      ? params.page
      : Array.isArray(params.page)
        ? params.page[0] ?? "1"
        : "1";
  const currentPage = Math.max(1, Number.parseInt(pageValue, 10) || 1);
  const keyword = keywordValue.trim().toLowerCase();

  const ownershipCount = ownerships.filter((item) => item.developerId === developerId).length;
  const rows = state.catalog.map((plugin) => {
    const mine = canDeveloperManagePlugin(plugin.slug, developerId);
    const versions = listPluginVersionRecords(state, plugin.slug);
    const currentVersionRecord = versions.find((record) => record.version === plugin.version) ?? versions[0] ?? null;
    const latestSession = summarizeVerificationSession({
      session:
        listPluginVersionTestSessions({
          state,
          pluginSlug: plugin.slug,
          version: plugin.version,
        })[0] ?? null,
      manifest: state.demoBundles.get(`${plugin.slug}@${plugin.version}`)?.pipelineResult.manifest ?? null,
      officialPlugin: isOfficialPluginSlug(plugin.slug),
    });

    return {
      plugin,
      mine,
      currentVersionRecord,
      latestSession,
    };
  });

  const filteredRows = rows.filter(({ plugin, mine }) => {
    const matchesFilter =
      filter === "mine" ? mine : filter === "paid" ? plugin.pricingMode === "PAID" : true;

    if (!matchesFilter) {
      return false;
    }

    if (!keyword) {
      return true;
    }

    return [plugin.displayName, plugin.slug, plugin.vendor, plugin.description]
      .join(" ")
      .toLowerCase()
      .includes(keyword);
  });

  const sortedRows = [...filteredRows].sort((left, right) => {
    const leftMine = left.mine;
    const rightMine = right.mine;

    switch (sort) {
      case "owner_desc":
        return Number(rightMine) - Number(leftMine) || left.plugin.displayName.localeCompare(right.plugin.displayName);
      case "review_desc":
        return (right.currentVersionRecord?.reviewState ?? "").localeCompare(left.currentVersionRecord?.reviewState ?? "") || left.plugin.displayName.localeCompare(right.plugin.displayName);
      case "version_desc":
        return right.plugin.version.localeCompare(left.plugin.version) || left.plugin.displayName.localeCompare(right.plugin.displayName);
      case "plugin_asc":
      default:
        return left.plugin.displayName.localeCompare(right.plugin.displayName);
    }
  });

  const totalPages = Math.max(1, Math.ceil(sortedRows.length / PAGE_SIZE));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const pagedRows = sortedRows.slice(
    (safeCurrentPage - 1) * PAGE_SIZE,
    safeCurrentPage * PAGE_SIZE,
  );

  const content =
    locale === "en"
      ? {
          eyebrow: "Developer",
          title: "Plugins",
          subtitle:
            "Manage owned slugs and inspect the public registry catalog through a compact operational table.",
          uploadBundle: "New Plugin",
          stats: {
            published: "Published",
            owned: "Owned",
            paid: "Paid",
          },
          filters: {
            all: "All",
            mine: "Mine",
            paid: "Paid",
          },
          searchPlaceholder: "Search plugins",
          search: "Search",
          sortLabel: "Sort",
          sortOptions: {
            plugin_asc: "Name",
            owner_desc: "Owned first",
            review_desc: "Review",
            version_desc: "Latest version",
          },
          headers: {
            plugin: "Plugin",
            ownership: "Ownership",
            review: "Review",
            verification: "Self-test",
            version: "Version",
            channel: "Channel",
            action: "Action",
          },
          ownershipMine: "Owned",
          ownershipPublic: "Read-only",
          unknown: "Unknown",
          manage: "Manage",
          browse: "Open",
          prev: "Prev",
          next: "Next",
          page: "Page",
        }
      : {
          eyebrow: "开发者",
          title: "插件",
          subtitle: "用一张更克制的运营表统一管理自己的 slug，并查看公开目录。",
          uploadBundle: "新建插件",
          stats: {
            published: "已发布",
            owned: "我的",
            paid: "收费",
          },
          filters: {
            all: "全部",
            mine: "我的",
            paid: "收费",
          },
          searchPlaceholder: "搜索插件",
          search: "搜索",
          sortLabel: "排序",
          sortOptions: {
            plugin_asc: "名称",
            owner_desc: "我的优先",
            review_desc: "审核状态",
            version_desc: "最新版本",
          },
          headers: {
            plugin: "插件",
            ownership: "归属",
            review: "审核",
            verification: "自测",
            version: "版本",
            channel: "通道",
            action: "操作",
          },
          ownershipMine: "我的",
          ownershipPublic: "只读",
          unknown: "未知",
          manage: "管理",
          browse: "打开",
          prev: "上一页",
          next: "下一页",
          page: "第",
        };

  return (
    <section className="admin-shell">
      <div className="container admin-page">
        <div className="admin-header">
          <div className="admin-header-copy">
            <p className="text-eyebrow">{content.eyebrow}</p>
            <h1 className="admin-title">{content.title}</h1>
            <p className="admin-subtitle">{content.subtitle}</p>
          </div>
          <div className="admin-toolbar">
            <Link href="/developer/plugins/new" className="btn btn-primary">
              {content.uploadBundle}
            </Link>
          </div>
        </div>

        <div className="grid-3">
          <div className="stat-card feature">
            <p className="stat-label">{content.stats.published}</p>
            <p className="stat-value">{sortedRows.length}</p>
          </div>
          <div className="stat-card">
            <p className="stat-label">{content.stats.owned}</p>
            <p className="stat-value">{ownershipCount}</p>
          </div>
          <div className="stat-card">
            <p className="stat-label">{content.stats.paid}</p>
            <p className="stat-value">{rows.filter((row) => row.plugin.pricingMode === "PAID").length}</p>
          </div>
        </div>

        <div className="enterprise-panel">
          <div className="admin-header" style={{ marginBottom: 12 }}>
            <div className="console-filterbar">
              <Link href={buildPageHref({ filter: "all", q: keywordValue, sort, page: 1 })} className={filter === "all" ? "btn btn-primary btn-sm" : "btn btn-tertiary btn-sm"}>
                {content.filters.all}
              </Link>
              <Link href={buildPageHref({ filter: "mine", q: keywordValue, sort, page: 1 })} className={filter === "mine" ? "btn btn-primary btn-sm" : "btn btn-tertiary btn-sm"}>
                {content.filters.mine}
              </Link>
              <Link href={buildPageHref({ filter: "paid", q: keywordValue, sort, page: 1 })} className={filter === "paid" ? "btn btn-primary btn-sm" : "btn btn-tertiary btn-sm"}>
                {content.filters.paid}
              </Link>
            </div>
            <form action="/developer/plugins" className="console-filterbar">
              <input type="hidden" name="filter" value={filter} />
              <input
                type="search"
                name="q"
                defaultValue={keywordValue}
                className="input console-search"
                placeholder={content.searchPlaceholder}
              />
              <select name="sort" defaultValue={sort} className="input" style={{ minWidth: 160 }}>
                <option value="plugin_asc">{content.sortLabel}: {content.sortOptions.plugin_asc}</option>
                <option value="owner_desc">{content.sortLabel}: {content.sortOptions.owner_desc}</option>
                <option value="review_desc">{content.sortLabel}: {content.sortOptions.review_desc}</option>
                <option value="version_desc">{content.sortLabel}: {content.sortOptions.version_desc}</option>
              </select>
              <button type="submit" className="btn btn-tertiary btn-sm">
                {content.search}
              </button>
            </form>
          </div>

          <div style={{ overflowX: "auto" }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th><Link href={buildPageHref({ filter, q: keywordValue, sort: "plugin_asc", page: 1 })}>{content.headers.plugin}</Link></th>
                  <th><Link href={buildPageHref({ filter, q: keywordValue, sort: "owner_desc", page: 1 })}>{content.headers.ownership}</Link></th>
                  <th><Link href={buildPageHref({ filter, q: keywordValue, sort: "review_desc", page: 1 })}>{content.headers.review}</Link></th>
                  <th>{content.headers.verification}</th>
                  <th><Link href={buildPageHref({ filter, q: keywordValue, sort: "version_desc", page: 1 })}>{content.headers.version}</Link></th>
                  <th>{content.headers.channel}</th>
                  <th style={{ textAlign: "right" }}>{content.headers.action}</th>
                </tr>
              </thead>
              <tbody>
                {pagedRows.map(({ plugin, mine, currentVersionRecord, latestSession }) => (
                  <tr key={plugin.slug}>
                    <td>
                      <div style={{ display: "grid", gap: 4 }}>
                        <p className="text-body-md-strong">{plugin.displayName}</p>
                        <p className="text-caption" style={{ fontFamily: "ui-monospace, monospace" }}>
                          {plugin.slug}
                        </p>
                        <p className="text-body-sm text-body-color">{plugin.vendor}</p>
                      </div>
                    </td>
                    <td>
                      <span className={mine ? "badge badge-positive" : "badge badge-neutral"}>
                        {mine ? content.ownershipMine : content.ownershipPublic}
                      </span>
                    </td>
                    <td>
                      <span className={getReviewBadge(currentVersionRecord?.reviewState ?? "UNKNOWN")}>
                        {getReviewLabel(currentVersionRecord?.reviewState ?? "UNKNOWN", locale)}
                      </span>
                    </td>
                    <td>
                      <span className={getVerificationBadge(latestSession?.status ?? "UNKNOWN")}>
                        {getVerificationLabel(latestSession?.status ?? "UNKNOWN", locale)}
                      </span>
                    </td>
                    <td className="text-body-sm text-body-color">v{plugin.version}</td>
                    <td className="text-body-sm text-body-color">{plugin.channelCode}</td>
                    <td style={{ textAlign: "right" }}>
                      <Link
                        href={`/developer/plugins/${plugin.slug}`}
                        className={mine ? "btn btn-primary btn-sm" : "btn btn-tertiary btn-sm"}
                      >
                        {mine ? content.manage : content.browse}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="admin-header" style={{ marginTop: 16 }}>
            <p className="text-body-sm text-mute">
              {content.page} {safeCurrentPage} / {totalPages}
            </p>
            <div className="admin-toolbar">
              <Link
                href={buildPageHref({
                  filter,
                  q: keywordValue,
                  sort,
                  page: Math.max(1, safeCurrentPage - 1),
                })}
                className="btn btn-tertiary btn-sm"
              >
                {content.prev}
              </Link>
              <Link
                href={buildPageHref({
                  filter,
                  q: keywordValue,
                  sort,
                  page: Math.min(totalPages, safeCurrentPage + 1),
                })}
                className="btn btn-tertiary btn-sm"
              >
                {content.next}
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
