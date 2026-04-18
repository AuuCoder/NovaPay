import Link from "next/link";
import {
  formatDateTime,
  getMerchantStatusLabel,
  getMerchantStatusTone,
  type SearchParamsInput,
} from "@/app/admin/support";
import {
  AdminPageHeader,
  FlashMessage,
  LabeledField,
  StatusBadge,
  buttonClass,
  inputClass,
  panelClass,
  subtleButtonClass,
  textareaClass,
} from "@/app/admin/ui";
import { updateMerchantProfileAction } from "@/app/merchant/actions";
import { loadMerchantDashboardData } from "@/app/merchant/(console)/dashboard-data";
import { getCurrentLocale } from "@/lib/i18n-server";
import { getMerchantEditableName } from "@/lib/merchant-profile-completion";

export default async function MerchantProfilePage({
  searchParams,
}: {
  searchParams?: SearchParamsInput;
}) {
  const locale = await getCurrentLocale();
  const {
    messages,
    merchantDisplayName,
    merchant,
    canEditProfile,
    canReadChannels,
    canReadOrders,
    canReadRefunds,
    profileMissingFields,
    isProfileComplete,
  } = await loadMerchantDashboardData(searchParams, { locale });

  const content =
    locale === "en"
      ? {
          eyebrow: "Merchant Profile",
          description:
            "Maintain merchant identity, callback settings, and security parameters here. Channel routing and upstream account onboarding remain on the dedicated channel page.",
          integration: "Integration",
          credentials: "API Credentials",
          channels: "Channels",
          orders: "Orders",
          refunds: "Refunds",
          docs: "API Docs",
          profileEyebrow: "Profile",
          profileTitle: "Merchant integration profile",
          profileIntroTitle: "Complete only what your channel scenario requires",
          profileIntroDesc:
            "Basic API signing can start before the full company profile is complete. Official regulated channels such as Alipay or WeChat Pay will require the fields below before activation.",
          profileCoreFieldsTitle: "Required for official channels",
          profileCoreFields:
            "Merchant Name, Legal Entity Name, Contact Name, Contact Phone, and Business Registration ID.",
          profileAdvancedFieldsTitle: "Advanced settings that can stay blank at first",
          profileAdvancedFields:
            "Optional business callback URL, API IP whitelist, callback signing secret, and business note.",
          callbackEnabledStatus: "Business callbacks enabled",
          callbackDisabledStatus: "Business callbacks disabled",
          readOnlyProfile:
            "This role can view merchant settings but cannot edit profile or security parameters.",
          merchantNameLabel: "Merchant Name",
          legalNameLabel: "Legal Entity Name",
          merchantCodeLabel: "Merchant Code",
          registrationIdLabel: "Business Registration ID",
          contactNameLabel: "Contact Name",
          contactEmailLabel: "Contact Email",
          contactPhoneLabel: "Contact Phone",
          callbackBaseLabel: "Default Business Callback URL (Optional)",
          callbackBaseHint:
            "Fill this only when your own backend needs NovaPay asynchronous business notifications. Leaving it blank does not affect basic payment collection. If you enter only a domain or path, the system will complete `https://` automatically.",
          callbackBasePlaceholder: "https://merchant.example.com/api/payments/callback",
          callbackBaseCardTitle: "When this should be configured",
          callbackBaseCardEmpty:
            "Not configured. This does not affect basic payment collection. You can leave it blank until your own backend needs asynchronous notifications.",
          callbackBaseCardConfigured:
            "Configured. NovaPay will deliver merchant-side business notifications here after payment or refund status changes.",
          callbackBaseCardExample:
            "Example: https://merchant.example.com/api/payments/novapay/callback",
          ipWhitelistLabel: "API IP Whitelist",
          ipWhitelistHint:
            "Enter one source IP per line or separate them with commas. Only these IPs can access the signed API after configuration.",
          callbackToggleLabel: "Enable merchant business callback notifications",
          notifySecretLabel: "Callback Signing Secret",
          notifySecretHintConfigured:
            "A business callback signing secret is already configured. Leave blank to keep it, or enter a new value to rotate it.",
          notifySecretHintEmpty:
            "No business callback signing secret is configured yet. A new value will be encrypted and stored automatically.",
          onboardingNoteLabel: "Business Note",
          onboardingNoteHint:
            "Add business type, expected volume, or requested payment channels for platform review.",
          createdAt: "Created",
          updatedAt: "Updated",
          statusChangedAt: "Status Changed",
          saveProfile: "Save Merchant Profile",
          profileIncompleteTitle: "Additional profile is required for regulated channels",
          profileIncompleteDesc:
            "If you plan to enable official regulated channels such as Alipay or WeChat Pay, complete the following fields first.",
          profileIncompleteFields: "Missing fields",
          profileIncompleteHint:
            "Lower-risk channels can stay lightweight later, but regulated official channels will enforce these fields before activation.",
          pendingApproval:
            "This merchant workspace is not currently allowed to create new orders. Resume access after the merchant status returns to approved.",
          reviewNote: "Platform Note",
          routingCardTitle: "Payment channel routing is managed separately",
          routingCardDesc:
            "Create or enable official payment channel instances, set defaults, and verify upstream callback addresses on the dedicated channel page.",
          routingCardCta: "Open Channels",
        }
      : {
          eyebrow: "商户配置",
          description:
            "这里专门维护商户资料、业务回调和安全参数。支付通道路由、上游账号参数等内容统一放在独立的支付通道页处理。",
          integration: "接入参数",
          credentials: "API 凭证",
          channels: "支付通道",
          orders: "订单列表",
          refunds: "退款管理",
          docs: "API 文档",
          profileEyebrow: "商户资料",
          profileTitle: "商户接入配置",
          profileIntroTitle: "按实际通道场景补充配置即可",
          profileIntroDesc:
            "如果当前只是先做 API 签名和基础联调，企业资料可以后补。只有在准备启用支付宝、微信支付等官方高合规通道时，才需要先补齐下面这些字段。",
          profileCoreFieldsTitle: "官方通道必填资料",
          profileCoreFields:
            "商户名称、企业主体名称、联系人、联系电话、统一社会信用代码。",
          profileAdvancedFieldsTitle: "可后配的高级项",
          profileAdvancedFields:
            "默认业务回调地址（可选）、API IP 白名单、回调验签密钥、入驻补充说明。",
          callbackEnabledStatus: "业务回调已启用",
          callbackDisabledStatus: "业务回调已停用",
          readOnlyProfile: "当前角色仅可查看商户资料，不能修改接入参数与安全配置。",
          merchantNameLabel: "商户名称",
          legalNameLabel: "企业主体名称",
          merchantCodeLabel: "商户编码",
          registrationIdLabel: "统一社会信用代码",
          contactNameLabel: "联系人",
          contactEmailLabel: "联系邮箱",
          contactPhoneLabel: "联系电话",
          callbackBaseLabel: "默认业务回调地址（可选）",
          callbackBaseHint:
            "只有你的业务系统需要接收 NovaPay 的支付、退款等异步通知时，才需要填写。留空不会影响基础收款；如果你只填写域名或域名路径，系统会自动补全 `https://`。",
          callbackBasePlaceholder: "https://merchant.example.com/api/payments/callback",
          callbackBaseCardTitle: "这个字段什么时候需要填写",
          callbackBaseCardEmpty:
            "当前未配置，不影响基础收款。等你的业务系统需要异步接收支付或退款结果时，再补充即可。",
          callbackBaseCardConfigured:
            "当前已配置。支付、退款等状态变化后，NovaPay 会把商户业务通知投递到这个地址。",
          callbackBaseCardExample:
            "示例：https://merchant.example.com/api/payments/novapay/callback",
          ipWhitelistLabel: "API IP 白名单",
          ipWhitelistHint:
            "每行或逗号分隔一个来源 IP。配置后，只有来自这些 IP 的请求才会通过验签。",
          callbackToggleLabel: "启用商户业务回调通知",
          notifySecretLabel: "回调验签密钥",
          notifySecretHintConfigured:
            "当前已配置业务回调验签密钥。留空表示不修改当前密钥，输入新值会替换现有密钥。",
          notifySecretHintEmpty:
            "当前未配置业务回调验签密钥。输入后会自动加密保存。",
          onboardingNoteLabel: "入驻补充说明",
          onboardingNoteHint: "可补充业务类型、交易规模、希望开通的支付通道。",
          createdAt: "创建于",
          updatedAt: "更新于",
          statusChangedAt: "状态更新时间",
          saveProfile: "保存商户配置",
          profileIncompleteTitle: "官方通道资料待补齐",
          profileIncompleteDesc:
            "如果你计划启用支付宝、微信支付等高合规官方通道，请先补齐以下商户主体资料。",
          profileIncompleteFields: "待补充字段",
          profileIncompleteHint:
            "后续新增的低风险通道可以保持轻量接入，但高合规官方通道会在启用前强制校验这些字段。",
          pendingApproval:
            "当前商户暂未开放新订单创建能力。恢复为通过状态后，才可继续发起支付订单。",
          reviewNote: "平台备注",
          routingCardTitle: "支付通道路由单独管理",
          routingCardDesc:
            "支付通道实例创建、默认路由设置、上游回调地址获取等内容，请统一前往支付通道页操作。",
          routingCardCta: "前往支付通道页",
        };

  const actionButtonClass = `${buttonClass} w-full sm:w-auto`;

  return (
    <div className="space-y-8">
      <AdminPageHeader
        eyebrow={content.eyebrow}
        title={merchantDisplayName}
        description={content.description}
        actions={
          <div className="grid w-full gap-3 sm:flex sm:flex-wrap sm:justify-end">
            <Link href="/merchant/integration" className={actionButtonClass}>
              {content.integration}
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

      <section className={`${panelClass} p-5 sm:p-6`}>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.22em] text-muted">
              {content.profileEyebrow}
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-foreground">
              {content.profileTitle}
            </h2>
          </div>
          <div className="flex flex-wrap gap-2">
            <StatusBadge tone={getMerchantStatusTone(merchant.status)}>
              {getMerchantStatusLabel(merchant.status, locale)}
            </StatusBadge>
            <StatusBadge tone={merchant.callbackEnabled ? "success" : "danger"}>
              {merchant.callbackEnabled
                ? content.callbackEnabledStatus
                : content.callbackDisabledStatus}
            </StatusBadge>
          </div>
        </div>

        {!canEditProfile ? (
          <div className="mt-6 rounded-[1.25rem] border border-[#f3d1ab] bg-[#fff4e7] p-4 text-sm text-[#8a4d18]">
            {content.readOnlyProfile}
          </div>
        ) : null}

        <div className="mt-6 rounded-[1.25rem] border border-[#d8e4f5] bg-[#f7fbff] p-4 text-sm text-[#36506f]">
          <div className="flex flex-wrap items-center gap-3">
            <StatusBadge tone="info">{content.profileIntroTitle}</StatusBadge>
            <span>{content.profileIntroDesc}</span>
          </div>
          <p className="mt-3 leading-7">
            {content.profileCoreFieldsTitle}
            {locale === "en" ? ": " : "："}
            {content.profileCoreFields}
          </p>
          <p className="mt-2 leading-7">
            {content.profileAdvancedFieldsTitle}
            {locale === "en" ? ": " : "："}
            {content.profileAdvancedFields}
          </p>
        </div>

        <form action={updateMerchantProfileAction} className="mt-6 grid gap-4">
          <input type="hidden" name="redirectTo" value="/merchant/profile" />

          <div className="grid gap-4 sm:grid-cols-2">
            <LabeledField label={content.merchantNameLabel}>
              <input
                name="merchantName"
                defaultValue={getMerchantEditableName(merchant.name)}
                className={inputClass}
              />
            </LabeledField>
            <LabeledField label={content.legalNameLabel}>
              <input
                name="legalName"
                defaultValue={merchant.legalName ?? ""}
                className={inputClass}
              />
            </LabeledField>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <LabeledField label={content.merchantCodeLabel}>
              <input value={merchant.code} disabled className={`${inputClass} bg-[#f6f1ea] text-muted`} />
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
              <input
                name="contactName"
                defaultValue={merchant.contactName ?? ""}
                className={inputClass}
              />
            </LabeledField>
            <LabeledField label={content.contactEmailLabel}>
              <input
                name="contactEmail"
                defaultValue={merchant.contactEmail ?? ""}
                className={inputClass}
              />
            </LabeledField>
            <LabeledField label={content.contactPhoneLabel}>
              <input
                name="contactPhone"
                defaultValue={merchant.contactPhone ?? ""}
                className={inputClass}
              />
            </LabeledField>
          </div>

          <LabeledField label={content.callbackBaseLabel} hint={content.callbackBaseHint}>
            <input
              name="callbackBase"
              defaultValue={merchant.callbackBase ?? ""}
              placeholder={content.callbackBasePlaceholder}
              className={inputClass}
            />
          </LabeledField>

          <div className="rounded-[1.25rem] border border-[#d8e4f5] bg-[#f7fbff] p-4 text-sm text-[#36506f]">
            <p className="font-medium text-foreground">{content.callbackBaseCardTitle}</p>
            <p className="mt-2 leading-7">
              {merchant.callbackBase
                ? content.callbackBaseCardConfigured
                : content.callbackBaseCardEmpty}
            </p>
            <p className="mt-2 font-mono text-xs leading-6 text-muted">
              {content.callbackBaseCardExample}
            </p>
          </div>

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
            label={content.notifySecretLabel}
            hint={
              merchant.notifySecret
                ? content.notifySecretHintConfigured
                : content.notifySecretHintEmpty
            }
          >
            <textarea
              name="notifySecret"
              defaultValue=""
              className={`${textareaClass} min-h-[110px] font-sans text-sm`}
            />
          </LabeledField>

          <LabeledField label={content.onboardingNoteLabel} hint={content.onboardingNoteHint}>
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
            {canEditProfile ? (
              <button type="submit" className={actionButtonClass}>
                {content.saveProfile}
              </button>
            ) : null}
          </div>
        </form>
      </section>

      {canReadChannels ? (
        <section className={`${panelClass} p-5 sm:p-6`}>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.22em] text-muted">
                {content.channels}
              </p>
              <h2 className="mt-2 text-2xl font-semibold text-foreground">
                {content.routingCardTitle}
              </h2>
              <p className="mt-3 max-w-3xl text-sm leading-7 text-muted">
                {content.routingCardDesc}
              </p>
            </div>
            <Link href="/merchant/channels" className={subtleButtonClass}>
              {content.routingCardCta}
            </Link>
          </div>
        </section>
      ) : null}
    </div>
  );
}
