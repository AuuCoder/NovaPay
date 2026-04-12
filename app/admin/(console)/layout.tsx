import Link from "next/link";
import type { ReactNode } from "react";
import { logoutAdminAction } from "@/app/admin/actions";
import { AdminNav, type AdminNavItem } from "@/app/admin/nav";
import { getAdminDisplayRole, requireAdminSession } from "@/lib/admin-session";
import { getCurrentLocale } from "@/lib/i18n-server";
import { hasPermission } from "@/lib/rbac";

export default async function AdminConsoleLayout({
  children,
}: {
  children: ReactNode;
}) {
  const session = await requireAdminSession();
  const locale = await getCurrentLocale();
  const role = session.adminUser.role;
  const content =
    locale === "en"
      ? {
          homeLabel: "Dashboard",
          merchantsLabel: "Merchant Center",
          ordersLabel: "Order Center",
          financeLabel: "Finance Center",
          callbacksLabel: "Callback Center",
          bindingsLabel: "Routing",
          systemConfigLabel: "System Config",
          usersLabel: "Admins",
          auditLabel: "Audit Logs",
          idempotencyLabel: "Idempotency",
          homeDetail: "Platform-wide metrics and operating entry points",
          merchantsDetail: "Search merchants and access detailed management views",
          ordersDetail: "Query transactions across merchants and statuses",
          financeDetail: "Review reconciliation summaries and ledger details",
          callbacksDetail: "Inspect merchant callback delivery and failure reasons",
          bindingsDetail: "Assign default merchant-owned channel instances by route",
          systemConfigDetail: "Manage timeout, callback, and signing parameters online",
          usersDetail: "Manage administrator accounts, roles, and activation status",
          auditDetail: "Track critical back-office operations",
          idempotencyDetail: "Trace merchant write-request retries and cached replays",
          title: "Operations Console",
          intro:
            "Operations workspace for a multi-merchant payment gateway, covering merchant approval, transactions, callbacks, merchant-owned routing, and audit visibility.",
          docs: "API Docs",
          logout: "Sign Out",
        }
      : {
          homeLabel: "控制台",
          merchantsLabel: "商户中心",
          ordersLabel: "订单中心",
          financeLabel: "资金中心",
          callbacksLabel: "回调中心",
          bindingsLabel: "路由配置",
          systemConfigLabel: "系统配置",
          usersLabel: "管理员",
          auditLabel: "审计日志",
          idempotencyLabel: "幂等追踪",
          homeDetail: "多商户总体指标与运营入口",
          merchantsDetail: "检索商户并进入详情页管理",
          ordersDetail: "按商户和状态统一检索交易",
          financeDetail: "查看对账日报与资金流水明细",
          callbacksDetail: "查看商户回调投递与失败原因",
          bindingsDetail: "指定商户默认使用哪个自有通道实例",
          systemConfigDetail: "在线维护超时、回调与签名参数",
          usersDetail: "管理账号、角色和启停状态",
          auditDetail: "记录后台关键操作流水",
          idempotencyDetail: "追踪商户写请求的安全重试与结果复用",
          title: "企业运营后台",
          intro: "面向多商户支付网关的运营后台，覆盖商户审核、订单、回调、商户自有通道路由与审计日志。",
          docs: "API 文档",
          logout: "退出登录",
        };
  const navItems: AdminNavItem[] = [
    {
      href: "/admin",
      label: content.homeLabel,
      detail: content.homeDetail,
    },
    ...(hasPermission(role, "merchant:read")
      ? [
          {
            href: "/admin/merchants",
            label: content.merchantsLabel,
            detail: content.merchantsDetail,
          },
        ]
      : []),
    ...(hasPermission(role, "order:read")
      ? [
          {
            href: "/admin/orders",
            label: content.ordersLabel,
            detail: content.ordersDetail,
          },
        ]
      : []),
    ...(hasPermission(role, "finance:read")
      ? [
          {
            href: "/admin/finance",
            label: content.financeLabel,
            detail: content.financeDetail,
          },
        ]
      : []),
    ...(hasPermission(role, "callback:read")
      ? [
          {
            href: "/admin/callbacks",
            label: content.callbacksLabel,
            detail: content.callbacksDetail,
          },
        ]
      : []),
    ...(hasPermission(role, "binding:read")
      ? [
          {
            href: "/admin/bindings",
            label: content.bindingsLabel,
            detail: content.bindingsDetail,
          },
        ]
      : []),
    ...(hasPermission(role, "system_config:read")
      ? [
          {
            href: "/admin/system-config",
            label: content.systemConfigLabel,
            detail: content.systemConfigDetail,
          },
        ]
      : []),
    ...(hasPermission(role, "admin_user:read")
      ? [
          {
            href: "/admin/users",
            label: content.usersLabel,
            detail: content.usersDetail,
          },
        ]
      : []),
    ...(hasPermission(role, "audit:read")
      ? [
          {
            href: "/admin/audit-logs",
            label: content.auditLabel,
            detail: content.auditDetail,
          },
          {
            href: "/admin/idempotency",
            label: content.idempotencyLabel,
            detail: content.idempotencyDetail,
          },
        ]
      : []),
  ];

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[1600px] flex-col px-4 py-4 sm:px-6 lg:px-8">
      <div className="grid min-h-[calc(100vh-2rem)] gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="rounded-[2rem] border border-line bg-[#1f1812] p-6 text-[#f8efe6] shadow-[0_22px_80px_rgba(20,15,10,0.26)]">
          <Link href="/" className="inline-flex items-center rounded-full border border-white/10 px-3 py-1 text-xs uppercase tracking-[0.28em] text-[#dac7b3]">
            NovaPay
          </Link>
          <h1 className="mt-5 text-3xl font-semibold">{content.title}</h1>
          <p className="mt-3 text-sm leading-7 text-[#e9dccd]">{content.intro}</p>

          <div className="mt-6 rounded-[1.5rem] border border-white/10 bg-white/5 p-4">
            <p className="text-sm font-medium text-white">{session.adminUser.name}</p>
            <p className="mt-1 text-xs text-[#dac7b3]">{session.adminUser.email}</p>
            <p className="mt-2 inline-flex rounded-full border border-white/10 px-3 py-1 text-xs text-[#f3dfcb]">
              {getAdminDisplayRole(role)}
            </p>
          </div>

          <div className="mt-8">
            <AdminNav items={navItems} />
          </div>

          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/docs"
              className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-medium text-white"
            >
              {content.docs}
            </Link>
            <form action={logoutAdminAction}>
              <button
                type="submit"
                className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-medium text-white"
              >
                {content.logout}
              </button>
            </form>
          </div>
        </aside>

        <div className="rounded-[2rem] border border-line bg-[linear-gradient(180deg,rgba(255,255,255,0.9),rgba(255,248,240,0.82))] p-5 shadow-[var(--shadow)] sm:p-6 lg:p-8">
          {children}
        </div>
      </div>
    </main>
  );
}
