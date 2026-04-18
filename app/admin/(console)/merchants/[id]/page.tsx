import Link from "next/link";
import { notFound } from "next/navigation";
import {
  createMerchantUserAction,
  createMerchantApiCredentialAction,
  reviewMerchantAction,
  updateMerchantAction,
  updateMerchantUserAction,
  updateMerchantApiCredentialStatusAction,
} from "@/app/admin/actions";
import {
  getCallbackStatusLabel,
  formatDateTime,
  formatMoney,
  getMerchantStatusLabel,
  getMerchantStatusTone,
  getPaymentStatusLabel,
  getPaymentStatusTone,
  readPageMessages,
  type SearchParamsInput,
} from "@/app/admin/support";
import {
  AdminPageHeader,
  FlashMessage,
  LabeledField,
  StatCard,
  StatusBadge,
  buttonClass,
  inputClass,
  panelClass,
  subtleButtonClass,
  textareaClass,
  tableWrapperClass,
} from "@/app/admin/ui";
import { PaymentStatus } from "@/generated/prisma/enums";
import { requireAdminPermission } from "@/lib/admin-session";
import { getCurrentLocale } from "@/lib/i18n-server";
import { getMerchantDisplayRole } from "@/lib/merchant-session";
import { getMerchantDisplayName, getMerchantEditableName } from "@/lib/merchant-profile-completion";
import { getPrismaClient } from "@/lib/prisma";
import { hasPermission } from "@/lib/rbac";
import { maskStoredSecret } from "@/lib/secret-box";

