import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentLocale } from "@/lib/i18n-server";
import { LanguageSwitcher } from "./language-switcher";
import { getCurrentRegistrySession } from "../lib/auth/session";
import { getRegistrySetupStatus } from "../lib/setup";
import { governancePath } from "../lib/governance-paths";

export default async function HomePage() {
  const locale = await getCurrentLocale();
  const setupStatus = await getRegistrySetupStatus();
  const session = await getCurrentRegistrySession();
  const role = session?.actorKind ?? null;

  if (!setupStatus.setupComplete) {
    redirect("/setup");
  }

  const content =
    locale === "en"
      ? {
          brand: "NovaPay Plugin",
          eyebrow: "Plugin Infrastructure",
          title: "A cloud-style control plane for NovaPay payment plugins.",
          lead:
            "Operate third-party and official payment plugins through a signed registry, standardized self-test workflow, and governance pages entered from NovaPay main-site admin SSO. The platform is designed as an operational backend, not just a listing page.",
          openDeveloper: "Open developer console",
          openAdmin: "Open governance workspace",
          openCatalog: "Open public catalog",
          activeDeveloper: "Developer session detected",
          activeAdmin: "Admin session detected",
          activeGuest: "Choose a workspace",
          activeDeveloperBody:
            "You are signed in as a publisher account. The interface now prioritizes plugin publishing, token management, and revenue operations.",
          activeAdminBody:
            "You are signed in through NovaPay main-site admin SSO. The interface now prioritizes review, licensing, settlement, and signing-key governance without a separate registry admin account.",
          activeGuestBody:
            "Sign in first, then the registry will automatically narrow the available entry points to the pages your role can actually use.",
          metrics: [
            { label: "Signed delivery", value: "Ed25519" },
            { label: "Review workflow", value: "Risk-first" },
            { label: "Plugin type", value: "Payment channel" },
          ],
          sections: [
            {
              title: "Developer operations",
              body: "Claim slugs, upload versions, generate templates, manage API tokens, and run publisher self-tests before review.",
            },
            {
              title: "Admin governance",
              body: "Review queue surfaces missing verification profile, missing test evidence, failed self-tests, and publish-ready versions in one place.",
            },
            {
              title: "Remote consumption",
              body: "NovaPay deployments consume the signed catalog remotely, verify checksums offline, and install runtime-ready payment plugins into merchant workspaces.",
            },
          ],
          reviewWorkflow: "Risk-first",
          paymentChannel: "Payment channel",
        }
      : {
          brand: "NovaPay Plugin",
          eyebrow: "插件基础设施",
          title: "面向 NovaPay 支付插件的云平台式控制平面。",
          lead:
            "通过签名 Registry、标准化自测流程以及来自主站管理员 SSO 的治理入口，统一运营官方与第三方支付插件。它应该像一个运营后台，而不是单纯的展示页。",
          openDeveloper: "打开开发者控制台",
          openAdmin: "打开治理工作区",
          openCatalog: "打开公开目录",
          activeDeveloper: "已识别为开发者会话",
          activeAdmin: "已识别为管理员会话",
          activeGuest: "请选择工作台",
          activeDeveloperBody:
            "你当前登录的是发布者账号，系统会优先展示插件发布、凭证管理和收益运营相关入口。",
          activeAdminBody:
            "你当前登录的是 NovaPay 主站管理员 SSO，系统会直接展示审核、授权、结算与签名密钥治理入口，而不是使用独立的 Registry 管理员账号。",
          activeGuestBody:
            "请先登录，登录后插件市场会自动收敛成与你角色权限匹配的页面入口。",
          metrics: [
            { label: "签名交付", value: "Ed25519" },
            { label: "审核工作流", value: "风险优先" },
            { label: "插件类型", value: "支付通道" },
          ],
          sections: [
            {
              title: "开发者运营",
              body: "认领 slug、上传版本、生成模板、管理 API 凭证，并在提审前完成发布者自测。",
            },
            {
              title: "管理员治理",
              body: "审核队列统一暴露缺少 verificationProfile、缺少测试凭证、自测失败、已可发布等风险态。",
            },
            {
              title: "远程消费",
              body: "NovaPay 部署通过远程目录消费签名插件，离线校验 checksum，并把可运行插件安装到商户工作区。",
            },
          ],
          reviewWorkflow: "风险优先",
          paymentChannel: "支付通道",
        };

  const primaryCta =
    role === "ADMIN_SSO"
      ? { href: governancePath("/overview"), label: content.openAdmin }
      : { href: "/developer/plugins", label: content.openDeveloper };
  const secondaryCta =
    role === "DEVELOPER"
      ? { href: "/developer/auth", label: content.openCatalog }
      : role === "ADMIN_SSO"
        ? { href: "/developer/auth", label: content.openCatalog }
        : { href: governancePath("/overview"), label: content.openAdmin };
  const showAdminEntry = role !== "DEVELOPER";
  const statusTitle =
    role === "DEVELOPER"
      ? content.activeDeveloper
      : role === "ADMIN_SSO"
        ? content.activeAdmin
        : content.activeGuest;
  const statusBody =
    role === "DEVELOPER"
      ? content.activeDeveloperBody
      : role === "ADMIN_SSO"
        ? content.activeAdminBody
        : content.activeGuestBody;

  return (
    <main>
      <nav className="nav">
        <div className="nav-inner">
          <Link href="/" className="nav-brand">
            <span className="nav-brand-mark">N</span>
            <span>{content.brand}</span>
          </Link>
          <div className="nav-actions">
            <LanguageSwitcher locale={locale} inline />
            {showAdminEntry ? (
              <Link href={secondaryCta.href} className="btn btn-tertiary btn-sm">
                {secondaryCta.label}
              </Link>
            ) : null}
            {role === "DEVELOPER" ? (
              <Link href="/api/registry/plugins" className="btn btn-tertiary btn-sm">
                {content.openCatalog}
              </Link>
            ) : null}
            <Link href={primaryCta.href} className="btn btn-primary btn-sm">
              {primaryCta.label}
            </Link>
          </div>
        </div>
      </nav>

      <section className="admin-shell">
        <div className="container admin-page">
          <div className="admin-header">
            <div className="admin-header-copy">
              <p className="text-eyebrow">{content.eyebrow}</p>
              <h1 className="admin-title" style={{ maxWidth: 960 }}>{content.title}</h1>
              <p className="admin-subtitle" style={{ maxWidth: 760 }}>{content.lead}</p>
            </div>
          </div>

          <div className="enterprise-panel">
            <div className="risk-card">
              <div className="risk-meta">
                <p className="risk-title">{statusTitle}</p>
                <p className="risk-subtitle">{statusBody}</p>
              </div>
            </div>
          </div>

          <div className="grid-3">
            {(showAdminEntry ? content.metrics : [content.metrics[0], content.metrics[2]].filter(Boolean)).map((metric) => (
              <div key={metric.label} className="stat-card feature">
                <p className="stat-label">{metric.label}</p>
                <p className="stat-value">{metric.value}</p>
              </div>
            ))}
          </div>

          <div className="enterprise-panel">
            <div className="grid-3">
              {(showAdminEntry ? content.sections : [content.sections[0], content.sections[2]].filter(Boolean)).map((section) => (
                <article key={section.title} className="risk-card">
                  <div className="risk-meta">
                    <p className="risk-title">{section.title}</p>
                    <p className="risk-subtitle">{section.body}</p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
