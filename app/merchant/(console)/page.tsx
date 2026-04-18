import Link from "next/link";
import {
  formatDateTime,
  formatMoney,
  getCallbackStatusLabel,
  getCallbackStatusTone,
  getMerchantStatusLabel,
  getMerchantStatusTone,
  getPaymentStatusLabel,
  getPaymentStatusTone,
  getRefundStatusLabel,
  type SearchParamsInput,
} from "@/app/admin/support";
import {
  AdminPageHeader,
  FlashMessage,
  StatCard,
  StatusBadge,
  buttonClass,
  panelClass,
  subtleButtonClass,
  tableWrapperClass,
} from "@/app/admin/ui";
import {
  dismissMerchantCredentialRevealAction,
  runMerchantCheckoutSmokeTestAction,
} from "@/app/merchant/actions";
import {
  CopyFieldList,
  type CopyFieldItem,
} from "@/app/merchant/copy-field-list";
import { loadMerchantDashboardData } from "@/app/merchant/(console)/dashboard-data";
import { getCurrentLocale } from "@/lib/i18n-server";

export default async function MerchantDashboardPage({
  searchParams,
}: {
  searchParams?: SearchParamsInput;
}) {
  const locale = await getCurrentLocale();
  const {
    messages,
    credentialReveal,
    merchant,
    merchantDisplayName,
    successfulRefunds,
    totalPaidAmount,
    totalRefundAmount,
    activeCredentialCount,
    activeChannelAccountCount,
    successRate,
    canReadChannels,
    canReadOrders,
    canReadRefunds,
    profileMissingFields,
    isProfileComplete,
    hasConfiguredBusinessCallback,
    hasEnabledChannelAccount,
    checkoutTestChannels,
  } = await loadMerchantDashboardData(searchParams, { locale });

  const content =
    locale === "en"
      ? {
          headerEyebrow: "Merchant Overview",
          headerDesc:
            "This page is now the executive summary for the merchant workspace. Detailed integration, profile, and credential operations are separated into dedicated pages on the left navigation.",
          integration: "Integration",
          profile: "Merchant Profile",
          credentials: "API Credentials",
          channels: "Channels",
          orders: "Orders",
          refunds: "Refunds",
          docs: "API Docs",
          smokeTest: "Run Payment Test",
          smokeTestAlipay: "Test Alipay",
          smokeTestWxpay: "Test WeChat Pay",
          credentialRevealTitle: "Save this API credential now",
          credentialRevealBootstrapDesc:
            "NovaPay generated the first API credential automatically during registration. The Secret is shown only within this short secure session window.",
          credentialRevealManualDesc:
            "The new API credential is ready. Save the Secret now and use it only in your server-side integration.",
          credentialRevealKeyId: "Key ID",
          credentialRevealSecret: "Secret",
          credentialRevealHint:
            "Store it in a secure secret manager. After this window closes, only the masked preview remains in the console.",
          credentialRevealDismiss: "I have saved it",
          workstreamsEyebrow: "Workspace",
          workstreamsTitle: "Use dedicated pages for each operation",
          workstreamsDesc:
            "The left navigation now separates merchant work into focused pages so operators do not need to scan one oversized dashboard.",
          workstreams: [
            {
              href: "/merchant/integration",
              title: "Integration",
              desc: "Copy the fields required by NoveShop and review API endpoints.",
            },
            {
              href: "/merchant/profile",
              title: "Merchant Profile",
              desc: "Maintain merchant identity, callback settings, and security parameters.",
            },
            {
              href: "/merchant/credentials",
              title: "API Credentials",
              desc: "Create dedicated keys, save one-time Secrets, and manage credential status.",
            },
            {
              href: "/merchant/channels",
              title: "Channels",
              desc: "Configure payment channels, defaults, and upstream callback endpoints.",
            },
          ],
          readyStatus: "Ready",
          pendingStatus: "Pending",
          optionalStatus: "Optional",
          statStatus: "Status",
          statStatusDetail: "Current merchant review status",
          statOrders: "Orders",
          statOrdersDetail: "Total orders under this merchant",
          statChannels: "Channels",
          statChannelsDetail: `Enabled ${activeChannelAccountCount} instances`,
          statApiKeys: "API Keys",
          statApiKeysDetail: "Available dedicated API credentials",
          statSuccessRate: "Success Rate",
          statSuccessRateDetail: "Payment success rate for this merchant",
          statGmv: "GMV",
          statGmvDetail: "Successful transaction amount",
          statRefunds: "Refunds",
          statRefundsDetail: `Successful refund amount ${formatMoney(totalRefundAmount._sum.amount?.toString() ?? 0, "CNY", locale)}`,
          statNet: "Net Amount",
          statNetDetail: "Net amount after successful payments and refunds",
          operationalEyebrow: "Readiness",
          operationalTitle: "Current operating snapshot",
          operationalDesc:
            "These cards tell the merchant what is already ready and which dedicated page to visit next.",
          operationalCards: [
            {
              title: "Integration handoff",
              status: activeCredentialCount > 0 ? "ready" : "pending",
              desc:
                activeCredentialCount > 0
                  ? "API credentials are already available. Go to the integration page to copy the NoveShop backend fields."
                  : "No active API credential is available yet. Create one first before server-side integration starts.",
              href: "/merchant/integration",
            },
            {
              title: "Merchant profile",
              status: isProfileComplete ? "ready" : "optional",
              desc: isProfileComplete
                ? "Merchant profile fields required by official channels are already complete."
                : "You can defer profile completion until official regulated channels such as Alipay or WeChat Pay are needed.",
              href: "/merchant/profile",
            },
            {
              title: "Payment channels",
              status: hasEnabledChannelAccount ? "ready" : "pending",
              desc: hasEnabledChannelAccount
                ? "At least one merchant-owned payment channel instance is already enabled."
                : "No enabled merchant-owned payment channel instance is available yet.",
              href: "/merchant/channels",
            },
            {
              title: "Business callback",
              status: hasConfiguredBusinessCallback ? "ready" : "optional",
              desc: hasConfiguredBusinessCallback
                ? "A merchant business callback URL is already configured."
                : "Business callbacks can stay blank until your backend needs asynchronous notifications.",
              href: "/merchant/profile",
            },
          ],
          profileIncompleteTitle: "Additional profile is required for regulated channels",
          profileIncompleteDesc:
            "If you plan to enable official regulated channels such as Alipay or WeChat Pay, complete the following fields first.",
          profileIncompleteFields: "Missing fields",
          profileIncompleteHint:
            "Lower-risk channels can stay lightweight later, but regulated official channels will enforce these fields before activation.",
          pendingApproval:
            "This merchant workspace is not currently allowed to create new orders. Resume access after the merchant status returns to approved.",
          reviewNote: "Platform Note",
          recentOrdersEyebrow: "Recent Orders",
          recentOrdersTitle: "Recent orders",
          recentOrdersDesc:
            "This summary shows only the latest 10 orders. Use the full order list for filters and paging.",
          recentOrdersButton: "Open Full Order List",
          noOrders:
            "No order records yet. Orders will appear here after the integration starts sending traffic.",
          orderIdCol: "Order ID",
          amountCol: "Amount",
          channelCol: "Channel",
          paymentStatusCol: "Payment Status",
          callbackStatusCol: "Business Callback",
          timeCol: "Time",
          createdPrefix: "Created",
          paidPrefix: "Paid",
          recentRefundsEyebrow: "Recent Refunds",
          recentRefundsTitle: "Recent refunds",
          recentRefundsDesc:
            "This summary shows only the latest 10 refunds. Use refund management for complete search and paging.",
          recentRefundsButton: "Open Refund Management",
          noRefunds:
            "No refund records yet. Refund requests and sync status will appear here.",
          refundIdCol: "Refund ID",
          relatedOrderCol: "Related Order",
          refundStatusCol: "Status",
          providerPending: "Awaiting provider result",
          refundCreatedPrefix: "Created",
          refundedPrefix: "Refunded",
        }
      : {
          headerEyebrow: "商户总揽",
          headerDesc:
            "当前页面只保留商户工作台摘要信息，接入参数、商户配置和 API 凭证已经拆分到左侧子路由中，避免所有内容堆在同一页。",
          integration: "接入参数",
          profile: "商户配置",
          credentials: "API 凭证",
          channels: "支付通道",
          orders: "订单列表",
          refunds: "退款管理",
          docs: "API 文档",
          smokeTest: "支付测试",
          smokeTestAlipay: "支付宝测试",
          smokeTestWxpay: "微信支付测试",
          credentialRevealTitle: "请立即保存这组 API 凭证",
          credentialRevealBootstrapDesc:
            "系统已在注册时自动生成首个 API 凭证。Secret 只会在当前这段安全展示窗口内显示一次。",
          credentialRevealManualDesc:
            "新的 API 凭证已经生成。请立即保存 Secret，并仅交给服务端接入使用。",
          credentialRevealKeyId: "Key ID",
          credentialRevealSecret: "Secret",
          credentialRevealHint:
            "建议立即保存到企业密钥管理系统。当前窗口结束后，后台只会保留脱敏预览，不再显示完整 Secret。",
          credentialRevealDismiss: "我已保存",
          workstreamsEyebrow: "工作区",
          workstreamsTitle: "按功能进入独立页面处理",
          workstreamsDesc:
            "左侧导航已经拆分成独立子页面，商户不需要再在一个超长页面里寻找接入配置和凭证管理入口。",
          workstreams: [
            {
              href: "/merchant/integration",
              title: "接入参数",
              desc: "复制 NoveShop 商户后台需要填写的字段，并查看 API 地址与签名要求。",
            },
            {
              href: "/merchant/profile",
              title: "商户配置",
              desc: "维护商户资料、业务回调和安全参数。",
            },
            {
              href: "/merchant/credentials",
              title: "API 凭证",
              desc: "创建独立凭证、保存一次性 Secret，并管理凭证启停状态。",
            },
            {
              href: "/merchant/channels",
              title: "支付通道",
              desc: "配置支付通道实例、默认路由与上游回调地址。",
            },
          ],
          readyStatus: "已就绪",
          pendingStatus: "待处理",
          optionalStatus: "可后配",
          statStatus: "状态",
          statStatusDetail: "商户当前审核状态",
          statOrders: "订单数",
          statOrdersDetail: "当前商户累计订单数",
          statChannels: "通道实例",
          statChannelsDetail: `已启用 ${activeChannelAccountCount} 个实例`,
          statApiKeys: "API 凭证",
          statApiKeysDetail: "当前可用的独立 API 凭证数量",
          statSuccessRate: "成功率",
          statSuccessRateDetail: "当前商户支付成功率",
          statGmv: "交易总额",
          statGmvDetail: "当前商户成功交易金额",
          statRefunds: "退款数",
          statRefundsDetail: `成功退款金额 ${formatMoney(totalRefundAmount._sum.amount?.toString() ?? 0, "CNY", locale)}`,
          statNet: "净额",
          statNetDetail: "成功收款减退款后的净额",
          operationalEyebrow: "准备情况",
          operationalTitle: "当前接入状态总览",
          operationalDesc: "下面这些卡片用来快速判断当前哪些能力已经准备好，以及下一步该进入哪个独立页面。",
          operationalCards: [
            {
              title: "接入交付",
              status: activeCredentialCount > 0 ? "ready" : "pending",
              desc:
                activeCredentialCount > 0
                  ? "当前已经存在可用 API 凭证，可直接前往接入参数页复制 NoveShop 后台配置字段。"
                  : "当前还没有可用 API 凭证。请先创建凭证，再开始服务端联调。",
              href: "/merchant/integration",
            },
            {
              title: "商户资料",
              status: isProfileComplete ? "ready" : "optional",
              desc: isProfileComplete
                ? "官方通道要求的核心资料已补齐。"
                : "如果暂时不启用支付宝、微信等官方高合规通道，商户资料可以后续再补。",
              href: "/merchant/profile",
            },
            {
              title: "支付通道",
              status: hasEnabledChannelAccount ? "ready" : "pending",
              desc: hasEnabledChannelAccount
                ? "当前至少已有一个启用中的商户自有支付通道实例。"
                : "当前还没有启用中的商户自有支付通道实例。",
              href: "/merchant/channels",
            },
            {
              title: "业务回调",
              status: hasConfiguredBusinessCallback ? "ready" : "optional",
              desc: hasConfiguredBusinessCallback
                ? "默认业务回调地址已配置完成。"
                : "如果你的业务系统暂时不需要异步通知，业务回调可以先留空。",
              href: "/merchant/profile",
            },
          ],
          profileIncompleteTitle: "官方通道资料待补齐",
          profileIncompleteDesc:
            "如果你计划启用支付宝、微信支付等高合规官方通道，请先补齐以下商户主体资料。",
          profileIncompleteFields: "待补充字段",
          profileIncompleteHint:
            "后续新增的低风险通道可以保持轻量接入，但高合规官方通道会在启用前强制校验这些字段。",
          pendingApproval:
            "当前商户暂未开放新订单创建能力。恢复为通过状态后，才可继续发起支付订单。",
          reviewNote: "平台备注",
          recentOrdersEyebrow: "最近订单",
          recentOrdersTitle: "最近订单",
          recentOrdersDesc: "这里仅展示最近 10 笔订单摘要，完整筛选与翻页请进入订单列表。",
          recentOrdersButton: "打开完整订单列表",
          noOrders: "还没有订单记录，完成接入后这里会出现该商户的支付订单。",
          orderIdCol: "订单号",
          amountCol: "金额",
          channelCol: "通道",
          paymentStatusCol: "支付状态",
          callbackStatusCol: "业务回调",
          timeCol: "时间",
          createdPrefix: "创建",
          paidPrefix: "支付",
          recentRefundsEyebrow: "最近退款",
          recentRefundsTitle: "最近退款",
          recentRefundsDesc: "这里仅展示最近 10 笔退款摘要，完整检索与翻页请进入退款管理。",
          recentRefundsButton: "打开退款管理",
          noRefunds: "还没有退款记录，退款申请与同步状态会显示在这里。",
          refundIdCol: "退款单号",
          relatedOrderCol: "关联订单",
          refundStatusCol: "状态",
          providerPending: "等待平台返回",
          refundCreatedPrefix: "创建",
          refundedPrefix: "退款",
        };

  const actionButtonClass = `${buttonClass} w-full sm:w-auto`;
  const activeCredentialReveal =
    credentialReveal && credentialReveal.source !== "reauth" ? credentialReveal : null;
  const revealCopyItems: CopyFieldItem[] = [
    {
      id: "credential-reveal-key-id",
      label: content.credentialRevealKeyId,
      value: activeCredentialReveal?.keyId ?? "",
    },
    {
      id: "credential-reveal-secret",
      label: content.credentialRevealSecret,
      value: activeCredentialReveal?.secret ?? "",
      secret: true,
      multiline: true,
    },
  ];
  const revealCopyAllValue = revealCopyItems
    .filter((item) => item.value?.trim())
    .map((item) => `${item.label}${locale === "en" ? ": " : "："}${item.value?.trim()}`)
    .join("\n\n");
  function getCheckoutLabel(channelCode: string) {
    return channelCode === "wxpay.native"
      ? content.smokeTestWxpay
      : content.smokeTestAlipay;
  }

  return (
    <div className="space-y-8">
      <AdminPageHeader
        eyebrow={content.headerEyebrow}
        title={merchantDisplayName}
        description={content.headerDesc}
        actions={
          <div className="grid w-full gap-3 sm:flex sm:flex-wrap sm:justify-end">
            {checkoutTestChannels.length > 0 ? (
              checkoutTestChannels.map((channel) => (
                <form key={channel.code} action={runMerchantCheckoutSmokeTestAction}>
                  <input type="hidden" name="channelCode" value={channel.code} />
                  <button type="submit" className={actionButtonClass}>
                    {getCheckoutLabel(channel.code)}
                  </button>
                </form>
              ))
            ) : (
              <form action={runMerchantCheckoutSmokeTestAction}>
                <button type="submit" className={actionButtonClass}>
                  {content.smokeTest}
                </button>
              </form>
            )}
            <Link href="/merchant/integration" className={actionButtonClass}>
              {content.integration}
            </Link>
            <Link href="/merchant/profile" className={actionButtonClass}>
              {content.profile}
            </Link>
            <Link href="/merchant/credentials" className={actionButtonClass}>
              {content.credentials}
            </Link>
            {canReadChannels ? (
              <Link href="/merchant/channels" className={actionButtonClass}>
                {content.channels}
              </Link>
            ) : null}
            {canReadOrders ? (
              <Link href="/merchant/orders" className={actionButtonClass}>
                {content.orders}
              </Link>
            ) : null}
            {canReadRefunds ? (
              <Link href="/merchant/refunds" className={actionButtonClass}>
                {content.refunds}
              </Link>
            ) : null}
            <Link href="/docs" className={actionButtonClass}>
              {content.docs}
            </Link>
          </div>
        }
      />

      <FlashMessage success={messages.success} error={messages.error} />

      {activeCredentialReveal ? (
        <section className="rounded-[1.75rem] border border-[#c9dfd5] bg-[linear-gradient(135deg,#f3fbf7_0%,#eef7ff_100%)] p-5 shadow-[0_18px_50px_rgba(29,87,70,0.08)] sm:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-3xl">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#1d5746]">
                {content.credentialRevealTitle}
              </p>
              <p className="mt-3 text-sm leading-7 text-[#335f52]">
                {activeCredentialReveal.source === "bootstrap"
                  ? content.credentialRevealBootstrapDesc
                  : content.credentialRevealManualDesc}
              </p>
              <p className="mt-2 text-xs leading-6 text-[#4b6d62]">
                {content.credentialRevealHint}
              </p>
            </div>
            <form action={dismissMerchantCredentialRevealAction}>
              <input type="hidden" name="redirectTo" value="/merchant" />
              <button type="submit" className={subtleButtonClass}>
                {content.credentialRevealDismiss}
              </button>
            </form>
          </div>
          <div className="mt-5">
            <CopyFieldList
              locale={locale}
              items={revealCopyItems}
              copyAllValue={revealCopyAllValue}
            />
          </div>
        </section>
      ) : null}

      <section className={`${panelClass} p-5 sm:p-6`}>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.22em] text-muted">
              {content.workstreamsEyebrow}
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-foreground">
              {content.workstreamsTitle}
            </h2>
          </div>
          <p className="max-w-3xl text-sm leading-7 text-muted">
            {content.workstreamsDesc}
          </p>
        </div>
        <div className="mt-6 grid gap-4 xl:grid-cols-4">
          {content.workstreams
            .filter((item) => {
              if (item.href === "/merchant/channels") {
                return canReadChannels;
              }
              return true;
            })
            .map((item) => (
              <article
                key={item.href}
                className="rounded-[1.25rem] border border-line bg-white/80 p-4"
              >
                <h3 className="text-base font-semibold text-foreground">{item.title}</h3>
                <p className="mt-3 text-sm leading-7 text-muted">{item.desc}</p>
                <div className="mt-4">
                  <Link href={item.href} className={subtleButtonClass}>
                    {item.title}
                  </Link>
                </div>
              </article>
            ))}
        </div>
      </section>

      <section className={`${panelClass} p-5 sm:p-6`}>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.22em] text-muted">
              {content.operationalEyebrow}
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-foreground">
              {content.operationalTitle}
            </h2>
          </div>
          <p className="max-w-3xl text-sm leading-7 text-muted">
            {content.operationalDesc}
          </p>
        </div>
        <div className="mt-6 grid gap-4 xl:grid-cols-4">
          {content.operationalCards
            .filter((item) => {
              if (item.href === "/merchant/channels") {
                return canReadChannels;
              }
              return true;
            })
            .map((item) => (
            <article
              key={item.href}
              className="rounded-[1.25rem] border border-line bg-white/80 p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <h3 className="text-base font-semibold text-foreground">{item.title}</h3>
                <StatusBadge
                  tone={
                    item.status === "ready"
                      ? "success"
                      : item.status === "pending"
                        ? "warning"
                        : "neutral"
                  }
                >
                  {item.status === "ready"
                    ? content.readyStatus
                    : item.status === "pending"
                      ? content.pendingStatus
                      : content.optionalStatus}
                </StatusBadge>
              </div>
              <p className="mt-3 text-sm leading-7 text-muted">{item.desc}</p>
              <div className="mt-4">
                <Link href={item.href} className={subtleButtonClass}>
                  {item.title}
                </Link>
              </div>
            </article>
          ))}
        </div>
      </section>

      {!isProfileComplete ? (
        <section className="rounded-[1.5rem] border border-[#f3d1ab] bg-[#fff4e7] p-5 text-sm text-[#8a4d18]">
          <div className="flex flex-wrap items-center gap-3">
            <StatusBadge tone="warning">{content.profileIncompleteTitle}</StatusBadge>
            <span>{content.profileIncompleteDesc}</span>
          </div>
          <p className="mt-3 leading-7">
            {content.profileIncompleteFields}
            {locale === "en" ? ": " : "："}
            {profileMissingFields.join(locale === "en" ? ", " : "、")}
          </p>
          <p className="mt-2 leading-7">{content.profileIncompleteHint}</p>
        </section>
      ) : null}

      {merchant.status !== "APPROVED" ? (
        <section className="rounded-[1.5rem] border border-[#f3d1ab] bg-[#fff4e7] p-5 text-sm text-[#8a4d18]">
          <div className="flex flex-wrap items-center gap-3">
            <StatusBadge tone={getMerchantStatusTone(merchant.status)}>
              {getMerchantStatusLabel(merchant.status, locale)}
            </StatusBadge>
            <span>{content.pendingApproval}</span>
          </div>
          {merchant.reviewNote ? (
            <p className="mt-3 leading-7">
              {content.reviewNote}
              {locale === "en" ? ": " : "："}
              {merchant.reviewNote}
            </p>
          ) : null}
        </section>
      ) : null}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-8">
        <StatCard
          label={content.statStatus}
          value={getMerchantStatusLabel(merchant.status, locale)}
          detail={content.statStatusDetail}
        />
        <StatCard label={content.statOrders} value={merchant._count.paymentOrders} detail={content.statOrdersDetail} />
        <StatCard
          label={content.statChannels}
          value={activeChannelAccountCount}
          detail={content.statChannelsDetail}
        />
        <StatCard
          label={content.statApiKeys}
          value={activeCredentialCount}
          detail={content.statApiKeysDetail}
        />
        <StatCard label={content.statSuccessRate} value={successRate} detail={content.statSuccessRateDetail} />
        <StatCard
          label={content.statGmv}
          value={formatMoney(totalPaidAmount._sum.amount?.toString() ?? 0, "CNY", locale)}
          detail={content.statGmvDetail}
        />
        <StatCard label={content.statRefunds} value={successfulRefunds} detail={content.statRefundsDetail} />
        <StatCard
          label={content.statNet}
          value={formatMoney(
            Number(totalPaidAmount._sum.amount?.toString() ?? 0) -
              Number(totalRefundAmount._sum.amount?.toString() ?? 0),
            "CNY",
            locale,
          )}
          detail={content.statNetDetail}
        />
      </section>

      {canReadOrders ? (
        <section className={`${panelClass} min-w-0 p-5 sm:p-6`}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.22em] text-muted">
              {content.recentOrdersEyebrow}
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-foreground">
              {content.recentOrdersTitle}
            </h2>
          </div>
          <div className="flex flex-col gap-3 sm:items-end">
            <p className="max-w-xl text-sm leading-7 text-muted">
              {content.recentOrdersDesc}
            </p>
            <Link href="/merchant/orders" className={subtleButtonClass}>
              {content.recentOrdersButton}
            </Link>
          </div>
        </div>

        {merchant.paymentOrders.length === 0 ? (
          <div className="mt-6 rounded-[1.25rem] border border-dashed border-line p-6 text-center text-sm leading-7 text-muted">
            {content.noOrders}
          </div>
        ) : (
          <div className={`mt-6 ${tableWrapperClass}`}>
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-[#f3e7d7] text-xs uppercase tracking-[0.18em] text-muted">
                  <tr>
                    <th className="px-4 py-3">{content.orderIdCol}</th>
                    <th className="px-4 py-3">{content.channelCol}</th>
                    <th className="px-4 py-3">{content.amountCol}</th>
                    <th className="px-4 py-3">{content.paymentStatusCol}</th>
                    <th className="px-4 py-3">{content.callbackStatusCol}</th>
                    <th className="px-4 py-3">{content.timeCol}</th>
                  </tr>
                </thead>
                <tbody>
                  {merchant.paymentOrders.map((order) => (
                    <tr key={order.id} className="border-t border-line/70">
                      <td className="px-4 py-4">
                        <p className="font-medium text-foreground">{order.externalOrderId}</p>
                        <p className="mt-1 font-mono text-xs text-muted">{order.id}</p>
                      </td>
                      <td className="px-4 py-4 font-mono text-xs text-foreground">
                        {order.channelCode}
                      </td>
                      <td className="px-4 py-4 text-sm text-foreground">
                        {formatMoney(order.amount.toString(), "CNY", locale)}
                      </td>
                      <td className="px-4 py-4">
                        <StatusBadge tone={getPaymentStatusTone(order.status)}>
                          {getPaymentStatusLabel(order.status, locale)}
                        </StatusBadge>
                      </td>
                      <td className="px-4 py-4">
                        <StatusBadge tone={getCallbackStatusTone(order.callbackStatus)}>
                          {getCallbackStatusLabel(order.callbackStatus, locale)}
                        </StatusBadge>
                      </td>
                      <td className="px-4 py-4 text-xs text-muted">
                        <p>{content.createdPrefix} {formatDateTime(order.createdAt, locale)}</p>
                        <p className="mt-1">{content.paidPrefix} {formatDateTime(order.paidAt, locale)}</p>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
        </section>
      ) : null}

      {canReadRefunds ? (
        <section className={`${panelClass} min-w-0 p-5 sm:p-6`}>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.22em] text-muted">
                {content.recentRefundsEyebrow}
              </p>
              <h2 className="mt-2 text-2xl font-semibold text-foreground">
                {content.recentRefundsTitle}
              </h2>
            </div>
            <div className="flex flex-col gap-3 sm:items-end">
              <p className="max-w-xl text-sm leading-7 text-muted">
                {content.recentRefundsDesc}
              </p>
              <Link href="/merchant/refunds" className={subtleButtonClass}>
                {content.recentRefundsButton}
              </Link>
            </div>
          </div>

          {merchant.paymentRefunds.length === 0 ? (
            <div className="mt-6 rounded-[1.25rem] border border-dashed border-line p-6 text-center text-sm leading-7 text-muted">
              {content.noRefunds}
            </div>
          ) : (
            <div className={`mt-6 ${tableWrapperClass}`}>
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-[#f3e7d7] text-xs uppercase tracking-[0.18em] text-muted">
                    <tr>
                      <th className="px-4 py-3">{content.refundIdCol}</th>
                      <th className="px-4 py-3">{content.relatedOrderCol}</th>
                      <th className="px-4 py-3">{content.amountCol}</th>
                      <th className="px-4 py-3">{content.refundStatusCol}</th>
                      <th className="px-4 py-3">{content.timeCol}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {merchant.paymentRefunds.map((refund) => (
                      <tr key={refund.id} className="border-t border-line/70">
                        <td className="px-4 py-4">
                          <p className="font-medium text-foreground">{refund.externalRefundId}</p>
                          <p className="mt-1 font-mono text-xs text-muted">{refund.id}</p>
                        </td>
                        <td className="px-4 py-4 text-xs text-muted">
                          {refund.paymentOrder.externalOrderId}
                        </td>
                        <td className="px-4 py-4 text-sm text-foreground">
                          {formatMoney(refund.amount.toString(), "CNY", locale)}
                        </td>
                        <td className="px-4 py-4">
                          <StatusBadge
                            tone={
                              refund.status === "SUCCEEDED"
                                ? "success"
                                : refund.status === "FAILED"
                                  ? "danger"
                                  : "warning"
                            }
                          >
                            {getRefundStatusLabel(refund.status, locale)}
                          </StatusBadge>
                          <p className="mt-1 text-xs text-muted">
                            {refund.providerStatus ?? content.providerPending}
                          </p>
                        </td>
                        <td className="px-4 py-4 text-xs text-muted">
                          <p>
                            {content.refundCreatedPrefix} {formatDateTime(refund.createdAt, locale)}
                          </p>
                          <p className="mt-1">
                            {content.refundedPrefix} {formatDateTime(refund.refundedAt, locale)}
                          </p>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>
      ) : null}
    </div>
  );
}
