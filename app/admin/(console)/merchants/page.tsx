import Link from "next/link";
import { createMerchantAction, reviewMerchantAction } from "@/app/admin/actions";
import {
  buildPageHref,
  formatDateTime,
  getPaginationState,
  getMerchantStatusLabel,
  getMerchantStatusTone,
  parsePageParam,
  readPageMessages,
  readSearchFilters,
  type SearchParamsInput,
} from "@/app/admin/support";
import {
  AdminPageHeader,
  EmptyState,
  FlashMessage,
  LabeledField,
  PaginationNav,
  StatCard,
  StatusBadge,
  buttonClass,
  inputClass,
  panelClass,
  selectClass,
  subtleButtonClass,
  tableWrapperClass,
} from "@/app/admin/ui";
import { requireAdminPermission } from "@/lib/admin-session";
import { getCurrentLocale } from "@/lib/i18n-server";
import { getMerchantDisplayName } from "@/lib/merchant-profile-completion";
import { getPrismaClient } from "@/lib/prisma";
import { hasPermission } from "@/lib/rbac";

const MERCHANT_PAGE_SIZE = 20;

export default async function MerchantsPage({
  searchParams,
}: {
  searchParams?: SearchParamsInput;
}) {
  const session = await requireAdminPermission("merchant:read");
  const prisma = getPrismaClient();
  const canReview = hasPermission(session.adminUser.role, "merchant:write");
  const locale = await getCurrentLocale();
  const [messages, filters] = await Promise.all([
    readPageMessages(searchParams),
    readSearchFilters(searchParams, ["q", "callback", "status", "page"]),
  ]);
  const keyword = filters.q;
  const callback = filters.callback;
  const status = filters.status;
  const requestedPage = parsePageParam(filters.page);
  const content =
    locale === "en"
      ? {
          eyebrow: "Merchant Center",
          title: "Merchant center",
          description:
            "The baseline operating view for a multi-merchant platform. Search merchants, review status, create new records, and jump into detail pages without forcing every configuration into one screen.",
          ordersButton: "Open Order Center",
          statMerchants: "Merchants",
          statMerchantsDetail: "Total merchants in the platform",
          statPending: "Pending",
          statPendingDetail: "Merchants awaiting review",
          statApproved: "Approved",
          statApprovedDetail: "Merchants already approved",
          statCallbacks: "Callbacks On",
          statCallbacksDetail: "Merchants with callback delivery enabled",
          statOrders: "Orders",
          statOrdersDetail: "All payment orders",
          statFiltered: "Filtered",
          statFilteredDetail: "Records returned by the current filter",
          reviewQueueEyebrow: "Review Queue",
          reviewQueueTitle: "Pending merchant queue",
          reviewQueueDesc:
            "This section aggregates merchants waiting for onboarding approval. Administrators can review them directly or open the detail page to add review notes first.",
          pendingCountText: "Pending",
          pendingBadge: "Pending Review",
          legalName: "Legal Entity",
          contactName: "Contact",
          contactEmail: "Contact Email",
          submittedAt: "Submitted At",
          notFilled: "Not provided",
          noNote: "The merchant has not provided onboarding notes yet.",
          approve: "Approve",
          reject: "Reject",
          detailReview: "Open Detail Review",
          filterCreateTitle: "Merchant filters and creation",
          filterCreateDesc:
            "Use search and status filters to find a target merchant first, then open the detail page to manage secrets, business callback settings, bindings, and recent orders.",
          keyword: "Keyword",
          keywordPlaceholder: "Search merchant code or name",
          callbackStatus: "Business Callback",
          all: "All",
          callbackEnabled: "Enabled",
          callbackDisabled: "Disabled",
          reviewStatus: "Review Status",
          filterButton: "Filter Merchants",
          createButton: "Create Merchant",
          codeLabel: "Merchant Code",
          nameLabel: "Merchant Name",
          legalNameLabel: "Legal Entity Name",
          contactLabel: "Contact",
          phoneLabel: "Phone",
          registrationId: "Business Registration ID",
          callbackBase: "Default Business Callback URL",
          ipWhitelist: "API IP Whitelist",
          ipWhitelistHint: "One IP per line or comma-separated. Leave blank for no restriction.",
          onboardingNote: "Additional Notes",
          notifySecret: "notifySecret",
          notifySecretHint: "Encrypted automatically after creation and used for merchant business callback signature verification.",
          callbackEnabledLabel: "Enable merchant business callbacks",
          emptyTitle: "No merchants matched the current filter",
          emptyDesc: "Adjust the filters or create a new merchant directly from the form on the right.",
          directoryEyebrow: "Merchant Directory",
          directoryTitle: "Merchant directory",
          directoryDesc:
            "Each row represents an independent merchant. The detail page continues with secrets, callbacks, bindings, and recent orders as part of the multi-merchant workflow.",
          pageSummary: "Page",
          pageRange: "Showing",
          pageConnector: "of",
          previous: "Previous Page",
          next: "Next Page",
          merchantCol: "Merchant",
          reviewCol: "Review",
          callbackCol: "Callback",
          bindingCol: "Bindings",
          orderCol: "Orders",
          latestOrderCol: "Latest Order",
          createdAtCol: "Created At",
          actionsCol: "Actions",
          missingContact: "No contact profile completed",
          changedAt: "Changed At",
          on: "Enabled",
          off: "Disabled",
          missingCallback: "Default business callback URL is not configured",
          bindingCount: "Channel Bindings",
          totalOrders: "Total Orders",
          noOrders: "No orders yet",
          merchantDetail: "Merchant Detail",
          viewOrders: "View Orders",
          pass: "Approve",
          refuse: "Reject",
          suspend: "Suspend",
          reapprove: "Reapprove",
        }
      : {
          eyebrow: "Merchant Center",
          title: "商户中心",
          description:
            "面向多商户运营的基础视图。这里先做商户检索、状态概览、创建入口和详情跳转，避免把所有配置塞进一个页面里。",
          ordersButton: "查看订单中心",
          statMerchants: "Merchants",
          statMerchantsDetail: "系统内商户总数",
          statPending: "Pending",
          statPendingDetail: "待审核商户数量",
          statApproved: "Approved",
          statApprovedDetail: "已通过审核的商户数量",
          statCallbacks: "Callbacks On",
          statCallbacksDetail: "启用商户回调的商户数量",
          statOrders: "Orders",
          statOrdersDetail: "全量支付订单数",
          statFiltered: "Filtered",
          statFilteredDetail: "当前筛选结果数量",
          reviewQueueEyebrow: "Review Queue",
          reviewQueueTitle: "待审核商户队列",
          reviewQueueDesc:
            "这里聚合了当前等待准入的商户。管理员可以直接一键审核，或进入详情页补充审核备注后再处理。",
          pendingCountText: "当前待审核",
          pendingBadge: "待审核",
          legalName: "企业主体",
          contactName: "联系人",
          contactEmail: "联系邮箱",
          submittedAt: "提交时间",
          notFilled: "未填写",
          noNote: "商户尚未填写入驻说明。",
          approve: "审核通过",
          reject: "驳回入驻",
          detailReview: "进入详情审核",
          filterCreateTitle: "商户筛选与新增",
          filterCreateDesc: "用检索和状态筛选先找到目标商户，再进入详情页管理密钥、业务回调、绑定和最近订单。",
          keyword: "关键词",
          keywordPlaceholder: "搜索商户编码或名称",
          callbackStatus: "业务回调",
          all: "全部",
          callbackEnabled: "已启用",
          callbackDisabled: "已停用",
          reviewStatus: "审核状态",
          filterButton: "筛选商户",
          createButton: "创建商户",
          codeLabel: "商户编码",
          nameLabel: "商户名称",
          legalNameLabel: "企业主体名称",
          contactLabel: "联系人",
          phoneLabel: "联系电话",
          registrationId: "统一社会信用代码",
          callbackBase: "默认业务回调地址",
          ipWhitelist: "API IP 白名单",
          ipWhitelistHint: "每行或逗号分隔一个 IP。留空表示不限制。",
          onboardingNote: "补充说明",
          notifySecret: "notifySecret",
          notifySecretHint: "创建后会自动加密保存，用于商户业务回调验签。",
          callbackEnabledLabel: "启用商户业务回调",
          emptyTitle: "没有符合条件的商户",
          emptyDesc: "调整筛选条件，或者直接在右侧创建新的商户。",
          directoryEyebrow: "Merchant Directory",
          directoryTitle: "商户目录",
          directoryDesc: "每一行代表一个独立商户。详情页里会继续承载密钥、回调、绑定和最近订单，符合多商户后台的工作流。",
          pageSummary: "页码",
          pageRange: "当前显示",
          pageConnector: "共",
          previous: "上一页",
          next: "下一页",
          merchantCol: "商户",
          reviewCol: "审核",
          callbackCol: "回调",
          bindingCol: "绑定",
          orderCol: "订单",
          latestOrderCol: "最近订单",
          createdAtCol: "创建时间",
          actionsCol: "操作",
          missingContact: "未补联系人资料",
          changedAt: "变更于",
          on: "已启用",
          off: "已关闭",
          missingCallback: "未配置默认业务回调地址",
          bindingCount: "通道绑定",
          totalOrders: "累计订单",
          noOrders: "暂无订单",
          merchantDetail: "商户详情",
          viewOrders: "查看订单",
          pass: "通过",
          refuse: "拒绝",
          suspend: "暂停",
          reapprove: "重新通过",
        };
  const where = {
    ...(keyword
      ? {
          OR: [
            { code: { contains: keyword, mode: "insensitive" as const } },
            { name: { contains: keyword, mode: "insensitive" as const } },
            { legalName: { contains: keyword, mode: "insensitive" as const } },
            { contactEmail: { contains: keyword, mode: "insensitive" as const } },
          ],
        }
      : {}),
    ...(callback === "enabled"
      ? { callbackEnabled: true }
      : callback === "disabled"
        ? { callbackEnabled: false }
        : {}),
    ...(status ? { status: status as "PENDING" | "APPROVED" | "REJECTED" | "SUSPENDED" } : {}),
  };
  const [
    merchantCount,
    callbackEnabledCount,
    orderCount,
    pendingCount,
    approvedCount,
    pendingMerchants,
    totalFilteredCount,
  ] = await Promise.all([
    prisma.merchant.count(),
    prisma.merchant.count({ where: { callbackEnabled: true } }),
    prisma.paymentOrder.count(),
    prisma.merchant.count({ where: { status: "PENDING" } }),
    prisma.merchant.count({ where: { status: "APPROVED" } }),
    prisma.merchant.findMany({
      where: {
        status: "PENDING",
      },
      orderBy: [{ createdAt: "asc" }],
      take: 6,
      select: {
        id: true,
        code: true,
        name: true,
        legalName: true,
        contactName: true,
        contactEmail: true,
        onboardingNote: true,
        createdAt: true,
      },
    }),
    prisma.merchant.count({ where }),
  ]);
  const { currentPage, totalPages, offset, pageStart, pageEnd } = getPaginationState(
    totalFilteredCount,
    requestedPage,
    MERCHANT_PAGE_SIZE,
  );
  const merchants = await prisma.merchant.findMany({
    where,
    orderBy: [{ createdAt: "desc" }],
    skip: offset,
    take: MERCHANT_PAGE_SIZE,
    include: {
      _count: {
        select: {
          paymentOrders: true,
          channelBindings: true,
        },
      },
      paymentOrders: {
        orderBy: [{ createdAt: "desc" }],
        take: 1,
        select: {
          id: true,
          status: true,
          createdAt: true,
        },
      },
    },
  });
  const baseFilters = {
    q: keyword,
    callback,
    status,
  };
  const currentPageHref = buildPageHref("/admin/merchants", baseFilters, currentPage);

  return (
    <div className="space-y-8">
      <AdminPageHeader
        eyebrow={content.eyebrow}
        title={content.title}
        description={content.description}
        actions={
          <Link href="/admin/orders" className={buttonClass}>
            {content.ordersButton}
          </Link>
        }
      />

      <FlashMessage success={messages.success} error={messages.error} />

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
        <StatCard label={content.statMerchants} value={merchantCount} detail={content.statMerchantsDetail} />
        <StatCard label={content.statPending} value={pendingCount} detail={content.statPendingDetail} />
        <StatCard label={content.statApproved} value={approvedCount} detail={content.statApprovedDetail} />
        <StatCard label={content.statCallbacks} value={callbackEnabledCount} detail={content.statCallbacksDetail} />
        <StatCard label={content.statOrders} value={orderCount} detail={content.statOrdersDetail} />
        <StatCard label={content.statFiltered} value={totalFilteredCount} detail={content.statFilteredDetail} />
      </section>

      {pendingMerchants.length > 0 ? (
        <section className={`${panelClass} p-6`}>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.22em] text-muted">{content.reviewQueueEyebrow}</p>
              <h2 className="mt-2 text-2xl font-semibold text-foreground">{content.reviewQueueTitle}</h2>
              <p className="mt-2 max-w-3xl text-sm leading-7 text-muted">{content.reviewQueueDesc}</p>
            </div>
            <div className="rounded-full border border-line bg-white px-4 py-2 text-sm text-muted">
              {content.pendingCountText} {pendingMerchants.length} / {pendingCount}
            </div>
          </div>

          <div className="mt-6 grid gap-4 xl:grid-cols-2">
            {pendingMerchants.map((merchant) => (
              <article
                key={merchant.id}
                className="rounded-[1.5rem] border border-line bg-white/75 p-5"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-lg font-semibold text-foreground">
                      {getMerchantDisplayName(merchant.name, locale)}
                    </p>
                    <p className="mt-1 font-mono text-xs text-muted">{merchant.code}</p>
                  </div>
                  <StatusBadge tone="warning">{content.pendingBadge}</StatusBadge>
                </div>
                <div className="mt-4 space-y-2 text-sm leading-7 text-muted">
                  <p>{content.legalName}{locale === "en" ? ": " : "："}{merchant.legalName ?? content.notFilled}</p>
                  <p>{content.contactName}{locale === "en" ? ": " : "："}{merchant.contactName ?? content.notFilled}</p>
                  <p>{content.contactEmail}{locale === "en" ? ": " : "："}{merchant.contactEmail ?? content.notFilled}</p>
                  <p>{content.submittedAt}{locale === "en" ? ": " : "："}{formatDateTime(merchant.createdAt, locale)}</p>
                </div>
                <div className="mt-4 rounded-[1.25rem] border border-line bg-[#faf7f1] p-4 text-sm leading-7 text-muted">
                  {merchant.onboardingNote?.trim() || content.noNote}
                </div>
                <div className="mt-5 flex flex-wrap gap-3">
                  {canReview ? (
                    <>
                      <form action={reviewMerchantAction}>
                        <input type="hidden" name="id" value={merchant.id} />
                        <input type="hidden" name="redirectTo" value={currentPageHref} />
                        <button
                          type="submit"
                          name="status"
                          value="APPROVED"
                          className="inline-flex items-center justify-center rounded-2xl bg-[#165746] px-4 py-2.5 text-sm font-medium text-white transition hover:opacity-90"
                        >
                          {content.approve}
                        </button>
                      </form>
                      <form action={reviewMerchantAction}>
                        <input type="hidden" name="id" value={merchant.id} />
                        <input type="hidden" name="redirectTo" value={currentPageHref} />
                        <button
                          type="submit"
                          name="status"
                          value="REJECTED"
                          className="inline-flex items-center justify-center rounded-2xl border border-[#f1c5c0] bg-[#fff4f1] px-4 py-2.5 text-sm font-medium text-[#973225] transition hover:opacity-90"
                        >
                          {content.reject}
                        </button>
                      </form>
                    </>
                  ) : null}
                  <Link href={`/admin/merchants/${merchant.id}`} className={subtleButtonClass}>
                    {content.detailReview}
                  </Link>
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      <section className={`${panelClass} p-6`}>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h2 className="text-2xl font-semibold text-foreground">{content.filterCreateTitle}</h2>
            <p className="mt-2 text-sm leading-7 text-muted">{content.filterCreateDesc}</p>
          </div>
        </div>

        <div className="mt-6 grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
          <form className="grid gap-4 rounded-[1.5rem] border border-line bg-white/70 p-5 lg:grid-cols-4">
            <LabeledField label={content.keyword}>
              <input
                name="q"
                defaultValue={keyword}
                placeholder={content.keywordPlaceholder}
                className={inputClass}
              />
            </LabeledField>
            <LabeledField label={content.callbackStatus}>
              <select name="callback" defaultValue={callback} className={selectClass}>
                <option value="">{content.all}</option>
                <option value="enabled">{content.callbackEnabled}</option>
                <option value="disabled">{content.callbackDisabled}</option>
              </select>
            </LabeledField>
            <LabeledField label={content.reviewStatus}>
              <select name="status" defaultValue={status} className={selectClass}>
                <option value="">{content.all}</option>
                <option value="PENDING">{getMerchantStatusLabel("PENDING", locale)}</option>
                <option value="APPROVED">{getMerchantStatusLabel("APPROVED", locale)}</option>
                <option value="REJECTED">{getMerchantStatusLabel("REJECTED", locale)}</option>
                <option value="SUSPENDED">{getMerchantStatusLabel("SUSPENDED", locale)}</option>
              </select>
            </LabeledField>
            <div className="flex items-end">
              <button type="submit" className={buttonClass}>
                {content.filterButton}
              </button>
            </div>
          </form>

          <form action={createMerchantAction} className="grid gap-4 rounded-[1.5rem] border border-line bg-white/70 p-5">
            <input type="hidden" name="redirectTo" value={currentPageHref} />
            <div className="grid gap-4 sm:grid-cols-2">
              <LabeledField label={content.codeLabel}>
                <input name="code" placeholder="merchant-cn-001" className={inputClass} />
              </LabeledField>
              <LabeledField label={content.nameLabel}>
                <input name="name" placeholder="Merchant CN 001" className={inputClass} />
              </LabeledField>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <LabeledField label={content.legalNameLabel}>
                <input name="legalName" placeholder="Merchant Legal Name Ltd." className={inputClass} />
              </LabeledField>
              <LabeledField label={content.reviewStatus}>
                <select name="status" defaultValue="APPROVED" className={selectClass}>
                  <option value="APPROVED">{getMerchantStatusLabel("APPROVED", locale)}</option>
                  <option value="PENDING">{getMerchantStatusLabel("PENDING", locale)}</option>
                  <option value="REJECTED">{getMerchantStatusLabel("REJECTED", locale)}</option>
                  <option value="SUSPENDED">{getMerchantStatusLabel("SUSPENDED", locale)}</option>
                </select>
              </LabeledField>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <LabeledField label={content.contactLabel}>
                <input name="contactName" placeholder="张三" className={inputClass} />
              </LabeledField>
              <LabeledField label={content.contactEmail}>
                <input name="contactEmail" placeholder="merchant@example.com" className={inputClass} />
              </LabeledField>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <LabeledField label={content.phoneLabel}>
                <input name="contactPhone" placeholder="13800138000" className={inputClass} />
              </LabeledField>
              <LabeledField label={content.registrationId}>
                <input name="companyRegistrationId" placeholder="91310000XXXXXXXXXX" className={inputClass} />
              </LabeledField>
            </div>
            <LabeledField label={content.callbackBase}>
              <input
                name="callbackBase"
                placeholder="https://merchant.example.com/api/payment/notify"
                className={inputClass}
              />
            </LabeledField>
            <LabeledField label={content.ipWhitelist} hint={content.ipWhitelistHint}>
              <textarea
                name="apiIpWhitelist"
                placeholder={"127.0.0.1\n203.0.113.10"}
                className={`${inputClass} min-h-[100px] resize-y`}
              />
            </LabeledField>
            <LabeledField label={content.onboardingNote}>
              <textarea
                name="onboardingNote"
                placeholder="业务类型、预计交易量、开通诉求等"
                className={`${inputClass} min-h-[100px] resize-y`}
              />
            </LabeledField>
            <LabeledField label={content.notifySecret} hint={content.notifySecretHint}>
              <input name="notifySecret" placeholder="merchant-notify-secret" className={inputClass} />
            </LabeledField>
            <label className="flex items-center gap-3 text-sm font-medium text-foreground">
              <input type="checkbox" name="callbackEnabled" defaultChecked className="h-4 w-4 rounded border-line" />
              {content.callbackEnabledLabel}
            </label>
            <div>
              <button type="submit" className={buttonClass}>
                {content.createButton}
              </button>
            </div>
          </form>
        </div>
      </section>

      {merchants.length === 0 ? (
        <EmptyState title={content.emptyTitle} description={content.emptyDesc} />
      ) : (
        <section className={`${panelClass} p-6`}>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.22em] text-muted">{content.directoryEyebrow}</p>
              <h2 className="mt-2 text-2xl font-semibold text-foreground">{content.directoryTitle}</h2>
            </div>
            <div className="max-w-2xl">
              <p className="text-sm leading-7 text-muted">{content.directoryDesc}</p>
              <p className="mt-2 text-xs text-muted">
                {content.pageSummary} {currentPage}/{totalPages} · {content.pageRange} {pageStart}-{pageEnd} {content.pageConnector} {totalFilteredCount}
              </p>
            </div>
          </div>

          <div className={`mt-6 ${tableWrapperClass}`}>
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-[#f3e7d7] text-xs uppercase tracking-[0.18em] text-muted">
                  <tr>
                    <th className="px-4 py-3">{content.merchantCol}</th>
                    <th className="px-4 py-3">{content.reviewCol}</th>
                    <th className="px-4 py-3">{content.callbackCol}</th>
                    <th className="px-4 py-3">{content.bindingCol}</th>
                    <th className="px-4 py-3">{content.orderCol}</th>
                    <th className="px-4 py-3">{content.latestOrderCol}</th>
                    <th className="px-4 py-3">{content.createdAtCol}</th>
                    <th className="px-4 py-3">{content.actionsCol}</th>
                  </tr>
                </thead>
                <tbody>
                  {merchants.map((merchant) => {
                    const latestOrder = merchant.paymentOrders[0];

                    return (
                      <tr key={merchant.id} className="border-t border-line/70 align-top">
                        <td className="px-4 py-4">
                          <p className="font-medium text-foreground">
                            {getMerchantDisplayName(merchant.name, locale)}
                          </p>
                          <p className="mt-1 font-mono text-xs text-muted">{merchant.code}</p>
                          <p className="mt-1 text-xs text-muted">{merchant.contactEmail ?? merchant.legalName ?? content.missingContact}</p>
                        </td>
                        <td className="px-4 py-4">
                          <StatusBadge tone={getMerchantStatusTone(merchant.status)}>
                            {getMerchantStatusLabel(merchant.status, locale)}
                          </StatusBadge>
                          <p className="mt-2 text-xs text-muted">
                            {content.changedAt} {formatDateTime(merchant.statusChangedAt, locale)}
                          </p>
                        </td>
                        <td className="px-4 py-4">
                          <StatusBadge tone={merchant.callbackEnabled ? "success" : "danger"}>
                            {merchant.callbackEnabled ? content.on : content.off}
                          </StatusBadge>
                          <p className="mt-2 max-w-[260px] break-all text-xs text-muted">
                            {merchant.callbackBase ?? content.missingCallback}
                          </p>
                        </td>
                        <td className="px-4 py-4 text-xs text-muted">
                          <p>{content.bindingCount} {merchant._count.channelBindings}</p>
                        </td>
                        <td className="px-4 py-4 text-xs text-muted">
                          <p>{content.totalOrders} {merchant._count.paymentOrders}</p>
                        </td>
                        <td className="px-4 py-4 text-xs text-muted">
                          {latestOrder ? (
                            <>
                              <p className="font-mono text-foreground">{latestOrder.id}</p>
                              <p className="mt-1">{latestOrder.status}</p>
                            </>
                          ) : (
                            content.noOrders
                          )}
                        </td>
                        <td className="px-4 py-4 text-xs text-muted">{formatDateTime(merchant.createdAt, locale)}</td>
                        <td className="px-4 py-4">
                          <div className="flex flex-wrap gap-2">
                            <Link
                              href={`/admin/merchants/${merchant.id}`}
                              className="rounded-xl border border-line bg-white px-3 py-2 text-xs font-medium text-foreground"
                            >
                              {content.merchantDetail}
                            </Link>
                            <Link
                              href={`/admin/orders?merchantCode=${merchant.code}`}
                              className="rounded-xl border border-line bg-white px-3 py-2 text-xs font-medium text-foreground"
                            >
                              {content.viewOrders}
                            </Link>
                            {canReview && merchant.status === "PENDING" ? (
                              <>
                                <form action={reviewMerchantAction}>
                                  <input type="hidden" name="id" value={merchant.id} />
                                  <input type="hidden" name="redirectTo" value={currentPageHref} />
                                  <button
                                    type="submit"
                                    name="status"
                                    value="APPROVED"
                                  className="rounded-xl bg-[#165746] px-3 py-2 text-xs font-medium text-white transition hover:opacity-90"
                                >
                                    {content.pass}
                                  </button>
                                </form>
                                <form action={reviewMerchantAction}>
                                  <input type="hidden" name="id" value={merchant.id} />
                                  <input type="hidden" name="redirectTo" value={currentPageHref} />
                                  <button
                                    type="submit"
                                    name="status"
                                    value="REJECTED"
                                  className="rounded-xl border border-[#f1c5c0] bg-[#fff4f1] px-3 py-2 text-xs font-medium text-[#973225] transition hover:opacity-90"
                                >
                                    {content.refuse}
                                  </button>
                                </form>
                              </>
                            ) : null}
                            {canReview && merchant.status === "APPROVED" ? (
                              <form action={reviewMerchantAction}>
                                <input type="hidden" name="id" value={merchant.id} />
                                <input type="hidden" name="redirectTo" value={currentPageHref} />
                                <button
                                  type="submit"
                                  name="status"
                                  value="SUSPENDED"
                                  className="rounded-xl border border-[#bfd3ff] bg-[#f2f6ff] px-3 py-2 text-xs font-medium text-[#284baf] transition hover:opacity-90"
                                >
                                  {content.suspend}
                                </button>
                              </form>
                            ) : null}
                            {canReview &&
                            (merchant.status === "REJECTED" || merchant.status === "SUSPENDED") ? (
                              <form action={reviewMerchantAction}>
                                <input type="hidden" name="id" value={merchant.id} />
                                <input type="hidden" name="redirectTo" value={currentPageHref} />
                                <button
                                  type="submit"
                                  name="status"
                                  value="APPROVED"
                                  className="rounded-xl bg-[#165746] px-3 py-2 text-xs font-medium text-white transition hover:opacity-90"
                                >
                                  {content.reapprove}
                                </button>
                              </form>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <PaginationNav
            summary={`${content.pageSummary} ${currentPage}/${totalPages} · ${content.pageRange} ${pageStart}-${pageEnd} ${content.pageConnector} ${totalFilteredCount}`}
            previousHref={
              currentPage > 1
                ? buildPageHref("/admin/merchants", baseFilters, currentPage - 1)
                : null
            }
            previousLabel={content.previous}
            nextHref={
              currentPage < totalPages
                ? buildPageHref("/admin/merchants", baseFilters, currentPage + 1)
                : null
            }
            nextLabel={content.next}
          />
        </section>
      )}
    </div>
  );
}
