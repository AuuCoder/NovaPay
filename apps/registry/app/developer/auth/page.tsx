import Link from "next/link";
import { getCurrentLocale } from "@/lib/i18n-server";
import { getCurrentRegistrySession } from "../../../lib/auth/session";
import { governancePath } from "../../../lib/governance-paths";
import {
  developerRegisterAction,
  developerSignInAction,
  developerSignOutAction,
  developerSsoSignInAction,
} from "./actions";

export default async function DeveloperAuthPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const locale = await getCurrentLocale();
  const session = await getCurrentRegistrySession();
  const params = (await searchParams) ?? {};
  const error =
    typeof params.error === "string"
      ? params.error
      : Array.isArray(params.error)
        ? params.error[0]
        : null;
  const success =
    typeof params.success === "string"
      ? params.success
      : Array.isArray(params.success)
        ? params.success[0]
        : null;

  const content =
    locale === "en"
      ? {
          eyebrow: "Access Center",
          title: "Plugin sign-in and onboarding",
          lead:
            "Use a dedicated developer account for publishing operations, or enter governance pages through NovaPay main-site admin SSO. The registry itself does not maintain a separate admin account system.",
          currentSession: "Current session",
          currentSessionBody: "This browser already holds an active Registry session.",
          continueWorkspace: "Open workspace",
          continueAdmin: "Open governance workspace",
          currentRoleDeveloper: "Developer role",
          currentRoleAdmin: "Admin role",
          signOut: "Sign out",
          signInTitle: "Developer account",
          signInBody:
            "Sign in with a Registry developer account to manage your own slugs, upload new versions, run self-tests, and submit releases for review.",
          registerTitle: "Create developer account",
          registerBody:
            "Third-party publishers can submit an account request here. Publishing remains disabled until the account is verified or approved.",
          ssoTitle: "NovaPay admin SSO",
          ssoBody:
            "Operations and review staff enter governance pages by reusing the authenticated NovaPay main-site admin session. No separate registry admin account is required.",
          signIn: "Sign in",
          createAccount: "Create account",
          useSso: "Continue with NovaPay",
          email: "Email",
          password: "Password",
          displayName: "Display name",
          contactName: "Contact name",
          company: "Company",
          helper: "Passwords must be at least 8 characters.",
          successLabel: "Success",
          errorLabel: "Error",
          close: "Close",
          messages: {
            signin_required: "Please sign in first to continue.",
            admin_required: "A NovaPay admin SSO session is required for this page.",
            missing_credentials: "Email and password are required.",
            invalid_credentials: "Invalid developer credentials.",
            account_suspended: "This developer account is suspended.",
            email_unverified: "This developer account is waiting for verification or approval.",
            email_exists: "This email is already registered.",
            password_too_short: "Password must be at least 8 characters.",
            invalid_email: "Please enter a valid email address.",
            missing_display_name: "Display name is required.",
            registration_incomplete: "Please complete the registration form.",
            sso_token_missing: "The NovaPay SSO token is missing. Please try again.",
            sso_token_invalid: "The NovaPay SSO token is invalid or expired. Please try again.",
            signed_out: "Signed out successfully.",
            verification_required: "Account request submitted. Wait for verification or administrator approval before signing in.",
          },
        }
      : {
          eyebrow: "访问中心",
          title: "Plugin 登录与接入中心",
          lead:
            "发布动作请使用独立开发者账号；治理与审核动作通过 NovaPay 主站管理员 SSO 进入。插件市场自身不再维护独立管理员账号体系。",
          currentSession: "当前会话",
          currentSessionBody: "当前浏览器已经持有一个有效的 Registry 会话。",
          continueWorkspace: "进入工作区",
          continueAdmin: "进入治理工作区",
          currentRoleDeveloper: "开发者角色",
          currentRoleAdmin: "管理员角色",
          signOut: "退出登录",
          signInTitle: "开发者账号",
          signInBody:
            "使用 Registry 开发者账号管理自己的 slug、上传新版本、运行自测并提交审核。",
          registerTitle: "创建开发者账号",
          registerBody:
            "第三方发布者可以在这里提交账号申请；完成验证或管理员审核前不能登录或发布。",
          ssoTitle: "NovaPay 管理员 SSO",
          ssoBody:
            "审核与运营人员复用主站后台管理员会话进入治理页面，无需额外创建 Registry 管理员账号。",
          signIn: "登录",
          createAccount: "创建账号",
          useSso: "使用 NovaPay 登录",
          email: "邮箱",
          password: "密码",
          displayName: "显示名称",
          contactName: "联系人",
          company: "公司 / 团队",
          helper: "密码至少 8 位。",
          successLabel: "成功",
          errorLabel: "错误",
          close: "关闭",
          messages: {
            signin_required: "请先登录后再继续。",
            admin_required: "当前页面需要 NovaPay 管理员 SSO 会话。",
            missing_credentials: "请输入邮箱和密码。",
            invalid_credentials: "开发者账号或密码不正确。",
            account_suspended: "当前开发者账号已被停用。",
            email_unverified: "当前开发者账号正在等待验证或管理员审核。",
            email_exists: "该邮箱已被注册。",
            password_too_short: "密码至少需要 8 位。",
            invalid_email: "请输入合法的邮箱地址。",
            missing_display_name: "请填写显示名称。",
            registration_incomplete: "请完整填写注册表单。",
            sso_token_missing: "NovaPay SSO 凭证缺失，请重试。",
            sso_token_invalid: "NovaPay SSO 凭证已失效，请重新发起登录。",
            signed_out: "已成功退出登录。",
            verification_required: "账号申请已提交，请等待验证或管理员审核后再登录。",
          },
        };

  return (
    <section className="admin-shell">
      <div className="container admin-page">
        <div className="admin-header">
          <div className="admin-header-copy">
            <p className="text-eyebrow">{content.eyebrow}</p>
            <h1 className="admin-title">{content.title}</h1>
            <p className="admin-subtitle">{content.lead}</p>
          </div>
        </div>

        {session ? (
          <div className="enterprise-panel">
            <div className="admin-header">
              <div className="admin-header-copy">
                <h2 className="text-display-xs">{content.currentSession}</h2>
                <p className="text-body-sm text-body-color">{content.currentSessionBody}</p>
              </div>
            </div>
            <div className="risk-card" style={{ marginTop: 16 }}>
              <p className="risk-title">{session.displayName}</p>
              <p className="risk-subtitle">
                {session.email} ·{" "}
                {session.actorKind === "ADMIN_SSO"
                  ? content.currentRoleAdmin
                  : content.currentRoleDeveloper}
              </p>
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                <Link
                  href={
                    session.actorKind === "ADMIN_SSO"
                      ? governancePath("/overview")
                      : "/developer/plugins"
                  }
                  className="btn btn-primary"
                >
                  {session.actorKind === "ADMIN_SSO"
                    ? content.continueAdmin
                    : content.continueWorkspace}
                </Link>
                <form action={developerSignOutAction}>
                  <button type="submit" className="btn btn-tertiary">
                    {content.signOut}
                  </button>
                </form>
              </div>
            </div>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.15fr) minmax(380px, 0.85fr)", gap: 24 }}>
            <div className="enterprise-panel">
              <div className="enterprise-grid">
                <article className="risk-card">
                  <div className="risk-meta">
                    <p className="risk-title">{content.ssoTitle}</p>
                    <p className="risk-subtitle">{content.ssoBody}</p>
                  </div>
                  <form action={developerSsoSignInAction}>
                    <button type="submit" className="btn btn-primary">{content.useSso}</button>
                  </form>
                </article>

                <article className="risk-card">
                  <div className="risk-meta">
                    <p className="risk-title">{content.signInTitle}</p>
                    <p className="risk-subtitle">{content.signInBody}</p>
                  </div>
                  <form action={developerSignInAction} className="enterprise-grid">
                    <label className="label-block">
                      <span className="label-text">{content.email}</span>
                      <input type="email" name="email" className="input" placeholder="you@example.com" />
                    </label>
                    <label className="label-block">
                      <span className="label-text">{content.password}</span>
                      <input type="password" name="password" className="input" placeholder={locale === "en" ? "Enter password" : "输入密码"} />
                    </label>
                    <button type="submit" className="btn btn-primary">{content.signIn}</button>
                  </form>
                </article>
              </div>
            </div>

            <div className="enterprise-panel">
              <div className="enterprise-grid">
                <div className="admin-header-copy">
                  <h2 className="text-display-xs">{content.registerTitle}</h2>
                  <p className="text-body-sm text-body-color">{content.registerBody}</p>
                </div>
                <form action={developerRegisterAction} className="enterprise-grid">
                  <label className="label-block">
                    <span className="label-text">{content.displayName}</span>
                    <input type="text" name="displayName" className="input" placeholder={locale === "en" ? "NovaPay Labs" : "例如：NovaPay Labs"} />
                  </label>
                  <label className="label-block">
                    <span className="label-text">{content.email}</span>
                    <input type="email" name="email" className="input" placeholder="you@example.com" />
                  </label>
                  <label className="label-block">
                    <span className="label-text">{content.password}</span>
                    <input type="password" name="password" className="input" placeholder={locale === "en" ? "Enter password" : "输入密码"} />
                  </label>
                  <label className="label-block">
                    <span className="label-text">{content.contactName}</span>
                    <input type="text" name="contactName" className="input" placeholder={locale === "en" ? "Jane Doe" : "例如：张三"} />
                  </label>
                  <label className="label-block">
                    <span className="label-text">{content.company}</span>
                    <input type="text" name="contactCompany" className="input" placeholder={locale === "en" ? "Example Studio" : "例如：示例团队"} />
                  </label>
                  <p className="text-caption">{content.helper}</p>
                  <button type="submit" className="btn btn-primary">{content.createAccount}</button>
                </form>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
