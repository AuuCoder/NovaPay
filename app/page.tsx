import Link from "next/link";
import { getCurrentLocale } from "@/lib/i18n-server";
import { listPaymentChannels } from "@/lib/payments/registry";

const stack = [
  "Next.js 16 + App Router",
  "TypeScript 5.9",
  "React 19",
  "Tailwind CSS 4",
  "Prisma 7 + adapter-pg",
  "PostgreSQL 16",
];

export default async function Home() {
  const locale = await getCurrentLocale();
  const channels = listPaymentChannels();

  const content =
    locale === "en"
      ? {
          badge: "NovaPay Enterprise Payment Infrastructure",
          titleLead: "Enterprise payment",
          titleAccent: "infrastructure for multi-merchant operations",
          intro:
            "NovaPay provides the core platform capabilities required for multi-merchant payment operations, covering merchant access, channel governance, request authentication, callback orchestration, and financial control data within a unified delivery baseline.",
          docsButton: "Integration Docs",
          merchantEntryButton: "Merchant Sign In / Register",
          readinessTitle: "Operational Baseline",
          appLayer: "Access Layer",
          appLayerDesc:
            "Supports merchant access, payment entry, callback ingress, and operational workflows through a unified external service layer.",
          dataLayer: "Transaction Data Layer",
          dataLayerDesc:
            "Built on Prisma 7 and PostgreSQL 16 to maintain consistent transaction models, auditable operational records, and structured financial data.",
          extensionLayer: "Channel Governance Layer",
          extensionLayerDesc:
            "Supports merchant-scoped channel instances, routing policies, and standardized extension points for future payment method expansion.",
          foundationEyebrow: "Platform Capability",
          channelsEyebrow: "Payment Methods",
          channelsTitle: "Current Delivery Scope",
          channelsDesc:
            "The current release covers Alipay Web and WeChat Pay Native with live order creation, callback verification, merchant-level credential isolation, and hosted payment testing.",
          statusReady: "In Service",
          statusPlanned: "Ready for Expansion",
          statusManaged: "Merchant Scoped",
          docsCardEyebrow: "Documentation",
          docsCardTitle: "Unified API and Integration Documentation",
          docsCardDesc:
            "The built-in `/docs` and `/api/openapi` endpoints provide standardized interface definitions, signing specifications, callback rules, and integration examples for delivery teams and merchant-side engineers.",
          docsCardButton: "View Documentation",
          merchantCardEyebrow: "Merchant Services",
          merchantCardTitle: "Merchant Service Portal",
          merchantCardDesc:
            "Provides a unified entry point for merchant sign-in, channel configuration, business callback governance, API credential management, and payment testing.",
          merchantCardPrimary: "Enter Merchant Portal",
          checklistEyebrow: "Implementation Path",
          checklistTitle: "Go-live governance and onboarding process",
          nextSteps: [
            "Complete platform initialization first by maintaining only platform-scoped settings in `.env`, including PostgreSQL, gateway domain, data encryption, and administrator bootstrap credentials.",
            "Keep merchant payment credentials out of the platform environment. Official Alipay and WeChat Pay parameters must be isolated within each merchant's own channel instance.",
            "After database initialization and application deployment, enable callback and finance workers as required so that transaction state transitions, notification delivery, and settlement processing run as a complete operational chain.",
            "Merchants should enter through the unified portal to configure official channel instances. NovaPay generates upstream callback URLs, gateway addresses, and required system fields automatically, so `notifyUrl` should not be submitted manually.",
            "Use the REST-style specifications in `/docs` as the delivery baseline. After at least one merchant channel instance is enabled, complete the final payment test in the merchant portal before onboarding real traffic.",
          ],
          foundation: [
            {
              title: "Core payment model",
              description:
                "Defines the core domain around merchants, channel instances, orders, routing bindings, and callback records to support multi-merchant transaction processing and operational control.",
            },
            {
              title: "Service health verification",
              description:
                "Provides `/api/health` as a platform readiness probe for validating database connectivity and baseline service availability.",
            },
            {
              title: "Delivery preparation",
              description:
                "Includes PostgreSQL 16 deployment assets, a platform-scoped `.env.example`, and Prisma operational scripts for repeatable environment initialization and delivery.",
            },
            {
              title: "Payment integration",
              description:
                "Supports Alipay Web and WeChat Pay Native for official redirect and QR-code payment scenarios.",
            },
            {
              title: "Merchant service portal",
              description:
                "Provides merchants with a unified workspace for channel configuration, callback governance, signing secret maintenance, and API credential management.",
            },
            {
              title: "Callback processing",
              description:
                "Executes unified post-payment state transitions and callback delivery records with traceable retry visibility.",
            },
          ],
        }
      : {
          badge: "NovaPay 企业级支付基础设施",
          titleLead: "面向平台化运营的",
          titleAccent: "企业级多商户支付基础设施",
          intro:
            "NovaPay 面向正式业务场景提供统一的支付基础设施能力，覆盖商户接入、通道治理、请求鉴权、回调编排与财务数据沉淀，可作为企业建设多商户支付运营平台的底座。",
          docsButton: "查看接入文档",
          merchantEntryButton: "商户登录/注册",
          readinessTitle: "运行基线",
          appLayer: "接入层",
          appLayerDesc:
            "承载商户门户、支付请求入口、回调接收与运营管理等对外服务能力，满足统一接入与流程管控需求。",
          dataLayer: "交易数据层",
          dataLayerDesc:
            "依托 Prisma 7 与 PostgreSQL 16 建立一致的交易模型、财务快照与审计数据基础，支撑后续运营分析与合规留痕。",
          extensionLayer: "通道治理层",
          extensionLayerDesc:
            "支持商户独立通道实例、默认路由与扩展能力编排，适配后续新增官方通道或聚合支付产品。",
          foundationEyebrow: "平台能力",
          channelsEyebrow: "支付通道",
          channelsTitle: "当前交付范围",
          channelsDesc:
            "当前版本已完成支付宝电脑网站支付与微信 Native 支付能力建设，支持真实下单、回调验签、商户级参数隔离与支付测试。",
          statusReady: "已交付",
          statusPlanned: "可扩展",
          statusManaged: "商户独立管理",
          docsCardEyebrow: "接入文档",
          docsCardTitle: "统一接口与接入文档",
          docsCardDesc:
            "平台内置 `/docs` 与 `/api/openapi`，用于提供标准化接口定义、签名说明、回调约束与联调示例，方便技术团队快速完成接入实施。",
          docsCardButton: "查看接口文档",
          merchantCardEyebrow: "商户服务",
          merchantCardTitle: "商户服务门户",
          merchantCardDesc:
            "提供商户统一访问入口，用于账号登录、支付通道配置、业务回调治理、API 凭证管理与支付测试。",
          merchantCardPrimary: "进入商户门户",
          checklistEyebrow: "实施路径",
          checklistTitle: "上线治理与接入流程",
          nextSteps: [
            "先完成平台级初始化配置，只在 `.env` 中维护数据库、网关域名、数据加密密钥与管理员初始账号等平台参数，为正式部署建立统一运行基线。",
            "商户支付参数按商户维度独立隔离。支付宝、微信支付等官方通道参数应录入各自商户通道实例，不再通过平台环境变量集中维护。",
            "完成数据库初始化与应用部署后，按需启用回调与财务处理 worker，确保交易状态流转、通知投递与结算处理链路具备完整运行能力。",
            "商户通过统一门户登录后，即可在商户后台配置官方通道实例。上游回调地址、网关地址及必要系统参数由平台自动生成，无需人工填写 `notifyUrl`。",
            "联调阶段统一以 `/docs` 中的 REST 风格接口与签名规范为准；至少启用一个商户通道实例后，可在商户后台发起最终支付测试，再推进真实业务接入。",
          ],
          foundation: [
            {
              title: "支付核心模型",
              description:
                "围绕商户、通道实例、订单、路由绑定与回调记录建立统一领域模型，为多商户交易处理与运营控制提供结构化基础。",
            },
            {
              title: "服务健康验证",
              description:
                "提供 `/api/health` 作为平台运行探针，用于验证数据库连通性与基础服务状态，便于部署巡检与环境验收。",
            },
            {
              title: "交付准备能力",
              description:
                "提供 PostgreSQL 16 部署资源、平台级 `.env.example` 样例与 Prisma 运维脚本，便于实施团队完成环境初始化、迁移与交付部署。",
            },
            {
              title: "支付能力接入",
              description:
                "当前覆盖支付宝电脑网站支付与微信 Native 扫码支付，适配跳转支付与二维码支付两类主流官方收款场景。",
            },
            {
              title: "商户服务门户",
              description:
                "提供统一商户门户，用于维护通道实例、业务回调、签名密钥与 API 凭证，支撑商户独立接入与后续自助运维。",
            },
            {
              title: "回调处理机制",
              description:
                "支付完成后执行统一状态流转、业务通知与重试留痕，确保交易通知链路具备可追踪、可审计能力。",
            },
          ],
        };

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-6 py-8 sm:px-10 lg:px-12">
      <section className="relative overflow-hidden rounded-[2rem] border border-line bg-panel-strong p-8 shadow-[var(--shadow)] sm:p-12">
        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-accent via-secondary to-accent" />
        <div className="grid gap-10 lg:grid-cols-[1.4fr_0.9fr]">
          <div className="space-y-6">
            <div className="inline-flex items-center rounded-full border border-line bg-white/60 px-4 py-2 text-xs font-semibold uppercase tracking-[0.28em] text-muted">
              {content.badge}
            </div>
            <div className="space-y-4">
              <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
                {content.titleLead}
                <span className="text-accent"> {content.titleAccent}</span>
              </h1>
              <p className="max-w-2xl text-base leading-8 text-muted sm:text-lg">{content.intro}</p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link
                href="/docs"
                className="rounded-full border border-line bg-white/85 px-5 py-3 text-sm font-medium text-foreground transition hover:border-accent/40 hover:text-accent"
              >
                {content.docsButton}
              </Link>
              <Link
                href="/merchant/login"
                className="rounded-full bg-[linear-gradient(135deg,#b66a1d,#d4872f)] px-6 py-3 text-sm font-semibold text-white shadow-[0_16px_40px_rgba(180,104,28,0.28)] transition hover:-translate-y-0.5 hover:shadow-[0_20px_50px_rgba(180,104,28,0.34)]"
              >
                {content.merchantEntryButton}
              </Link>
              {stack.map((item) => (
                <span
                  key={item}
                  className="rounded-full border border-line bg-white/70 px-4 py-2 text-sm text-foreground"
                >
                  {item}
                </span>
              ))}
            </div>
          </div>
          <div className="rounded-[1.75rem] border border-line bg-[linear-gradient(180deg,rgba(255,255,255,0.88),rgba(255,244,231,0.8))] p-6">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-muted">{content.readinessTitle}</span>
              <span className="rounded-full bg-accent-soft px-3 py-1 font-mono text-xs text-accent">
                /api/health
              </span>
            </div>
            <div className="mt-6 space-y-4">
              <div className="rounded-2xl border border-line bg-white/70 p-4">
                <p className="text-sm font-medium text-foreground">{content.appLayer}</p>
                <p className="mt-2 text-sm leading-7 text-muted">{content.appLayerDesc}</p>
              </div>
              <div className="rounded-2xl border border-line bg-white/70 p-4">
                <p className="text-sm font-medium text-foreground">{content.dataLayer}</p>
                <p className="mt-2 text-sm leading-7 text-muted">{content.dataLayerDesc}</p>
              </div>
              <div className="rounded-2xl border border-line bg-white/70 p-4">
                <p className="text-sm font-medium text-foreground">{content.extensionLayer}</p>
                <p className="mt-2 text-sm leading-7 text-muted">{content.extensionLayerDesc}</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mt-8 grid gap-6 lg:grid-cols-5">
        {content.foundation.map((item) => (
          <article
            key={item.title}
            className="rounded-[1.75rem] border border-line bg-panel p-6 shadow-[0_16px_50px_rgba(79,46,17,0.08)] backdrop-blur"
          >
            <p className="text-sm font-medium uppercase tracking-[0.2em] text-secondary">
              {content.foundationEyebrow}
            </p>
            <h2 className="mt-4 text-2xl font-semibold text-foreground">{item.title}</h2>
            <p className="mt-3 text-sm leading-7 text-muted">{item.description}</p>
          </article>
        ))}
      </section>

      <section className="mt-8 rounded-[1.75rem] border border-line bg-panel-strong p-8 shadow-[0_16px_50px_rgba(79,46,17,0.08)]">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-medium uppercase tracking-[0.2em] text-secondary">
              {content.channelsEyebrow}
            </p>
            <h2 className="mt-3 text-3xl font-semibold text-foreground">{content.channelsTitle}</h2>
          </div>
          <p className="max-w-2xl text-sm leading-7 text-muted">{content.channelsDesc}</p>
        </div>

        <div className="mt-6 grid gap-5 lg:grid-cols-2">
          {channels.map((channel) => (
            <article
              key={channel.code}
              className="rounded-[1.5rem] border border-line bg-white/70 p-6"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.24em] text-muted">
                    {channel.provider}
                  </p>
                  <h3 className="mt-2 text-2xl font-semibold text-foreground">
                    {channel.displayName}
                  </h3>
                </div>
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${
                      (channel.implementationStatus ?? "ready") === "ready"
                        ? "bg-[#dff5eb] text-[#11684f]"
                        : "bg-[#eef2ff] text-[#3658c9]"
                    }`}
                  >
                    {(channel.implementationStatus ?? "ready") === "ready"
                      ? content.statusReady
                      : content.statusPlanned}
                  </span>
                  <span
                    className="rounded-full bg-[#eef7ff] px-3 py-1 text-xs font-semibold text-[#245f9c]"
                  >
                    {content.statusManaged}
                  </span>
                </div>
              </div>
              <p className="mt-3 text-sm leading-7 text-muted">{channel.description}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <span className="rounded-full border border-line bg-white px-3 py-1 font-mono text-xs text-foreground">
                  {channel.code}
                </span>
                {channel.capabilities.map((capability) => (
                  <span
                    key={capability}
                    className="rounded-full border border-line bg-white px-3 py-1 text-xs text-muted"
                  >
                    {capability}
                  </span>
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-8 grid gap-6 lg:grid-cols-2">
        <article className="rounded-[1.75rem] border border-line bg-panel p-8 shadow-[0_16px_50px_rgba(79,46,17,0.08)]">
          <p className="text-sm uppercase tracking-[0.2em] text-secondary">
            {content.docsCardEyebrow}
          </p>
          <h2 className="mt-3 text-3xl font-semibold text-foreground">{content.docsCardTitle}</h2>
          <p className="mt-3 text-sm leading-7 text-muted">{content.docsCardDesc}</p>
          <Link
            href="/docs"
            className="mt-6 inline-flex rounded-2xl bg-foreground px-4 py-3 text-sm font-medium text-white"
          >
            {content.docsCardButton}
          </Link>
        </article>

        <article className="rounded-[1.75rem] border border-line bg-panel p-8 shadow-[0_16px_50px_rgba(79,46,17,0.08)]">
          <p className="text-sm uppercase tracking-[0.2em] text-secondary">
            {content.merchantCardEyebrow}
          </p>
          <h2 className="mt-3 text-3xl font-semibold text-foreground">{content.merchantCardTitle}</h2>
          <p className="mt-3 text-sm leading-7 text-muted">{content.merchantCardDesc}</p>
          <Link
            href="/merchant/login"
            className="mt-6 inline-flex rounded-2xl bg-[linear-gradient(135deg,#b66a1d,#d4872f)] px-5 py-3 text-sm font-semibold text-white shadow-[0_18px_42px_rgba(180,104,28,0.28)] transition hover:-translate-y-0.5 hover:shadow-[0_22px_52px_rgba(180,104,28,0.34)]"
          >
            {content.merchantCardPrimary}
          </Link>
        </article>
      </section>

      <section className="mt-8 rounded-[1.75rem] border border-line bg-[#1e1812] p-8 text-[#f7efe5] shadow-[0_20px_70px_rgba(20,15,10,0.32)]">
        <div className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr]">
          <div>
            <p className="text-sm uppercase tracking-[0.2em] text-[#d9c4ae]">
              {content.checklistEyebrow}
            </p>
            <h2 className="mt-4 text-3xl font-semibold">{content.checklistTitle}</h2>
          </div>
          <div className="space-y-3">
            {content.nextSteps.map((item, index) => (
              <div
                key={item}
                className="flex gap-4 rounded-2xl border border-white/10 bg-white/5 p-4"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/10 font-mono text-sm">
                  0{index + 1}
                </span>
                <p className="text-sm leading-7 text-[#efe2d3]">{item}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
