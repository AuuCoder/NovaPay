import Link from "next/link";
import { readSearchFilters, type SearchParamsInput } from "@/app/admin/support";
import { AdminPageHeader, panelClass } from "@/app/admin/ui";
import { requireAdminSession } from "@/lib/admin-session";
import { getCurrentLocale } from "@/lib/i18n-server";

export default async function AdminForbiddenPage({
  searchParams,
}: {
  searchParams?: SearchParamsInput;
}) {
  await requireAdminSession();
  const filters = await readSearchFilters(searchParams, ["permission"]);
  const locale = await getCurrentLocale();
  const content =
    locale === "en"
      ? {
          eyebrow: "RBAC",
          title: "Access denied",
          description:
            "The current administrator account does not have permission to access this function. Contact a super administrator to adjust the role, or switch to an account with the required permission.",
          missingPermission: "Missing permission",
          unknown: "unknown",
          back: "Back to Console",
          users: "Admin Roles",
        }
      : {
          eyebrow: "RBAC",
          title: "没有访问权限",
          description:
            "当前管理员账号没有进入该功能的权限。请联系超级管理员调整角色，或者切换到拥有对应权限的账号。",
          missingPermission: "缺少权限",
          unknown: "unknown",
          back: "返回控制台",
          users: "管理员与角色",
        };

  return (
    <div className="space-y-8">
      <AdminPageHeader
        eyebrow={content.eyebrow}
        title={content.title}
        description={content.description}
      />

      <section className={`${panelClass} p-8`}>
        <p className="text-sm leading-7 text-muted">
          {content.missingPermission}
          {locale === "en" ? ": " : "："}
          <span className="ml-2 rounded-full border border-line bg-white px-3 py-1 font-mono text-xs text-foreground">
            {filters.permission || content.unknown}
          </span>
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/admin" className="rounded-2xl bg-foreground px-4 py-2.5 text-sm font-medium text-white">
            {content.back}
          </Link>
          <Link href="/admin/users" className="rounded-2xl border border-line bg-white/80 px-4 py-2.5 text-sm font-medium text-foreground">
            {content.users}
          </Link>
        </div>
      </section>
    </div>
  );
}