export default async function MerchantDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: SearchParamsInput;
}) {
  const session = await requireAdminPermission("merchant:read");
  const { id } = await params;
  const prisma = getPrismaClient();
  const canReview = hasPermission(session.adminUser.role, "merchant:write");
  const messages = await readPageMessages(searchParams);
  const locale = await getCurrentLocale();
  const merchant = await prisma.merchant.findUnique({
    where: { id },
    include: {
      _count: {
        select: {
          paymentOrders: true,
          channelBindings: true,
          channelAccounts: true,
        },
      },
      channelBindings: {
        include: {
          merchantChannelAccount: {
            select: {
              id: true,
              displayName: true,
              channelCode: true,
              enabled: true,
              callbackToken: true,
            },
          },
          providerAccount: {
            select: {
              id: true,
              displayName: true,
              channelCode: true,
              enabled: true,
            },
          },
        },
        orderBy: [{ channelCode: "asc" }],
      },
      channelAccounts: {
        orderBy: [{ channelCode: "asc" }, { updatedAt: "desc" }],
        select: {
          id: true,
          channelCode: true,
          displayName: true,
          enabled: true,
          callbackToken: true,
          lastVerifiedAt: true,
          lastErrorMessage: true,
          updatedAt: true,
        },
      },
      apiCredentials: {
        orderBy: [{ createdAt: "desc" }],
      },
      users: {
        orderBy: [{ createdAt: "asc" }],
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          enabled: true,
          lastLoginAt: true,
          createdAt: true,
          updatedAt: true,
        },
      },
      paymentOrders: {
        orderBy: [{ createdAt: "desc" }],
        take: 10,
        select: {
          id: true,
          externalOrderId: true,
          channelCode: true,
          amount: true,
          status: true,
          providerStatus: true,
          callbackStatus: true,
          createdAt: true,
          paidAt: true,
        },
      },
    },
  });

  if (!merchant) {
    notFound();
  }

  const [successfulOrders, totalPaidAmount] = await Promise.all([
    prisma.paymentOrder.count({
      where: {
        merchantId: merchant.id,
        status: PaymentStatus.SUCCEEDED,
      },
    }),
    prisma.paymentOrder.aggregate({
      where: {
        merchantId: merchant.id,
        status: PaymentStatus.SUCCEEDED,
      },
      _sum: {
        amount: true,
      },
    }),
  ]);
  const successRate =
    merchant._count.paymentOrders > 0
      ? `${((successfulOrders / merchant._count.paymentOrders) * 100).toFixed(1)}%`
      : "0%";
  const content =
    locale === "en"
      ? {
          headerEyebrow: "Merchant Detail",
          headerDescription:
            "Use the merchant detail page to manage onboarding data, dedicated API credentials, merchant-owned channel instances, routing, and recent transaction activity in a single enterprise workflow.",
          backButton: "Back to Merchant Center",
          ordersButton: "Open Merchant Orders",
          statMerchantCode: "Merchant Code",
          statMerchantCodeDetail: "Unique merchant identifier",
          statStatus: "Status",
          statStatusDetail: "Current onboarding review status",
          statOrders: "Orders",
          statOrdersDetail: "Total payment orders",
          statChannels: "Channels",
          statChannelsDetail: "Merchant-owned channel instances configured",
          statSuccessRate: "Success Rate",
          statSuccessRateDetail: "Share of succeeded payment orders",
          statGmv: "GMV",
          statGmvDetail: "Cumulative succeeded payment amount",
          profileEyebrow: "Profile",
          profileTitle: "Merchant profile",
          callbackEnabledStatus: "Merchant business callbacks enabled",
          callbackDisabledStatus: "Merchant business callbacks disabled",
          codeLabel: "Merchant Code",
          nameLabel: "Merchant Name",
          legalNameLabel: "Legal Entity Name",
          registrationIdLabel: "Business Registration ID",
          contactNameLabel: "Contact Name",
          contactEmailLabel: "Contact Email",
          contactPhoneLabel: "Contact Phone",
          callbackBaseLabel: "Default Business Callback URL",
          ipWhitelistLabel: "API IP Whitelist",
          ipWhitelistHint: "Enter one IP per line or separate by commas. Leave blank for no restriction.",
          callbackToggleLabel: "Enable merchant business callbacks",
          notifySecretHintConfigured: `Configured: ${maskStoredSecret(merchant.notifySecret)}. Leave blank to keep the current business callback signing secret, or enter a new value to rotate it.`,
          notifySecretHintEmpty:
            "No business callback signing secret is configured yet. A new value will be encrypted and saved automatically.",
          onboardingNoteLabel: "Onboarding Note",
          createdAt: "Created",
          updatedAt: "Updated",
          statusChangedAt: "Status Changed",
          saveProfile: "Save Merchant Profile",
          usersEyebrow: "Merchant Users",
          usersTitle: "Merchant login accounts",
          usersDescription:
            "Manage merchant console login accounts here. Passwords are stored as hashes and cannot be viewed; administrators can only reset them by entering a new password.",
          createUserTitle: "Create merchant login",
          userNameLabel: "Login Name",
          userEmailLabel: "Login Email",
          userRoleLabel: "Role",
          userPasswordLabel: "New Password",
          userConfirmPasswordLabel: "Confirm Password",
          userEnabledLabel: "Enable login",
          createUserButton: "Create Login Account",
          saveUserButton: "Save Login Account",
          noUsers: "This merchant does not have any login accounts yet.",
          userPasswordHintCreate: "At least 8 characters. Passwords are hashed and never shown in plaintext.",
          userPasswordHintUpdate: "Leave blank to keep the current password. Enter a new value to reset it.",
          lastLoginCol: "Last Login",
          loginCreatedAtCol: "Created",
          accountStatusEnabled: "Enabled",
          accountStatusDisabled: "Disabled",
          noUserManagePermission: "This account cannot manage merchant login accounts.",
          reviewEyebrow: "Review",
          reviewTitle: "Review and access control",
          approvedAt: "Approved At",
          approvedBy: "Approved By",
          noApprover: "—",
          reviewSummary:
            "Only approved merchants are allowed to create payment orders. Suspended status is suitable for temporary risk control holds, while rejected status is for onboarding denial.",
          reviewSummaryNote: "Current review note",
          noReviewNote: "No review note yet",
          reviewNoteLabel: "Review Note",
          reviewNoteHint: "Describe rejection reasons, missing documents, or suspension rationale before choosing a review action below.",
          approveButton: "Approve Merchant",
          rejectButton: "Reject Onboarding",
          suspendButton: "Suspend Merchant",
          pendingButton: "Return to Pending",
          noReviewPermission: "This account has read-only access and cannot execute merchant review actions.",
          routingEyebrow: "Routing",
          routingTitle: "Channel routing",
          routingButton: "Open Binding Center",
          noBindings: "No routing bindings are configured for this merchant yet.",
          channelCol: "Channel",
          targetCol: "Routing Target",
          scopeCol: "Amount Scope",
          statusCol: "Status",
          merchantInstancePrefix: "Merchant Instance",
          legacyPrefix: "Legacy Platform Account",
          migrateHint: "Migrate this binding to a merchant-owned channel instance.",
          autoRoute: "No explicit target is configured. System auto-routing will apply.",
          minAmount: "Min",
          maxAmount: "Max",
          enabled: "Enabled",
          disabled: "Disabled",
          channelInstancesEyebrow: "Channel Instances",
          channelInstancesTitle: "Merchant channel instances",
          instanceCount: (count: number) => `${count} instances`,
          noAccounts: "No merchant-owned payment channel instances have been configured yet.",
          activeStatus: "Active",
          inactiveStatus: "Inactive",
          accountUpdatedAt: "Updated",
          accountVerifiedAt: "Last Verified",
          accountError: "Latest Error",
          credentialsEyebrow: "API Credentials",
          credentialsTitle: "Merchant API credentials",
          credentialsDescription:
            "Production order creation should use dedicated credentials identified by `x-novapay-key`. Signing secrets are no longer expected to live on the merchant master record.",
          createCredentialTitle: "Create API credential",
          credentialLabel: "Credential Label",
          credentialLabelPlaceholder: "Production Key / ERP Connector",
          expiresAtLabel: "Expires At",
          createCredentialButton: "Generate Credential",
          noCredentials:
            "No dedicated API credential has been created for this merchant yet. Create one before production order traffic is enabled.",
          secretPreview: "Secret Preview",
          credentialToggleLabel: "Enable credential",
          credentialCreatedAt: "Created",
          credentialLastUsedAt: "Last Used",
          saveCredential: "Save Credential Status",
          recentEyebrow: "Transactions",
          recentTitle: "Recent orders",
          recentDesc: "This detail snapshot shows only the latest 10 orders. Use the full order center for complete filtering and paging.",
          recentButton: "Open Full Order Center",
          noRecentOrders: "No recent order data is available for this merchant yet.",
          orderCol: "Order",
          amountCol: "Amount",
          paymentStatusCol: "Payment Status",
          callbackStatusCol: "Business Callback",
          timeCol: "Time",
          createdPrefix: "Created",
          paidPrefix: "Paid",
          noProviderStatus: "—",
        }
      : {
          headerEyebrow: "Merchant Detail",
          headerDescription:
            "商户详情页集中承载资料维护、独立 API 凭证、商户自有通道实例、路由规则与近期交易，符合企业后台的分角色运营流程。",
          backButton: "返回商户中心",
          ordersButton: "查看该商户订单",
          statMerchantCode: "商户号",
          statMerchantCodeDetail: "商户唯一识别编码",
          statStatus: "状态",
          statStatusDetail: "当前准入审核状态",
          statOrders: "订单数",
          statOrdersDetail: "累计支付订单总数",
          statChannels: "通道实例",
          statChannelsDetail: "商户已配置的自有支付通道实例数",
          statSuccessRate: "成功率",
          statSuccessRateDetail: "成功支付订单占比",
          statGmv: "交易总额",
          statGmvDetail: "累计成功支付金额",
          profileEyebrow: "Profile",
          profileTitle: "商户资料",
          callbackEnabledStatus: "商户业务回调已启用",
          callbackDisabledStatus: "商户业务回调已停用",
          codeLabel: "商户编码",
          nameLabel: "商户名称",
          legalNameLabel: "企业主体名称",
          registrationIdLabel: "统一社会信用代码",
          contactNameLabel: "联系人",
          contactEmailLabel: "联系邮箱",
          contactPhoneLabel: "联系电话",
          callbackBaseLabel: "默认业务回调地址",
          ipWhitelistLabel: "API IP 白名单",
          ipWhitelistHint: "每行一个 IP 或使用逗号分隔。留空表示不限制来源地址。",
          callbackToggleLabel: "启用商户业务回调",
          notifySecretHintConfigured: `当前已配置：${maskStoredSecret(merchant.notifySecret)}。留空表示不修改当前业务回调验签密钥，输入新值会替换现有密钥。`,
          notifySecretHintEmpty: "当前未配置业务回调验签密钥。输入后会自动加密保存。",
          onboardingNoteLabel: "商户入驻说明",
          createdAt: "创建于",
          updatedAt: "更新于",
          statusChangedAt: "状态更新时间",
          saveProfile: "保存商户配置",
          usersEyebrow: "Merchant Users",
          usersTitle: "商户登录账号",
          usersDescription:
            "在这里维护商户控制台登录账号。密码只会以哈希方式存储，后台不能查看原文，只能通过输入新密码来重置。",
          createUserTitle: "新增商户登录账号",
          userNameLabel: "登录姓名",
          userEmailLabel: "登录邮箱",
          userRoleLabel: "账号角色",
          userPasswordLabel: "新密码",
          userConfirmPasswordLabel: "确认密码",
          userEnabledLabel: "启用登录",
          createUserButton: "创建登录账号",
          saveUserButton: "保存登录账号",
          noUsers: "当前商户还没有任何登录账号。",
          userPasswordHintCreate: "至少 8 位。密码会以哈希方式存储，后台不显示原文。",
          userPasswordHintUpdate: "留空则保持当前密码不变；输入新值即可重置密码。",
          lastLoginCol: "最近登录",
          loginCreatedAtCol: "创建时间",
          accountStatusEnabled: "启用",
          accountStatusDisabled: "停用",
          noUserManagePermission: "当前账号没有权限管理商户登录账号。",
          reviewEyebrow: "Review",
          reviewTitle: "审核与准入",
          approvedAt: "审核通过于",
          approvedBy: "审核人",
          noApprover: "—",
          reviewSummary:
            "审核通过后商户才允许创建支付订单。暂停状态适合风控冻结，拒绝状态适合入驻未通过。",
          reviewSummaryNote: "当前审核备注",
          noReviewNote: "暂无审核备注",
          reviewNoteLabel: "审核备注",
          reviewNoteHint: "填写拒绝原因、补件要求或暂停原因后，再点击下方对应审核动作。",
          approveButton: "审核通过",
          rejectButton: "驳回入驻",
          suspendButton: "暂停商户",
          pendingButton: "退回待审核",
          noReviewPermission: "当前账号只有查看权限，不能执行商户审核操作。",
          routingEyebrow: "Routing",
          routingTitle: "通道路由",
          routingButton: "进入绑定中心",
          noBindings: "当前商户还没有配置通道绑定。",
          channelCol: "通道",
          targetCol: "路由目标",
          scopeCol: "范围",
          statusCol: "状态",
          merchantInstancePrefix: "商户实例",
          legacyPrefix: "遗留平台账号路由",
          migrateHint: "请迁移到商户自有通道实例",
          autoRoute: "未指定，按系统自动路由",
          minAmount: "最小",
          maxAmount: "最大",
          enabled: "启用",
          disabled: "停用",
          channelInstancesEyebrow: "Channel Instances",
          channelInstancesTitle: "商户通道实例",
          instanceCount: (count: number) => `共 ${count} 个实例`,
          noAccounts: "当前商户还没有录入任何支付通道实例。",
          activeStatus: "启用中",
          inactiveStatus: "已停用",
          accountUpdatedAt: "更新于",
          accountVerifiedAt: "最近校验",
          accountError: "最近错误",
          credentialsEyebrow: "API Credentials",
          credentialsTitle: "商户 API 凭证",
          credentialsDescription:
            "下单请求建议使用独立凭证，并通过 `x-novapay-key` 标识具体凭证，签名密钥不再直接挂在商户主表字段上。",
          createCredentialTitle: "新增 API 凭证",
          credentialLabel: "凭证标签",
          credentialLabelPlaceholder: "生产凭证 / ERP 接口",
          expiresAtLabel: "过期时间",
          createCredentialButton: "生成凭证",
          noCredentials:
            "该商户还没有独立 API 凭证，正式环境下建议先创建独立凭证后再开启正式下单流量。",
          secretPreview: "Secret 预览",
          credentialToggleLabel: "启用凭证",
          credentialCreatedAt: "创建于",
          credentialLastUsedAt: "最后使用",
          saveCredential: "保存凭证状态",
          recentEyebrow: "Transactions",
          recentTitle: "最近订单",
          recentDesc: "这里仅展示最近 10 笔订单快照，完整筛选与翻页请进入订单中心。",
          recentButton: "打开完整订单中心",
          noRecentOrders: "该商户暂时还没有近期订单记录。",
          orderCol: "订单",
          amountCol: "金额",
          paymentStatusCol: "支付状态",
          callbackStatusCol: "业务回调",
          timeCol: "时间",
          createdPrefix: "创建",
          paidPrefix: "支付",
          noProviderStatus: "—",
        };

  return (
    <div className="space-y-8">
      <AdminPageHeader
        eyebrow={content.headerEyebrow}
        title={getMerchantDisplayName(merchant.name, locale)}
        description={content.headerDescription}
        actions={
          <>
            <Link href="/admin/merchants" className="rounded-2xl border border-line bg-white/80 px-4 py-2.5 text-sm font-medium text-foreground">
              {content.backButton}
            </Link>
            <Link href={`/admin/orders?merchantCode=${merchant.code}`} className={buttonClass}>
              {content.ordersButton}
            </Link>
          </>
        }
      />

      <FlashMessage success={messages.success} error={messages.error} />

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
        <StatCard label={content.statMerchantCode} value={merchant.code} detail={content.statMerchantCodeDetail} />
        <StatCard
          label={content.statStatus}
          value={getMerchantStatusLabel(merchant.status, locale)}
          detail={content.statStatusDetail}
        />
        <StatCard label={content.statOrders} value={merchant._count.paymentOrders} detail={content.statOrdersDetail} />
        <StatCard
          label={content.statChannels}
          value={merchant._count.channelAccounts}
          detail={content.statChannelsDetail}
        />
        <StatCard label={content.statSuccessRate} value={successRate} detail={content.statSuccessRateDetail} />
        <StatCard
          label={content.statGmv}
          value={formatMoney(totalPaidAmount._sum.amount?.toString() ?? 0, "CNY", locale)}
          detail={content.statGmvDetail}
        />
      </section>

      <section className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <article className={`${panelClass} p-6`}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.22em] text-muted">{content.profileEyebrow}</p>
              <h2 className="mt-2 text-2xl font-semibold text-foreground">{content.profileTitle}</h2>
            </div>
            <div className="flex flex-wrap gap-2">
              <StatusBadge tone={getMerchantStatusTone(merchant.status)}>
                {getMerchantStatusLabel(merchant.status, locale)}
              </StatusBadge>
              <StatusBadge tone={merchant.callbackEnabled ? "success" : "danger"}>
                {merchant.callbackEnabled ? content.callbackEnabledStatus : content.callbackDisabledStatus}
              </StatusBadge>
            </div>
          </div>

          <form action={updateMerchantAction} className="mt-6 grid gap-4">
            <input type="hidden" name="redirectTo" value={`/admin/merchants/${merchant.id}`} />
            <input type="hidden" name="id" value={merchant.id} />
            <div className="grid gap-4 sm:grid-cols-2">
              <LabeledField label={content.codeLabel}>
                <input name="code" defaultValue={merchant.code} className={inputClass} />
              </LabeledField>
              <LabeledField label={content.nameLabel}>
                <input name="name" defaultValue={getMerchantEditableName(merchant.name)} className={inputClass} />
              </LabeledField>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <LabeledField label={content.legalNameLabel}>
                <input name="legalName" defaultValue={merchant.legalName ?? ""} className={inputClass} />
              </LabeledField>
              <LabeledField label={content.registrationIdLabel}>
                <input
                  name="companyRegistrationId"
                  defaultValue={merchant.companyRegistrationId ?? ""}
                  className={inputClass}
                />
              </LabeledField>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <LabeledField label={content.contactNameLabel}>
                <input name="contactName" defaultValue={merchant.contactName ?? ""} className={inputClass} />
              </LabeledField>
              <LabeledField label={content.contactEmailLabel}>
                <input name="contactEmail" defaultValue={merchant.contactEmail ?? ""} className={inputClass} />
              </LabeledField>
              <LabeledField label={content.contactPhoneLabel}>
                <input name="contactPhone" defaultValue={merchant.contactPhone ?? ""} className={inputClass} />
              </LabeledField>
            </div>
            <LabeledField label={content.callbackBaseLabel}>
              <input name="callbackBase" defaultValue={merchant.callbackBase ?? ""} className={inputClass} />
            </LabeledField>
            <LabeledField label={content.ipWhitelistLabel} hint={content.ipWhitelistHint}>
              <textarea
                name="apiIpWhitelist"
                defaultValue={merchant.apiIpWhitelist ?? ""}
                className={`${textareaClass} min-h-[110px] font-sans text-sm`}
              />
            </LabeledField>
            <div className="rounded-[1.25rem] border border-line bg-white/65 p-4">
              <label className="flex items-center gap-3 text-sm font-medium text-foreground">
                <input
                  type="checkbox"
                  name="callbackEnabled"
                  defaultChecked={merchant.callbackEnabled}
                  className="h-4 w-4 rounded border-line"
                />
                {content.callbackToggleLabel}
              </label>
            </div>
            <input type="hidden" name="notifySecretStrategy" value="preserve_if_blank" />
            <LabeledField
              label="notifySecret"
              hint={
                merchant.notifySecret ? content.notifySecretHintConfigured : content.notifySecretHintEmpty
              }
            >
              <textarea
                name="notifySecret"
                defaultValue=""
                className={`${textareaClass} min-h-[110px] font-sans text-sm`}
              />
            </LabeledField>
            <LabeledField label={content.onboardingNoteLabel}>
              <textarea
                name="onboardingNote"
                defaultValue={merchant.onboardingNote ?? ""}
                className={`${textareaClass} min-h-[110px] font-sans text-sm`}
              />
            </LabeledField>
            <div className="flex flex-wrap gap-3 text-xs text-muted">
              <span className="rounded-full border border-line bg-white px-3 py-1">
                {content.createdAt} {formatDateTime(merchant.createdAt, locale)}
              </span>
              <span className="rounded-full border border-line bg-white px-3 py-1">
                {content.updatedAt} {formatDateTime(merchant.updatedAt, locale)}
              </span>
              <span className="rounded-full border border-line bg-white px-3 py-1">
                {content.statusChangedAt} {formatDateTime(merchant.statusChangedAt, locale)}
              </span>
            </div>
            <div>
              <button type="submit" className={buttonClass}>
                {content.saveProfile}
              </button>
              </div>
          </form>
        </article>

        <article className={`${panelClass} p-6`}>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.22em] text-muted">{content.reviewEyebrow}</p>
              <h2 className="mt-2 text-2xl font-semibold text-foreground">{content.reviewTitle}</h2>
            </div>
            <div className="flex flex-wrap gap-2 text-xs text-muted">
              <span className="rounded-full border border-line bg-white px-3 py-1">
                {content.approvedAt} {formatDateTime(merchant.approvedAt, locale)}
              </span>
              <span className="rounded-full border border-line bg-white px-3 py-1">
                {content.approvedBy} {merchant.approvedBy ?? content.noApprover}
              </span>
            </div>
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <div className="rounded-[1.25rem] border border-line bg-white/65 p-4 text-sm leading-7 text-muted">
              {content.reviewSummary}
            </div>
            <div className="rounded-[1.25rem] border border-line bg-white/65 p-4 text-sm leading-7 text-muted">
              {content.reviewSummaryNote}：{merchant.reviewNote?.trim() || content.noReviewNote}
            </div>
          </div>

          {canReview ? (
            <form
              action={reviewMerchantAction}
              className="mt-4 grid gap-4 rounded-[1.5rem] border border-line bg-white/75 p-5"
            >
              <input type="hidden" name="id" value={merchant.id} />
              <input type="hidden" name="redirectTo" value={`/admin/merchants/${merchant.id}`} />
              <LabeledField
                label={content.reviewNoteLabel}
                hint={content.reviewNoteHint}
              >
                <textarea
                  name="reviewNote"
                  defaultValue={merchant.reviewNote ?? ""}
                  className={`${textareaClass} min-h-[120px] font-sans text-sm`}
                />
              </LabeledField>
              <div className="flex flex-wrap gap-3">
                <button
                  type="submit"
                  name="status"
                  value="APPROVED"
                  className="inline-flex items-center justify-center rounded-2xl bg-[#165746] px-4 py-2.5 text-sm font-medium text-white transition hover:opacity-90"
                >
                  {content.approveButton}
                </button>
                <button
                  type="submit"
                  name="status"
                  value="REJECTED"
                  className="inline-flex items-center justify-center rounded-2xl border border-[#f1c5c0] bg-[#fff4f1] px-4 py-2.5 text-sm font-medium text-[#973225] transition hover:opacity-90"
                >
                  {content.rejectButton}
                </button>
                <button
                  type="submit"
                  name="status"
                  value="SUSPENDED"
                  className="inline-flex items-center justify-center rounded-2xl border border-[#bfd3ff] bg-[#f2f6ff] px-4 py-2.5 text-sm font-medium text-[#284baf] transition hover:opacity-90"
                >
                  {content.suspendButton}
                </button>
                <button
                  type="submit"
                  name="status"
                  value="PENDING"
                  className={subtleButtonClass}
                >
                  {content.pendingButton}
                </button>
              </div>
            </form>
          ) : (
            <div className="mt-4 rounded-[1.5rem] border border-line bg-white/75 p-5 text-sm leading-7 text-muted">
              {content.noReviewPermission}
            </div>
          )}
        </article>

        <article className={`${panelClass} p-6`}>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.22em] text-muted">{content.usersEyebrow}</p>
              <h2 className="mt-2 text-2xl font-semibold text-foreground">{content.usersTitle}</h2>
            </div>
            <span className="rounded-full border border-line bg-white px-3 py-1 text-xs text-muted">
              {merchant.users.length}
            </span>
          </div>
          <p className="mt-4 text-sm leading-7 text-muted">{content.usersDescription}</p>

          {canReview ? (
            <div className="mt-6 grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
              <form action={createMerchantUserAction} className="rounded-[1.5rem] border border-line bg-white/75 p-5">
                <input type="hidden" name="merchantId" value={merchant.id} />
                <input type="hidden" name="redirectTo" value={`/admin/merchants/${merchant.id}`} />
                <h3 className="text-lg font-semibold text-foreground">{content.createUserTitle}</h3>
                <div className="mt-4 grid gap-4">
                  <LabeledField label={content.userNameLabel}>
                    <input name="name" className={inputClass} />
                  </LabeledField>
                  <LabeledField label={content.userEmailLabel}>
                    <input name="email" type="email" className={inputClass} />
                  </LabeledField>
                  <LabeledField label={content.userRoleLabel}>
                    <select name="role" defaultValue="OWNER" className={inputClass}>
                      {(["OWNER", "OPS", "DEVELOPER", "VIEWER"] as const).map((role) => (
                        <option key={role} value={role}>
                          {getMerchantDisplayRole(role, locale)}
                        </option>
                      ))}
                    </select>
                  </LabeledField>
                  <LabeledField label={content.userPasswordLabel} hint={content.userPasswordHintCreate}>
                    <input name="password" type="password" className={inputClass} />
                  </LabeledField>
                  <LabeledField label={content.userConfirmPasswordLabel}>
                    <input name="confirmPassword" type="password" className={inputClass} />
                  </LabeledField>
                  <div className="rounded-[1.25rem] border border-line bg-white/70 p-4">
                    <label className="flex items-center gap-3 text-sm font-medium text-foreground">
                      <input
                        type="checkbox"
                        name="enabled"
                        defaultChecked
                        className="h-4 w-4 rounded border-line"
                      />
                      {content.userEnabledLabel}
                    </label>
                  </div>
                </div>
                <div className="mt-5">
                  <button type="submit" className={buttonClass}>
                    {content.createUserButton}
                  </button>
                </div>
              </form>

              <div className="space-y-4">
                {merchant.users.length === 0 ? (
                  <div className="rounded-[1.25rem] border border-dashed border-line p-6 text-sm leading-7 text-muted">
                    {content.noUsers}
                  </div>
                ) : (
                  merchant.users.map((user) => (
                    <form
                      key={user.id}
                      action={updateMerchantUserAction}
                      className="rounded-[1.25rem] border border-line bg-[#faf7f1] p-4"
                    >
                      <input type="hidden" name="id" value={user.id} />
                      <input type="hidden" name="merchantId" value={merchant.id} />
                      <input type="hidden" name="redirectTo" value={`/admin/merchants/${merchant.id}`} />
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="font-medium text-foreground">{user.name}</p>
                          <p className="mt-1 text-xs text-muted">{user.email}</p>
                        </div>
                        <StatusBadge tone={user.enabled ? "success" : "danger"}>
                          {user.enabled ? content.accountStatusEnabled : content.accountStatusDisabled}
                        </StatusBadge>
                      </div>
                      <div className="mt-4 grid gap-4 sm:grid-cols-2">
                        <LabeledField label={content.userNameLabel}>
                          <input name="name" defaultValue={user.name} className={inputClass} />
                        </LabeledField>
                        <LabeledField label={content.userEmailLabel}>
                          <input name="email" type="email" defaultValue={user.email} className={inputClass} />
                        </LabeledField>
                        <LabeledField label={content.userRoleLabel}>
                          <select name="role" defaultValue={user.role} className={inputClass}>
                            {(["OWNER", "OPS", "DEVELOPER", "VIEWER"] as const).map((role) => (
                              <option key={role} value={role}>
                                {getMerchantDisplayRole(role, locale)}
                              </option>
                            ))}
                          </select>
                        </LabeledField>
                        <div className="rounded-[1.25rem] border border-line bg-white/70 p-4">
                          <label className="flex items-center gap-3 text-sm font-medium text-foreground">
                            <input
                              type="checkbox"
                              name="enabled"
                              defaultChecked={user.enabled}
                              className="h-4 w-4 rounded border-line"
                            />
                            {content.userEnabledLabel}
                          </label>
                        </div>
                      </div>
                      <div className="mt-4 grid gap-4 sm:grid-cols-2">
                        <LabeledField label={content.userPasswordLabel} hint={content.userPasswordHintUpdate}>
                          <input name="password" type="password" className={inputClass} />
                        </LabeledField>
                        <LabeledField label={content.userConfirmPasswordLabel}>
                          <input name="confirmPassword" type="password" className={inputClass} />
                        </LabeledField>
                      </div>
                      <div className="mt-4 flex flex-wrap gap-3 text-xs text-muted">
                        <span className="rounded-full border border-line bg-white px-3 py-1">
                          {content.lastLoginCol} {formatDateTime(user.lastLoginAt, locale)}
                        </span>
                        <span className="rounded-full border border-line bg-white px-3 py-1">
                          {content.loginCreatedAtCol} {formatDateTime(user.createdAt, locale)}
                        </span>
                      </div>
                      <div className="mt-4">
                        <button
                          type="submit"
                          className="rounded-xl border border-line bg-white px-3 py-2 text-xs font-medium text-foreground"
                        >
                          {content.saveUserButton}
                        </button>
                      </div>
                    </form>
                  ))
                )}
              </div>
            </div>
          ) : (
            <div className="mt-6 rounded-[1.25rem] border border-line bg-white/75 p-5 text-sm leading-7 text-muted">
              {content.noUserManagePermission}
            </div>
          )}
        </article>

        <article className={`${panelClass} p-6`}>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.22em] text-muted">{content.routingEyebrow}</p>
              <h2 className="mt-2 text-2xl font-semibold text-foreground">{content.routingTitle}</h2>
            </div>
            <Link href="/admin/bindings" className="rounded-2xl border border-line bg-white/80 px-4 py-2.5 text-sm font-medium text-foreground">
              {content.routingButton}
            </Link>
          </div>

          {merchant.channelBindings.length === 0 ? (
            <div className="mt-6 rounded-[1.25rem] border border-dashed border-line p-6 text-sm leading-7 text-muted">
              {content.noBindings}
            </div>
          ) : (
            <div className={`mt-6 ${tableWrapperClass}`}>
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-[#f3e7d7] text-xs uppercase tracking-[0.18em] text-muted">
                    <tr>
                      <th className="px-4 py-3">{content.channelCol}</th>
                      <th className="px-4 py-3">{content.targetCol}</th>
                      <th className="px-4 py-3">{content.scopeCol}</th>
                      <th className="px-4 py-3">{content.statusCol}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {merchant.channelBindings.map((binding) => (
                      <tr key={binding.id} className="border-t border-line/70">
                        <td className="px-4 py-4 font-mono text-xs text-foreground">{binding.channelCode}</td>
                        <td className="px-4 py-4 text-xs text-muted">
                          {binding.merchantChannelAccount ? (
                            <>
                              <p className="text-foreground">
                                {content.merchantInstancePrefix} · {binding.merchantChannelAccount.displayName}
                              </p>
                              <p className="mt-1 font-mono">
                                {binding.merchantChannelAccount.callbackToken}
                              </p>
                            </>
                          ) : binding.providerAccount ? (
                            <>
                              <p className="text-[#9b3d18]">
                                {content.legacyPrefix} · {binding.providerAccount.displayName}
                              </p>
                              <p className="mt-1">{content.migrateHint}</p>
                            </>
                          ) : (
                            content.autoRoute
                          )}
                        </td>
                        <td className="px-4 py-4 text-xs text-muted">
                          <p>{content.minAmount} {formatMoney(binding.minAmount?.toString() ?? null, "CNY", locale)}</p>
                          <p className="mt-1">{content.maxAmount} {formatMoney(binding.maxAmount?.toString() ?? null, "CNY", locale)}</p>
                        </td>
                        <td className="px-4 py-4">
                          <StatusBadge tone={binding.enabled ? "success" : "danger"}>
                            {binding.enabled ? content.enabled : content.disabled}
                          </StatusBadge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </article>
      </section>

      <section className={`${panelClass} p-6`}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.22em] text-muted">{content.channelInstancesEyebrow}</p>
            <h2 className="mt-2 text-2xl font-semibold text-foreground">{content.channelInstancesTitle}</h2>
          </div>
          <span className="rounded-full border border-line bg-white px-3 py-1 text-xs text-muted">
            {content.instanceCount(merchant.channelAccounts.length)}
          </span>
        </div>

        {merchant.channelAccounts.length === 0 ? (
          <div className="mt-6 rounded-[1.25rem] border border-dashed border-line p-6 text-sm leading-7 text-muted">
            {content.noAccounts}
          </div>
        ) : (
          <div className="mt-6 grid gap-4 xl:grid-cols-2">
            {merchant.channelAccounts.map((account) => (
              <article key={account.id} className="rounded-[1.25rem] border border-line bg-white/75 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-foreground">{account.displayName}</p>
                    <p className="mt-1 font-mono text-xs text-muted">{account.channelCode}</p>
                  </div>
                  <StatusBadge tone={account.enabled ? "success" : "danger"}>
                    {account.enabled ? content.activeStatus : content.inactiveStatus}
                  </StatusBadge>
                </div>
                <p className="mt-3 font-mono text-xs text-muted">{account.callbackToken}</p>
                <p className="mt-2 text-xs text-muted">{content.accountUpdatedAt} {formatDateTime(account.updatedAt, locale)}</p>
                <p className="mt-1 text-xs text-muted">{content.accountVerifiedAt} {formatDateTime(account.lastVerifiedAt, locale)}</p>
                {account.lastErrorMessage ? (
                  <p className="mt-2 text-xs text-[#9b3d18]">{content.accountError}：{account.lastErrorMessage}</p>
                ) : null}
              </article>
            ))}
          </div>
        )}
      </section>

      <section className={`${panelClass} p-6`}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.22em] text-muted">{content.credentialsEyebrow}</p>
            <h2 className="mt-2 text-2xl font-semibold text-foreground">{content.credentialsTitle}</h2>
          </div>
          <p className="max-w-2xl text-sm leading-7 text-muted">
            {content.credentialsDescription}
          </p>
        </div>

        <div className="mt-6 grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
          <form action={createMerchantApiCredentialAction} className="rounded-[1.5rem] border border-line bg-white/75 p-5">
            <input type="hidden" name="merchantId" value={merchant.id} />
            <input type="hidden" name="redirectTo" value={`/admin/merchants/${merchant.id}`} />
            <h3 className="text-lg font-semibold text-foreground">{content.createCredentialTitle}</h3>
            <div className="mt-4 grid gap-4">
              <LabeledField label={content.credentialLabel}>
                <input name="label" placeholder={content.credentialLabelPlaceholder} className={inputClass} />
              </LabeledField>
              <LabeledField label={content.expiresAtLabel}>
                <input name="expiresAt" type="datetime-local" className={inputClass} />
              </LabeledField>
            </div>
            <div className="mt-5">
              <button type="submit" className={buttonClass}>
                {content.createCredentialButton}
              </button>
            </div>
          </form>

          <div className={`rounded-[1.5rem] border border-line bg-white/75 p-5 ${merchant.apiCredentials.length === 0 ? "" : ""}`}>
            {merchant.apiCredentials.length === 0 ? (
              <div className="rounded-[1.25rem] border border-dashed border-line p-6 text-sm leading-7 text-muted">
                {content.noCredentials}
              </div>
            ) : (
              <div className="space-y-4">
                {merchant.apiCredentials.map((credential) => (
                  <form
                    key={credential.id}
                    action={updateMerchantApiCredentialStatusAction}
                    className="rounded-[1.25rem] border border-line bg-[#faf7f1] p-4"
                  >
                    <input type="hidden" name="id" value={credential.id} />
                    <input type="hidden" name="redirectTo" value={`/admin/merchants/${merchant.id}`} />
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="font-medium text-foreground">{credential.label}</p>
                        <p className="mt-1 font-mono text-xs text-muted">{credential.keyId}</p>
                        <p className="mt-1 text-xs text-muted">{content.secretPreview}: {credential.secretPreview}</p>
                      </div>
                      <StatusBadge tone={credential.enabled ? "success" : "danger"}>
                        {credential.enabled ? content.enabled : content.disabled}
                      </StatusBadge>
                    </div>
                    <div className="mt-4 grid gap-4 sm:grid-cols-2">
                      <LabeledField label={content.expiresAtLabel}>
                        <input
                          name="expiresAt"
                          type="datetime-local"
                          defaultValue={
                            credential.expiresAt
                              ? new Date(credential.expiresAt.getTime() - credential.expiresAt.getTimezoneOffset() * 60_000)
                                  .toISOString()
                                  .slice(0, 16)
                              : ""
                          }
                          className={inputClass}
                        />
                      </LabeledField>
                      <div className="rounded-[1.25rem] border border-line bg-white/70 p-4">
                        <label className="flex items-center gap-3 text-sm font-medium text-foreground">
                          <input
                            type="checkbox"
                            name="enabled"
                            defaultChecked={credential.enabled}
                            className="h-4 w-4 rounded border-line"
                          />
                          {content.credentialToggleLabel}
                        </label>
                      </div>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-3 text-xs text-muted">
                      <span className="rounded-full border border-line bg-white px-3 py-1">
                        {content.credentialCreatedAt} {formatDateTime(credential.createdAt, locale)}
                      </span>
                      <span className="rounded-full border border-line bg-white px-3 py-1">
                        {content.credentialLastUsedAt} {formatDateTime(credential.lastUsedAt, locale)}
                      </span>
                    </div>
                    <div className="mt-4">
                      <button type="submit" className="rounded-xl border border-line bg-white px-3 py-2 text-xs font-medium text-foreground">
                        {content.saveCredential}
                      </button>
                    </div>
                  </form>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      <section className={`${panelClass} p-6`}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.22em] text-muted">{content.recentEyebrow}</p>
            <h2 className="mt-2 text-2xl font-semibold text-foreground">{content.recentTitle}</h2>
          </div>
          <div className="flex flex-col gap-3 sm:items-end">
            <p className="max-w-xl text-sm leading-7 text-muted">{content.recentDesc}</p>
            <Link href={`/admin/orders?merchantCode=${merchant.code}`} className="rounded-2xl border border-line bg-white/80 px-4 py-2.5 text-sm font-medium text-foreground">
              {content.recentButton}
            </Link>
          </div>
        </div>

        <div className={`mt-6 ${tableWrapperClass}`}>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-[#f3e7d7] text-xs uppercase tracking-[0.18em] text-muted">
                <tr>
                  <th className="px-4 py-3">{content.orderCol}</th>
                  <th className="px-4 py-3">{content.channelCol}</th>
                  <th className="px-4 py-3">{content.amountCol}</th>
                  <th className="px-4 py-3">{content.paymentStatusCol}</th>
                  <th className="px-4 py-3">{content.callbackStatusCol}</th>
                  <th className="px-4 py-3">{content.timeCol}</th>
                </tr>
              </thead>
              <tbody>
                {merchant.paymentOrders.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-sm text-muted">
                      {content.noRecentOrders}
                    </td>
                  </tr>
                ) : (
                  merchant.paymentOrders.map((order) => (
                    <tr key={order.id} className="border-t border-line/70">
                      <td className="px-4 py-4">
                        <p className="font-mono text-xs text-foreground">{order.id}</p>
                        <p className="mt-1 text-xs text-muted">{order.externalOrderId}</p>
                      </td>
                      <td className="px-4 py-4 font-mono text-xs text-foreground">{order.channelCode}</td>
                      <td className="px-4 py-4 text-xs text-foreground">
                        {formatMoney(order.amount.toString(), "CNY", locale)}
                      </td>
                      <td className="px-4 py-4">
                        <StatusBadge tone={getPaymentStatusTone(order.status)}>
                          {getPaymentStatusLabel(order.status, locale)}
                        </StatusBadge>
                        <p className="mt-2 text-xs text-muted">{order.providerStatus ?? content.noProviderStatus}</p>
                      </td>
                      <td className="px-4 py-4 text-xs text-muted">
                        {getCallbackStatusLabel(order.callbackStatus, locale)}
                      </td>
                      <td className="px-4 py-4 text-xs text-muted">
                        <p>{content.createdPrefix} {formatDateTime(order.createdAt, locale)}</p>
                        <p className="mt-1">{content.paidPrefix} {formatDateTime(order.paidAt, locale)}</p>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}
