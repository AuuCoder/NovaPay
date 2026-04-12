import Link from "next/link";
import { redirect } from "next/navigation";
import { readPageMessages, type SearchParamsInput } from "@/app/admin/support";
import { FlashMessage, inputClass } from "@/app/admin/ui";
import { loginMerchantAction } from "@/app/merchant/actions";
import { getCurrentLocale } from "@/lib/i18n-server";
import { hasMerchantSession } from "@/lib/merchant-session";

export default async function MerchantLoginPage({
  searchParams,
}: {
  searchParams?: SearchParamsInput;
}) {
  if (await hasMerchantSession()) {
    redirect("/merchant");
  }

  const messages = await readPageMessages(searchParams);
  const locale = await getCurrentLocale();

  const content =
    locale === "en"
      ? {
          heroTitle: "Merchant access and operations portal",
          heroDesc:
            "The merchant portal supports sign-in, business callback configuration, signing secret management, payment channel maintenance, and transaction visibility for each merchant entity.",
          onboardingTitle: "Merchant Onboarding",
          onboardingDesc:
            "Supports merchant registration and approval workflows before operational access is granted.",
          configTitle: "Configuration Management",
          configDesc:
            "Maintain merchant business callback endpoints, signing secrets, API credentials, and payment channel settings without manual platform intervention.",
          signIn: "Sign In",
          formTitle: "Merchant Account Login",
          formDesc:
            "Use the merchant access account and password created during registration. If no account has been created yet, open a new merchant account first.",
          accountLabel: "Account",
          accountPlaceholder: "merchant_ops",
          passwordLabel: "Password",
          passwordPlaceholder: "Enter merchant password",
          submitLabel: "Open Merchant Console",
          noAccount: "No account yet?",
          registerLink: "Register Merchant",
        }
      : {
          heroTitle: "商户接入与运营门户",
          heroDesc:
            "门户支持商户完成账号登录、业务回调配置、签名密钥维护、支付通道管理以及交易与 API 凭证查询。",
          onboardingTitle: "商户准入",
          onboardingDesc: "支持商开户注册与准入审核，完成审批后即可进入控制台开展配置与运营。",
          configTitle: "配置管理",
          configDesc: "支持独立维护业务回调地址、签名密钥、接口凭证与支付通道配置，降低人工运维依赖。",
          signIn: "登录",
          formTitle: "商户账号登录",
          formDesc: "请使用注册时创建的登录账号和密码进入商户控制台；如尚未开通账号，请先创建商户接入账号。",
          accountLabel: "登录账号",
          accountPlaceholder: "merchant_ops",
          passwordLabel: "密码",
          passwordPlaceholder: "请输入商户密码",
          submitLabel: "登录商户控制台",
          noAccount: "尚未开通账号？",
          registerLink: "提交商户注册",
        };

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl items-center px-6 py-10 sm:px-10">
      <section className="grid w-full gap-8 lg:grid-cols-[1.05fr_0.95fr]">
        <div className="rounded-[2rem] border border-line bg-[#1f1812] p-8 text-[#f8efe6] shadow-[0_22px_80px_rgba(20,15,10,0.32)] sm:p-10">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[#d8c3ae]">
            Merchant Portal
          </p>
          <h1 className="mt-4 text-4xl font-semibold tracking-tight sm:text-5xl">
            {content.heroTitle}
          </h1>
          <p className="mt-4 max-w-xl text-base leading-8 text-[#eadccb]">{content.heroDesc}</p>
          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            <div className="rounded-[1.5rem] border border-white/10 bg-white/5 p-5">
              <p className="text-sm font-medium">{content.onboardingTitle}</p>
              <p className="mt-2 text-sm leading-7 text-[#e8d9c8]">{content.onboardingDesc}</p>
            </div>
            <div className="rounded-[1.5rem] border border-white/10 bg-white/5 p-5">
              <p className="text-sm font-medium">{content.configTitle}</p>
              <p className="mt-2 text-sm leading-7 text-[#e8d9c8]">{content.configDesc}</p>
            </div>
          </div>
        </div>

        <div className="rounded-[2rem] border border-line bg-panel-strong p-8 shadow-[var(--shadow)] sm:p-10">
          <p className="text-xs font-semibold uppercase tracking-[0.26em] text-secondary">
            {content.signIn}
          </p>
          <h2 className="mt-4 text-3xl font-semibold text-foreground">{content.formTitle}</h2>
          <p className="mt-3 text-sm leading-7 text-muted">{content.formDesc}</p>

          <div className="mt-6">
            <FlashMessage success={messages.success} error={messages.error} />
          </div>

          <form action={loginMerchantAction} className="mt-6 space-y-5">
            <label className="block space-y-2">
              <span className="text-sm font-medium text-foreground">{content.accountLabel}</span>
              <input
                name="account"
                type="text"
                placeholder={content.accountPlaceholder}
                className={inputClass}
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
              />
            </label>
            <label className="block space-y-2">
              <span className="text-sm font-medium text-foreground">{content.passwordLabel}</span>
              <input
                name="password"
                type="password"
                placeholder={content.passwordPlaceholder}
                className={inputClass}
              />
            </label>
            <button
              type="submit"
              className="inline-flex w-full items-center justify-center rounded-2xl bg-foreground px-4 py-3 text-sm font-medium text-white transition hover:opacity-90"
            >
              {content.submitLabel}
            </button>
          </form>

          <div className="mt-6 flex items-center justify-between gap-4 rounded-[1.25rem] border border-line bg-white/70 p-4 text-sm text-muted">
            <span>{content.noAccount}</span>
            <Link href="/merchant/register" className="font-medium text-foreground hover:text-accent">
              {content.registerLink}
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
