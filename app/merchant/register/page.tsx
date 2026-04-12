import Link from "next/link";
import { redirect } from "next/navigation";
import { readPageMessages, type SearchParamsInput } from "@/app/admin/support";
import { FlashMessage, inputClass } from "@/app/admin/ui";
import { registerMerchantAction } from "@/app/merchant/actions";
import { getCurrentLocale } from "@/lib/i18n-server";
import { hasMerchantSession } from "@/lib/merchant-session";

export default async function MerchantRegisterPage({
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
          eyebrow: "Register",
          title: "Create merchant access account",
          intro:
            "Create the initial merchant administrator account with only a login account and password. NovaPay opens basic integration access immediately and generates the first API credential automatically. Business profile details can be completed later when official channels are enabled.",
          account: "Login Account",
          accountHint:
            "Use 4-64 lowercase letters, numbers, dots, @, underscores, or hyphens.",
          password: "Password",
          confirmPassword: "Confirm Password",
          submit: "Create Account",
          existingAccount: "Already have a merchant account?",
          backToLogin: "Back to Login",
          onboardingEyebrow: "Access Policy",
          onboardingTitle: "Quick Start",
          activationTitle: "Immediate basic access",
          activationDesc:
            "Registration creates the merchant workspace, the first owner account, and the first API credential in one step so technical teams can start integration right away.",
          profileTitle: "Complete company details only for official channels",
          profileDesc:
            "Merchant name, legal entity, contact details, and business registration information can be completed later in the console. Official regulated channels such as Alipay or WeChat Pay will enforce these fields before activation.",
          callbackTitle: "Platform-managed integration flow",
          callbackDesc:
            "NovaPay assigns the merchant code, manages upstream payment callbacks automatically, and lets merchants configure only their own business callback endpoint when needed.",
          reviewTitle: "Start testing first, enable official channels later",
          reviewDesc:
            "API credentials, docs, and business callbacks are ready after registration. Official channel activation remains controlled by profile completeness and channel credentials.",
          credentialTitle: "Dedicated API credentials and routing",
          credentialDesc:
            "Dedicated API credentials are provisioned automatically on first registration. Merchant-owned channel routing can be configured later when official payment credentials are ready.",
          accountPlaceholder: "merchant_ops",
          passwordPlaceholder: "At least 8 characters",
          confirmPasswordPlaceholder: "Re-enter password",
        }
      : {
          eyebrow: "注册",
          title: "创建商户接入账号",
          intro:
            "注册阶段只需账号和密码，系统会立即开通基础接入能力并自动生成首个 API 凭证。商户名称、企业主体、联系人等资料可在后续启用正式官方通道时再补充。",
          account: "登录账号",
          accountHint: "支持 4-64 位小写字母、数字、点、@、下划线和中划线。",
          password: "登录密码",
          confirmPassword: "确认密码",
          submit: "创建账号",
          existingAccount: "已具备商户账号？",
          backToLogin: "返回登录",
          onboardingEyebrow: "准入策略",
          onboardingTitle: "快速开始",
          activationTitle: "注册后立即可接入",
          activationDesc:
            "注册完成后立即生成商户工作台、首个所有者账号和首个 API 凭证，便于技术团队先联调接口，再逐步补充业务资料。",
          profileTitle: "正式官方通道再补企业资料",
          profileDesc:
            "商户名称、企业主体名称、联系人、联系电话、统一社会信用代码等关键信息可在后台补充；仅在启用支付宝、微信支付等高合规官方通道前才会强制校验这些字段。",
          callbackTitle: "平台统一治理接入参数",
          callbackDesc:
            "商户号由系统分配，上游支付回调由平台自动管理；商户只需要在需要时配置自己的业务回调地址，减少联调偏差。",
          reviewTitle: "先联调，再开通正式通道",
          reviewDesc:
            "注册完成后即可获取 API 凭证并开始接口联调；正式启用支付宝、微信支付等官方通道时，再补齐资料并录入对应通道参数。",
          credentialTitle: "独立凭证与路由能力",
          credentialDesc:
            "首个 `x-novapay-key` 凭证会在注册时自动生成。商户自有通道实例和默认路由可在控制台按需配置，不再要求首次注册就完成全部设置。",
          accountPlaceholder: "merchant_ops",
          passwordPlaceholder: "至少 8 位",
          confirmPasswordPlaceholder: "再次输入密码",
        };

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl items-center px-6 py-10 sm:px-10">
      <section className="grid w-full gap-8 lg:grid-cols-[1fr_1fr]">
        <div className="rounded-[2rem] border border-line bg-panel-strong p-8 shadow-[var(--shadow)] sm:p-10">
          <p className="text-xs font-semibold uppercase tracking-[0.26em] text-secondary">
            {content.eyebrow}
          </p>
          <h1 className="mt-4 text-3xl font-semibold text-foreground sm:text-4xl">
            {content.title}
          </h1>
          <p className="mt-3 text-sm leading-7 text-muted">{content.intro}</p>

          <div className="mt-6">
            <FlashMessage success={messages.success} error={messages.error} />
          </div>

          <form action={registerMerchantAction} className="mt-6 grid gap-4">
            <label className="block space-y-2">
              <span className="text-sm font-medium text-foreground">{content.account}</span>
              <input
                name="account"
                placeholder={content.accountPlaceholder}
                className={inputClass}
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
              />
              <span className="block text-xs leading-6 text-muted">{content.accountHint}</span>
            </label>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block space-y-2">
                <span className="text-sm font-medium text-foreground">{content.password}</span>
                <input
                  name="password"
                  type="password"
                  placeholder={content.passwordPlaceholder}
                  className={inputClass}
                />
              </label>
              <label className="block space-y-2">
                <span className="text-sm font-medium text-foreground">{content.confirmPassword}</span>
                <input
                  name="confirmPassword"
                  type="password"
                  placeholder={content.confirmPasswordPlaceholder}
                  className={inputClass}
                />
              </label>
            </div>

            <button
              type="submit"
              className="mt-2 inline-flex items-center justify-center rounded-2xl bg-foreground px-4 py-3 text-sm font-medium text-white transition hover:opacity-90"
            >
              {content.submit}
            </button>
          </form>

          <div className="mt-6 flex items-center justify-between gap-4 rounded-[1.25rem] border border-line bg-white/70 p-4 text-sm text-muted">
            <span>{content.existingAccount}</span>
            <Link href="/merchant/login" className="font-medium text-foreground hover:text-accent">
              {content.backToLogin}
            </Link>
          </div>
        </div>

        <div className="rounded-[2rem] border border-line bg-[#1f1812] p-8 text-[#f8efe6] shadow-[0_22px_80px_rgba(20,15,10,0.32)] sm:p-10">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[#d8c3ae]">
            {content.onboardingEyebrow}
          </p>
          <h2 className="mt-4 text-4xl font-semibold tracking-tight">{content.onboardingTitle}</h2>
          <div className="mt-6 space-y-4">
            <div className="rounded-[1.5rem] border border-white/10 bg-white/5 p-5">
              <p className="text-sm font-medium">{content.activationTitle}</p>
              <p className="mt-2 text-sm leading-7 text-[#e8d9c8]">{content.activationDesc}</p>
            </div>
            <div className="rounded-[1.5rem] border border-white/10 bg-white/5 p-5">
              <p className="text-sm font-medium">{content.profileTitle}</p>
              <p className="mt-2 text-sm leading-7 text-[#e8d9c8]">{content.profileDesc}</p>
            </div>
            <div className="rounded-[1.5rem] border border-white/10 bg-white/5 p-5">
              <p className="text-sm font-medium">{content.callbackTitle}</p>
              <p className="mt-2 text-sm leading-7 text-[#e8d9c8]">{content.callbackDesc}</p>
            </div>
            <div className="rounded-[1.5rem] border border-white/10 bg-white/5 p-5">
              <p className="text-sm font-medium">{content.reviewTitle}</p>
              <p className="mt-2 text-sm leading-7 text-[#e8d9c8]">{content.reviewDesc}</p>
            </div>
            <div className="rounded-[1.5rem] border border-white/10 bg-white/5 p-5">
              <p className="text-sm font-medium">{content.credentialTitle}</p>
              <p className="mt-2 text-sm leading-7 text-[#e8d9c8]">{content.credentialDesc}</p>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
