import { createAdminUserAction, updateAdminUserAction } from "@/app/admin/actions";
import {
  buildPageHref,
  formatDateTime,
  getPaginationState,
  parsePageParam,
  readPageMessages,
  readSearchFilters,
  type SearchParamsInput,
} from "@/app/admin/support";
import {
  AdminPageHeader,
  FlashMessage,
  LabeledField,
  PaginationNav,
  StatusBadge,
  buttonClass,
  inputClass,
  panelClass,
  selectClass,
  tableWrapperClass,
} from "@/app/admin/ui";
import { getAdminDisplayRole, requireAdminPermission } from "@/lib/admin-session";
import { getCurrentLocale } from "@/lib/i18n-server";
import { getPrismaClient } from "@/lib/prisma";

const ADMIN_USER_PAGE_SIZE = 20;

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams?: SearchParamsInput;
}) {
  await requireAdminPermission("admin_user:read");
  const prisma = getPrismaClient();
  const locale = await getCurrentLocale();
  const [messages, filters] = await Promise.all([
    readPageMessages(searchParams),
    readSearchFilters(searchParams, ["q", "page"]),
  ]);
  const requestedPage = parsePageParam(filters.page);
  const keyword = filters.q;
  const roleOptions =
    locale === "en"
      ? [
          { value: "SUPER_ADMIN", label: "Super Admin" },
          { value: "OPS_ADMIN", label: "Operations Admin" },
          { value: "FINANCE_ADMIN", label: "Finance Admin" },
          { value: "VIEWER", label: "Read-only Viewer" },
        ]
      : [
          { value: "SUPER_ADMIN", label: "超级管理员" },
          { value: "OPS_ADMIN", label: "运营管理员" },
          { value: "FINANCE_ADMIN", label: "财务管理员" },
          { value: "VIEWER", label: "只读观察员" },
        ];
  const content =
    locale === "en"
      ? {
          eyebrow: "Admin Users",
          title: "Administrators and roles",
          description:
            "Manage administrator accounts, role assignments, and activation status here. RBAC is enforced at the server-action layer, not only hidden in the UI.",
          createTitle: "Create administrator",
          accountLabel: "Account",
          accountPlaceholder: "ops-admin",
          nameLabel: "Name",
          namePlaceholder: "Operations Lead",
          roleLabel: "Role",
          passwordLabel: "Initial Password",
          passwordPlaceholder: "Enter an initial password",
          enabled: "Enable account",
          createButton: "Create Admin",
          accountsEyebrow: "Accounts",
          accountsTitle: "Administrator directory",
          accountCol: "Account",
          roleCol: "Role",
          statusCol: "Status",
          lastLoginCol: "Last Login",
          createdAtCol: "Created At",
          updatePasswordPlaceholder: "Leave blank to keep the current password",
          saveButton: "Save Admin",
          enabledStatus: "Enabled",
          disabledStatus: "Disabled",
          keywordLabel: "Keyword",
          keywordPlaceholder: "Search by name or email",
          searchButton: "Search Admins",
          noResults: "No administrator accounts matched the current filter.",
          pageSummary: "Page",
          pageRange: "Showing",
          pageConnector: "of",
          previous: "Previous Page",
          next: "Next Page",
        }
      : {
          eyebrow: "Admin Users",
          title: "管理员与角色",
          description:
            "在这里维护后台管理员账号、角色和启停状态。RBAC 会在服务端动作层强制校验，不只是界面隐藏。",
          createTitle: "新增管理员",
          accountLabel: "账号",
          accountPlaceholder: "ops-admin",
          nameLabel: "姓名",
          namePlaceholder: "运营负责人",
          roleLabel: "角色",
          passwordLabel: "初始密码",
          passwordPlaceholder: "请输入初始密码",
          enabled: "启用账号",
          createButton: "创建管理员",
          accountsEyebrow: "Accounts",
          accountsTitle: "管理员目录",
          accountCol: "账号",
          roleCol: "角色",
          statusCol: "状态",
          lastLoginCol: "最近登录",
          createdAtCol: "创建时间",
          updatePasswordPlaceholder: "留空则不修改密码",
          saveButton: "保存管理员",
          enabledStatus: "启用",
          disabledStatus: "停用",
          keywordLabel: "关键词",
          keywordPlaceholder: "按姓名或邮箱搜索",
          searchButton: "查询管理员",
          noResults: "当前筛选条件下没有管理员账号。",
          pageSummary: "页码",
          pageRange: "当前显示",
          pageConnector: "共",
          previous: "上一页",
          next: "下一页",
        };
  const where = keyword
    ? {
        OR: [
          { name: { contains: keyword, mode: "insensitive" as const } },
          { email: { contains: keyword, mode: "insensitive" as const } },
        ],
      }
    : undefined;
  const totalCount = await prisma.adminUser.count({ where });
  const { currentPage, totalPages, offset, pageStart, pageEnd } = getPaginationState(
    totalCount,
    requestedPage,
    ADMIN_USER_PAGE_SIZE,
  );
  const users = await prisma.adminUser.findMany({
    where,
    orderBy: [{ createdAt: "asc" }],
    skip: offset,
    take: ADMIN_USER_PAGE_SIZE,
  });
  const currentPageHref = buildPageHref("/admin/users", { q: keyword }, currentPage);

  return (
    <div className="space-y-8">
      <AdminPageHeader
        eyebrow={content.eyebrow}
        title={content.title}
        description={content.description}
      />

      <FlashMessage success={messages.success} error={messages.error} />

      <section className={`${panelClass} p-6`}>
        <h2 className="text-2xl font-semibold text-foreground">{content.createTitle}</h2>
        <form action={createAdminUserAction} className="mt-6 grid gap-4 lg:grid-cols-2">
          <input type="hidden" name="redirectTo" value={currentPageHref} />
          <LabeledField label={content.accountLabel}>
            <input name="email" type="text" placeholder={content.accountPlaceholder} className={inputClass} />
          </LabeledField>
          <LabeledField label={content.nameLabel}>
            <input name="name" placeholder={content.namePlaceholder} className={inputClass} />
          </LabeledField>
          <LabeledField label={content.roleLabel}>
            <select name="role" defaultValue="OPS_ADMIN" className={selectClass}>
              {roleOptions.map((role) => (
                <option key={role.value} value={role.value}>
                  {role.label}
                </option>
              ))}
            </select>
          </LabeledField>
          <LabeledField label={content.passwordLabel}>
            <input name="password" type="password" placeholder={content.passwordPlaceholder} className={inputClass} />
          </LabeledField>
          <div className="rounded-[1.25rem] border border-line bg-white/65 p-4 lg:col-span-2">
            <label className="flex items-center gap-3 text-sm font-medium text-foreground">
              <input type="checkbox" name="enabled" defaultChecked className="h-4 w-4 rounded border-line" />
              {content.enabled}
            </label>
          </div>
          <div className="lg:col-span-2">
            <button type="submit" className={buttonClass}>
              {content.createButton}
            </button>
          </div>
        </form>
      </section>

      <section className={`${panelClass} p-6`}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.22em] text-muted">{content.accountsEyebrow}</p>
            <h2 className="mt-2 text-2xl font-semibold text-foreground">{content.accountsTitle}</h2>
          </div>
          <p className="text-xs text-muted">
            {content.pageSummary} {currentPage}/{totalPages} · {content.pageRange} {pageStart}-{pageEnd} {content.pageConnector} {totalCount}
          </p>
        </div>

        <form className="mt-6 grid gap-4 sm:grid-cols-[1fr_auto]">
          <LabeledField label={content.keywordLabel}>
            <input
              name="q"
              defaultValue={keyword}
              placeholder={content.keywordPlaceholder}
              className={inputClass}
            />
          </LabeledField>
          <div className="flex items-end">
            <button type="submit" className={buttonClass}>
              {content.searchButton}
            </button>
          </div>
        </form>

        <div className={`mt-6 ${tableWrapperClass}`}>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-[#f3e7d7] text-xs uppercase tracking-[0.18em] text-muted">
                <tr>
                  <th className="px-4 py-3">{content.accountCol}</th>
                  <th className="px-4 py-3">{content.roleCol}</th>
                  <th className="px-4 py-3">{content.statusCol}</th>
                  <th className="px-4 py-3">{content.lastLoginCol}</th>
                  <th className="px-4 py-3">{content.createdAtCol}</th>
                </tr>
              </thead>
              <tbody>
                {users.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-10 text-center text-sm text-muted">
                      {content.noResults}
                    </td>
                  </tr>
                ) : (
                  users.map((user) => (
                    <tr key={user.id} className="border-t border-line/70 align-top">
                      <td className="px-4 py-4">
                        <p className="font-medium text-foreground">{user.name}</p>
                        <p className="mt-1 text-xs text-muted">{user.email}</p>
                        <form action={updateAdminUserAction} className="mt-4 grid gap-3 rounded-[1rem] border border-line bg-[#faf7f1] p-4">
                          <input type="hidden" name="redirectTo" value={currentPageHref} />
                          <input type="hidden" name="id" value={user.id} />
                          <div className="grid gap-3 sm:grid-cols-2">
                            <input name="name" defaultValue={user.name} className={inputClass} />
                            <input name="email" type="text" defaultValue={user.email} className={inputClass} />
                          </div>
                          <div className="grid gap-3 sm:grid-cols-2">
                            <select name="role" defaultValue={user.role} className={selectClass}>
                              {roleOptions.map((role) => (
                                <option key={role.value} value={role.value}>
                                  {role.label}
                                </option>
                              ))}
                            </select>
                            <input
                              name="password"
                              type="password"
                              placeholder={content.updatePasswordPlaceholder}
                              className={inputClass}
                            />
                          </div>
                          <label className="flex items-center gap-3 text-sm font-medium text-foreground">
                            <input
                              type="checkbox"
                              name="enabled"
                              defaultChecked={user.enabled}
                              className="h-4 w-4 rounded border-line"
                            />
                            {content.enabled}
                          </label>
                          <div>
                            <button type="submit" className="rounded-xl border border-line bg-white px-3 py-2 text-xs font-medium text-foreground">
                              {content.saveButton}
                            </button>
                          </div>
                        </form>
                      </td>
                      <td className="px-4 py-4 text-xs text-muted">{getAdminDisplayRole(user.role, locale)}</td>
                      <td className="px-4 py-4">
                        <StatusBadge tone={user.enabled ? "success" : "danger"}>
                          {user.enabled ? content.enabledStatus : content.disabledStatus}
                        </StatusBadge>
                      </td>
                      <td className="px-4 py-4 text-xs text-muted">{formatDateTime(user.lastLoginAt, locale)}</td>
                      <td className="px-4 py-4 text-xs text-muted">{formatDateTime(user.createdAt, locale)}</td>
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
            currentPage > 1 ? buildPageHref("/admin/users", { q: keyword }, currentPage - 1) : null
          }
          previousLabel={content.previous}
          nextHref={
            currentPage < totalPages
              ? buildPageHref("/admin/users", { q: keyword }, currentPage + 1)
              : null
          }
          nextLabel={content.next}
        />
      </section>
    </div>
  );
}
