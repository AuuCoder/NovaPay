import type { ReactNode } from "react";
import Link from "next/link";
import { LanguageSwitcher } from "../language-switcher";
import { getCurrentLocale } from "@/lib/i18n-server";
import { getCurrentRegistrySession } from "../../lib/auth/session";
import { developerSignOutAction } from "./auth/actions";
import { ConsoleBreadcrumb, ConsoleNav } from "../console-nav";
import { DeveloperShell } from "./developer-shell";
import { governancePath } from "../../lib/governance-paths";

export default async function DeveloperLayout({ children }: { children: ReactNode }) {
  const locale = await getCurrentLocale();
  const session = await getCurrentRegistrySession();
  const adminSession = session?.actorKind === "ADMIN_SSO";
  const content =
    adminSession
      ? locale === "en"
        ? {
            brand: "NovaPay Plugin",
            note: "Main-site SSO Governance",
            signIn: "Sign in",
            accessPortal: "Open review queue",
            signOut: "Sign out",
            subtitle: "Governance workspace entered from NovaPay main-site admin SSO",
            sections: {
              workspace: "Governance",
            },
            nav: {
              overview: "Overview",
              reviewQueue: "Review Queue",
              plugins: "Plugins",
              licenses: "Licenses",
              payouts: "Payouts",
              settlement: "Settlement Policy",
              signingKeys: "Signing Keys",
            },
          }
        : {
            brand: "NovaPay Plugin",
            note: "主站 SSO 治理入口",
            signIn: "登录",
            accessPortal: "打开审核队列",
            signOut: "退出登录",
            subtitle: "通过 NovaPay 主站管理员 SSO 进入的插件市场治理工作区",
            sections: {
              workspace: "治理工作台",
            },
            nav: {
              overview: "总览",
              reviewQueue: "审核队列",
              plugins: "插件总览",
              licenses: "授权列表",
              payouts: "打款审核",
              settlement: "结算策略",
              signingKeys: "签名密钥",
            },
          }
      : locale === "en"
        ? {
            brand: "NovaPay Plugin",
            note: "Developer Console",
            signIn: "Sign in",
            accessPortal: "Open workspace",
            signOut: "Sign out",
            subtitle: "Plugin publishing, token management, and sales operations",
            sections: {
              workspace: "Workspace",
            },
            nav: {
              plugins: "Plugins",
              tokens: "API Tokens",
              sales: "Sales",
            },
          }
        : {
            brand: "NovaPay Plugin",
            note: "开发者控制台",
            signIn: "登录",
            accessPortal: "打开工作台",
            signOut: "退出登录",
            subtitle: "插件发布、凭证管理和销售运营",
            sections: {
              workspace: "工作区",
            },
            nav: {
              plugins: "插件",
              tokens: "API 凭证",
              sales: "销售",
            },
          };

  const navLinks: Array<{ href: string; label: string }> = adminSession
    ? [
        { href: governancePath("/review-queue"), label: content.nav.reviewQueue as string },
        { href: governancePath("/overview"), label: content.nav.overview as string },
        { href: governancePath("/plugins"), label: content.nav.plugins as string },
        { href: governancePath("/licenses"), label: content.nav.licenses as string },
        { href: governancePath("/payouts"), label: content.nav.payouts as string },
        { href: governancePath("/settlement"), label: content.nav.settlement as string },
        { href: governancePath("/signing-keys"), label: content.nav.signingKeys as string },
      ]
    : [
        { href: "/developer/plugins", label: content.nav.plugins as string },
        { href: "/developer/tokens", label: content.nav.tokens as string },
        { href: "/developer/sales", label: content.nav.sales as string },
      ];
  const breadcrumbLabels: Record<string, string> = adminSession
    ? locale === "en"
      ? {
          developer: "Developer",
          auth: "Authentication",
          overview: "Overview",
          "review-queue": "Review Queue",
          plugins: "Plugins",
          licenses: "Licenses",
          payouts: "Payouts",
          settlement: "Settlement Policy",
          "signing-keys": "Signing Keys",
        }
      : {
          developer: "开发者",
          auth: "认证",
          overview: "总览",
          "review-queue": "审核队列",
          plugins: "插件总览",
          licenses: "授权列表",
          payouts: "打款审核",
          settlement: "结算策略",
          "signing-keys": "签名密钥",
        }
    : locale === "en"
      ? {
          developer: "Developer",
          plugins: "Plugins",
          tokens: "API Tokens",
          sales: "Sales",
          auth: "Authentication",
          upload: "Upload",
          versions: "Versions",
          new: "New",
        }
      : {
          developer: "开发者",
          plugins: "插件",
          tokens: "API 凭证",
          sales: "销售",
          auth: "认证",
          upload: "上传",
          versions: "版本",
          new: "新建",
        };

  return (
    <DeveloperShell
      brand={content.brand}
      note={content.note}
      subtitle={content.subtitle}
      workspaceLabel={content.sections.workspace}
      navLinks={navLinks}
      localeSwitcher={<LanguageSwitcher locale={locale} inline />}
      nav={<ConsoleNav links={navLinks} />}
      breadcrumb={<ConsoleBreadcrumb locale={locale} labels={breadcrumbLabels} />}
      sessionArea={
        session ? (
          <>
            <p className="console-user-name">{session.displayName}</p>
            <p className="console-user-meta">{session.email}</p>
          </>
        ) : (
          <>
            <p className="console-user-name">{content.brand}</p>
            <p className="console-user-meta">{content.subtitle}</p>
          </>
        )
      }
      topbarActions={
        session ? (
          <>
            <form action={developerSignOutAction}>
              <button type="submit" className="btn btn-tertiary btn-sm">
                {content.signOut}
              </button>
            </form>
            <Link href={adminSession ? governancePath("/overview") : "/developer/plugins"} className="btn btn-primary btn-sm">
              {content.accessPortal}
            </Link>
          </>
        ) : (
          <>
            <Link href="/developer/auth" className="btn btn-tertiary btn-sm">
              {content.signIn}
            </Link>
            <Link href="/developer/auth" className="btn btn-primary btn-sm">
              {content.accessPortal}
            </Link>
          </>
        )
      }
    >
      {children}
    </DeveloperShell>
  );
}
