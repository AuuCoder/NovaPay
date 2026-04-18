import Link from "next/link";
import type { ReactNode } from "react";
import { logoutMerchantAction } from "@/app/merchant/actions";
import { MerchantNav, type MerchantNavItem } from "@/app/merchant/nav";
import { getCurrentLocale } from "@/lib/i18n-server";
import { getMerchantWorkspaceName } from "@/lib/merchant-profile-completion";
import { hasMerchantPermission } from "@/lib/merchant-rbac";
import { getMerchantDisplayRole, requireMerchantSession } from "@/lib/merchant-session";

export default async function MerchantConsoleLayout({
  children,
}: {
  children: ReactNode;
}) {
  const session = await requireMerchantSession();
  const locale = await getCurrentLocale();
  const merchantDisplayName = getMerchantWorkspaceName(
    session.merchantUser.merchant.name,
    locale,
  );
  const content =
    locale === "en"
      ? {
          overviewLabel: "Overview",
          overviewHomeLabel: "Executive Summary",
          overviewHomeDetail: "View merchant readiness, metrics, and recent transaction snapshots",
          overviewIntegrationLabel: "Integration",
          overviewIntegrationDetail: "Copy NoveShop merchant-backend fields and API endpoints",
          overviewProfileLabel: "Merchant Profile",
          overviewProfileDetail: "Maintain merchant identity, callback, and security settings",
          overviewCredentialsLabel: "API Credentials",
          overviewCredentialsDetail: "Create credentials and save one-time Secrets securely",
          channelsLabel: "Channels",
          ordersLabel: "Orders",
          refundsLabel: "Refunds",
          overviewDetail: "Open summary view and jump into dedicated merchant operation pages",
          channelsDetail: "Configure payment channels and obtain dedicated upstream callback endpoints",
          ordersDetail: "Review merchant orders and synchronize transaction status",
          refundsDetail: "Initiate refunds and track refund outcomes",
          title: "Merchant Console",
          intro:
            "Merchants can maintain payment credentials, business callback configuration, signing secrets, and transaction data within a dedicated operations workspace.",
          docs: "API Docs",
          logout: "Sign Out",
        }
      : {
          overviewLabel: "商户总览",
          overviewHomeLabel: "摘要总览",
          overviewHomeDetail: "查看接入状态、核心指标与近期交易摘要",
          overviewIntegrationLabel: "接入参数",
          overviewIntegrationDetail: "复制 NoveShop 商户后台配置与接口地址",
          overviewProfileLabel: "商户配置",
          overviewProfileDetail: "维护商户资料、业务回调与安全参数",
          overviewCredentialsLabel: "API 凭证",
          overviewCredentialsDetail: "创建凭证并保存一次性 Secret",
          channelsLabel: "支付通道",
          ordersLabel: "我的订单",
          refundsLabel: "退款管理",
          overviewDetail: "打开摘要页，并进入独立的商户配置子页面。",
          channelsDetail: "录入支付参数并获取专属上游回调地址。",
          ordersDetail: "查看当前商户订单，支持同步状态与关单。",
          refundsDetail: "发起退款并跟踪退款结果。",
          title: "商户控制台",
          intro: "商户可在独立工作台中维护支付参数、业务回调配置、接口密钥及交易数据，满足日常运营与接入管理需要。",
          docs: "API 文档",
          logout: "退出登录",
        };
  const navItems: MerchantNavItem[] = [
    {
      href: "/merchant",
      label: content.overviewLabel,
      detail: content.overviewDetail,
      matchPaths: [
        "/merchant/integration",
        "/merchant/profile",
        "/merchant/credentials",
      ],
      children: [
        {
          href: "/merchant",
          label: content.overviewHomeLabel,
          detail: content.overviewHomeDetail,
        },
        {
          href: "/merchant/integration",
          label: content.overviewIntegrationLabel,
          detail: content.overviewIntegrationDetail,
        },
        {
          href: "/merchant/profile",
          label: content.overviewProfileLabel,
          detail: content.overviewProfileDetail,
        },
        {
          href: "/merchant/credentials",
          label: content.overviewCredentialsLabel,
          detail: content.overviewCredentialsDetail,
        },
      ],
    },
    ...(hasMerchantPermission(session.merchantUser.role, "channel:read")
      ? [
          {
            href: "/merchant/channels",
            label: content.channelsLabel,
            detail: content.channelsDetail,
          },
        ]
      : []),
    ...(hasMerchantPermission(session.merchantUser.role, "order:read")
      ? [
          {
            href: "/merchant/orders",
            label: content.ordersLabel,
            detail: content.ordersDetail,
          },
        ]
      : []),
    ...(hasMerchantPermission(session.merchantUser.role, "refund:read")
      ? [
          {
            href: "/merchant/refunds",
            label: content.refundsLabel,
            detail: content.refundsDetail,
          },
        ]
      : []),
  ];

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[1600px] flex-col px-4 py-4 sm:px-6 lg:px-8">
      <div className="grid min-h-[calc(100vh-2rem)] gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="rounded-[2rem] border border-line bg-[#1f1812] p-6 text-[#f8efe6] shadow-[0_22px_80px_rgba(20,15,10,0.26)]">
          <Link
            href="/"
            className="inline-flex items-center rounded-full border border-white/10 px-3 py-1 text-xs uppercase tracking-[0.28em] text-[#dac7b3]"
          >
            NovaPay
          </Link>
          <h1 className="mt-5 text-3xl font-semibold">{content.title}</h1>
          <p className="mt-3 text-sm leading-7 text-[#e9dccd]">{content.intro}</p>

          <div className="mt-6 rounded-[1.5rem] border border-white/10 bg-white/5 p-4">
            <p className="text-sm font-medium text-white">{merchantDisplayName}</p>
            <div className="mt-4 border-t border-white/10 pt-4">
              <p className="text-sm text-white">{session.merchantUser.name}</p>
              <p className="mt-1 text-xs text-[#dac7b3]">{session.merchantUser.email}</p>
              <p className="mt-2 inline-flex rounded-full border border-white/10 px-3 py-1 text-xs text-[#f3dfcb]">
                {getMerchantDisplayRole(session.merchantUser.role)}
              </p>
            </div>
          </div>

          <div className="mt-8">
            <MerchantNav items={navItems} />
          </div>

          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/docs"
              className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-medium text-white"
            >
              {content.docs}
            </Link>
            <form action={logoutMerchantAction}>
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
