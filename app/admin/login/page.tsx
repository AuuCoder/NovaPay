import { redirect } from "next/navigation";
import { loginAdminAction } from "@/app/admin/actions";
import { readPageMessages, type SearchParamsInput } from "@/app/admin/support";
import { FlashMessage, inputClass } from "@/app/admin/ui";
import { hasAdminSession, isAdminUiConfigured } from "@/lib/admin-session";
import { getCurrentLocale } from "@/lib/i18n-server";

export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams?: SearchParamsInput;
}) {
  if (await hasAdminSession()) {
    redirect("/admin");
  }

  const messages = await readPageMessages(searchParams);
  const configured = await isAdminUiConfigured();
  const locale = await getCurrentLocale();

  const content =
    locale === "en"
      ? {
          heroTitle: "Enter the operations console",
          heroDesc:
            "The console supports payment gateway operations and governance, including merchant onboarding, transaction monitoring, callback handling, routing control, and audit traceability.",
          merchantTitle: "Merchant Management",
          merchantDesc:
            "Manage merchant profiles, API credentials, business callback endpoints, and channel routing policies in one place.",
          rbacTitle: "RBAC Controls",
          rbacDesc:
            "Administrative accounts use an independent role and permission model to support duty segregation and controlled access.",
          signIn: "Sign In",
          formTitle: "Administrator Sign In",
          accountLabel: "Account",
          passwordLabel: "Password",
          accountPlaceholder: "admin",
          passwordPlaceholder: "Enter administrator password",
          submitLabel: "Sign In",
          notReady: "Administrator account system has not been initialized.",
        }
      : {
          heroTitle: "进入多商户运营后台",
          heroDesc:
            "后台面向支付网关日常运营与风险控制，支持统一处理商户准入、交易监控、回调管理、通道路由与审计留痕。",
          merchantTitle: "商户管理",
          merchantDesc: "统一管理商户资料、API 凭证、业务回调地址与通道路由配置。",
          rbacTitle: "RBAC 权限",
          rbacDesc: "管理员账号采用独立角色与权限体系，可按岗位职责划分后台访问能力。",
          signIn: "Sign In",
          formTitle: "管理员账号登录",
          accountLabel: "账号",
          passwordLabel: "密码",
          accountPlaceholder: "admin",
          passwordPlaceholder: "请输入管理员密码",
          submitLabel: "登录后台",
          notReady: "管理员账号体系尚未初始化。",
        };

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl items-center px-6 py-10 sm:px-10">
      <section className="grid w-full gap-8 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-[2rem] border border-line bg-[#1f1812] p-8 text-[#f8efe6] shadow-[0_22px_80px_rgba(20,15,10,0.32)] sm:p-10">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[#d8c3ae]">
            NovaPay Admin
          </p>
          <h1 className="mt-4 text-4xl font-semibold tracking-tight sm:text-5xl">
            {content.heroTitle}
          </h1>
          <p className="mt-4 max-w-xl text-base leading-8 text-[#eadccb]">{content.heroDesc}</p>
          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            <div className="rounded-[1.5rem] border border-white/10 bg-white/5 p-5">
              <p className="text-sm font-medium">{content.merchantTitle}</p>
              <p className="mt-2 text-sm leading-7 text-[#e8d9c8]">{content.merchantDesc}</p>
            </div>
            <div className="rounded-[1.5rem] border border-white/10 bg-white/5 p-5">
              <p className="text-sm font-medium">{content.rbacTitle}</p>
              <p className="mt-2 text-sm leading-7 text-[#e8d9c8]">{content.rbacDesc}</p>
            </div>
          </div>
        </div>

        <div className="rounded-[2rem] border border-line bg-panel-strong p-8 shadow-[var(--shadow)] sm:p-10">
          <p className="text-xs font-semibold uppercase tracking-[0.26em] text-secondary">
            {content.signIn}
          </p>
          <h2 className="mt-4 text-3xl font-semibold text-foreground">{content.formTitle}</h2>

          <div className="mt-6">
            <FlashMessage
              success={!configured ? null : messages.success}
              error={!configured ? content.notReady : messages.error}
            />
          </div>

          <form action={loginAdminAction} className="mt-6 space-y-5">
            <label className="block space-y-2">
              <span className="text-sm font-medium text-foreground">{content.accountLabel}</span>
              <input
                name="email"
                type="text"
                placeholder={content.accountPlaceholder}
                className={inputClass}
                disabled={!configured}
              />
            </label>
            <label className="block space-y-2">
              <span className="text-sm font-medium text-foreground">{content.passwordLabel}</span>
              <input
                name="password"
                type="password"
                placeholder={content.passwordPlaceholder}
                className={inputClass}
                disabled={!configured}
              />
            </label>
            <button
              type="submit"
              disabled={!configured}
              className="inline-flex w-full items-center justify-center rounded-2xl bg-foreground px-4 py-3 text-sm font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {content.submitLabel}
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}
