import type { ReactNode } from "react";
import Link from "next/link";
import { getCurrentLocale } from "@/lib/i18n-server";
import { requireRegistryAdminSession } from "../../lib/auth/session";
import { ConsoleBreadcrumb, ConsoleNav } from "../console-nav";
import { governancePath } from "../../lib/governance-paths";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const locale = await getCurrentLocale();
  const session = await requireRegistryAdminSession();
  const content =
    locale === "en"
      ? {
          brand: "NovaPay Plugin",
          note: "Main-site SSO Governance",
          subtitle: "Risk review, publication control, and marketplace governance entered from NovaPay main-site admin SSO",
          sections: {
            workspace: "Governance",
          },
          nav: {
            overview: "Overview",
            queue: "Review Queue",
            plugins: "Plugins",
            licenses: "Licenses",
            payouts: "Payouts",
            settlement: "Settlement Policy",
            signingKeys: "Signing Keys",
            integration: "Integration",
          },
          openQueue: "Open review queue",
        }
      : {
          brand: "NovaPay Plugin",
          note: "主站 SSO 审核治理",
          subtitle: "通过 NovaPay 主站管理员 SSO 进入的风险审核、发布控制与市场治理工作区",
          sections: {
            workspace: "治理工作区",
          },
          nav: {
            overview: "总览",
            queue: "审核队列",
            plugins: "插件总览",
            licenses: "授权列表",
            payouts: "打款审核",
            settlement: "结算策略",
            signingKeys: "签名密钥",
            integration: "接入信息",
          },
          openQueue: "打开审核队列",
        };
  const breadcrumbLabels =
    locale === "en"
      ? {
          overview: "Overview",
          "review-queue": "Review Queue",
          payouts: "Payouts",
          settlement: "Settlement Policy",
          plugins: "Plugins",
          licenses: "Licenses",
        }
      : {
          overview: "总览",
          "review-queue": "审核队列",
          payouts: "打款审核",
          settlement: "结算策略",
          plugins: "插件",
          licenses: "授权列表",
        };

  return (
    <div className="console-shell">
      <aside className="console-sidebar">
        <div className="console-sidebar-brand">
          <span className="console-sidebar-mark">N</span>
          <div className="console-sidebar-copy">
            <span>{content.brand}</span>
            <span className="console-sidebar-note">{content.note}</span>
          </div>
        </div>

        <div className="console-sidebar-section">
          <p className="console-sidebar-label">{content.sections.workspace}</p>
          <ConsoleNav
            links={[
              { href: governancePath("/overview"), label: content.nav.overview },
              { href: governancePath("/review-queue"), label: content.nav.queue },
              { href: governancePath("/plugins"), label: content.nav.plugins },
              { href: governancePath("/licenses"), label: content.nav.licenses },
              { href: governancePath("/payouts"), label: content.nav.payouts },
              { href: governancePath("/settlement"), label: content.nav.settlement },
              { href: governancePath("/signing-keys"), label: content.nav.signingKeys },
              { href: governancePath("/integration"), label: content.nav.integration },
            ]}
          />
        </div>

        <div />

        <div className="console-user-card">
          <p className="console-user-name">{session.displayName}</p>
          <p className="console-user-meta">{session.email}</p>
        </div>
      </aside>

      <div className="console-main">
        <header className="console-topbar">
          <div className="console-topbar-copy">
            <ConsoleBreadcrumb locale={locale} labels={breadcrumbLabels} />
            <p className="console-topbar-title">{content.brand}</p>
            <p className="console-topbar-subtitle">{content.subtitle}</p>
          </div>
          <div className="console-topbar-actions">
            <Link href={governancePath("/review-queue")} className="btn btn-primary btn-sm">
              {content.openQueue}
            </Link>
          </div>
        </header>

        <main className="console-content">{children}</main>
      </div>
    </div>
  );
}
