import Link from "next/link";
import {
  formatDateTime,
  readPageMessages,
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
  textareaClass,
} from "@/app/admin/ui";
import {
  createMerchantChannelAccountAction,
  updateMerchantChannelAccountAction,
} from "@/app/merchant/actions";
import {
  buildMerchantChannelCallbackUrl,
  getMerchantChannelTemplates,
  maskMerchantChannelConfig,
} from "@/lib/merchant-channel-accounts";
import { getMerchantProfileMissingFields } from "@/lib/merchant-profile-completion";
import { getCurrentLocale } from "@/lib/i18n-server";
import { hasMerchantPermission } from "@/lib/merchant-rbac";
import { requireMerchantPermission } from "@/lib/merchant-session";
import { getPrismaClient } from "@/lib/prisma";

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function MerchantChannelsPage({
  searchParams,
}: {
  searchParams?: SearchParamsInput;
}) {
  const session = await requireMerchantPermission("channel:read");
  const prisma = getPrismaClient();
  const resolvedSearchParams = (await searchParams) ?? {};
  const messages = await readPageMessages(resolvedSearchParams);
  const locale = await getCurrentLocale();
  const merchantChannelTemplates = getMerchantChannelTemplates(locale);
  const canManageChannels = hasMerchantPermission(session.merchantUser.role, "channel:write");
  const merchant = await prisma.merchant.findUnique({
    where: {
      id: session.merchantUser.merchantId,
    },
    select: {
      id: true,
      code: true,
      name: true,
      legalName: true,
      contactName: true,
      contactPhone: true,
      companyRegistrationId: true,
      channelBindings: {
        select: {
          channelCode: true,
          merchantChannelAccountId: true,
          enabled: true,
        },
      },
      channelAccounts: {
        orderBy: [{ channelCode: "asc" }, { createdAt: "desc" }],
      },
    },
  });

  if (!merchant) {
    return null;
  }

  const bindingsByChannel = new Map(
    merchant.channelBindings.map((binding) => [binding.channelCode, binding]),
  );
  const profileMissingFields = getMerchantProfileMissingFields(merchant, locale);
  const hasProfileGaps = profileMissingFields.length > 0;
  const hasRegulatedTemplates = merchantChannelTemplates.some(
    (template) => template.requiresMerchantProfileCompletion,
  );
  const requestedChannelCode = firstValue(resolvedSearchParams.channel);
  const selectedTemplate =
    merchantChannelTemplates.find((template) => template.channelCode === requestedChannelCode) ??
    merchantChannelTemplates[0] ??
    null;

  if (!selectedTemplate) {
    return null;
  }

  const selectedDefaultBinding = bindingsByChannel.get(selectedTemplate.channelCode);
  const selectedAccounts = merchant.channelAccounts.filter(
    (account) => account.channelCode === selectedTemplate.channelCode,
  );
  const selectedTemplateBlockedByProfile =
    selectedTemplate.requiresMerchantProfileCompletion && hasProfileGaps;
  const selectedChannelHref = `/merchant/channels?channel=${selectedTemplate.channelCode}`;
  const content =
    locale === "en"
      ? {
          eyebrow: "Channel Management",
          title: "Merchant-owned payment channel instances",
          description:
            "Maintain merchant-owned payment channel instances here. After Alipay or WeChat Pay credentials are recorded, NovaPay generates a dedicated upstream payment callback URL and route token for each instance.",
          selectorEyebrow: "Channel Selection",
          selectorTitle: "Choose a payment channel",
          selectorDesc:
            "Select one channel to view the exact required fields and manage only that channel's instances.",
          profileTitle: "Additional profile required for regulated channels",
          profileDesc:
            "Official regulated channels such as Alipay and WeChat Pay require the merchant legal entity and contact profile before first activation. Draft channel configs can still be saved in advance.",
          missingFields: "Missing fields",
          profileCardTitle: "Profile check before activation",
          profileCardDesc:
            "This channel requires legal entity and contact details before it can be enabled. You can still save the configuration as a draft first.",
          createEyebrow: "Create Channel",
          defaultReady: "Default instance configured",
          defaultMissing: "No default instance yet",
          generatedTitle: "NovaPay will generate automatically after creation:",
          generatedFirst: "1. A dedicated upstream payment callback URL for this merchant channel instance",
          generatedSecond: "2. A unique upstream route token `callbackToken` for this instance",
          readonly: "Your current role can view payment channel instances but cannot create or update them.",
          instanceName: "Instance Name",
          required: "Required",
          optional: "Optional",
          remark: "Remark",
          remarkPlaceholder: "Describe account usage, business line, or environment notes",
          enableNow: "Enable immediately after creation",
          enableAfterProfile: "Complete the merchant profile first to enable this channel",
          setDefault: "Set as the default instance for this channel",
          createButton: "Create Channel Instance",
          createDraftButton: "Save Draft Instance",
          listEyebrow: "Channel Instances",
          totalInstances: "Total {count} instances",
          empty: "No instances for {title} yet. After creation, they can be used for this merchant's payment orders.",
          enabled: "Enabled",
          disabled: "Disabled",
          defaultBadge: "Default Instance",
          callbackUrl: "Upstream Payment Callback URL",
          callbackToken: "Upstream Route Token",
          createdAt: "Created At",
          updatedAt: "Updated At",
          verifiedAt: "Last Verified",
          lastError: "Last Error",
          enableInstance: "Enable instance",
          enableLocked: "Profile completion required before enabling",
          setDefaultInstance: "Set as default instance",
          saveButton: "Save Instance",
          saveDraftButton: "Save Draft Changes",
        }
      : {
          eyebrow: "通道管理",
          title: "支付通道实例",
          description:
            "在此维护商户自有支付通道实例。录入支付宝或微信支付参数后，系统会为每个实例生成独立上游支付回调地址与路由标识。",
          selectorEyebrow: "支付通道",
          selectorTitle: "选择需要配置的支付通道",
          selectorDesc: "先选择通道，再查看该通道对应的字段和已有实例，避免不同通道参数同时铺开。",
          profileTitle: "高合规通道需补齐资料",
          profileDesc:
            "支付宝、微信支付等高合规官方通道在首次启用前，必须补齐商户主体与联系人资料。你仍然可以先保存草稿配置。",
          missingFields: "待补充字段",
          profileCardTitle: "启用前资料校验",
          profileCardDesc: "该通道属于高合规通道，启用前需要补齐商户主体资料；未补齐时仍可先保存草稿。",
          createEyebrow: "创建实例",
          defaultReady: "已有默认实例",
          defaultMissing: "尚未设默认实例",
          generatedTitle: "创建后系统会自动生成：",
          generatedFirst: "1. 当前商户当前通道实例的上游支付回调地址",
          generatedSecond: "2. 当前实例唯一的上游路由标识 `callbackToken`",
          readonly: "当前角色只能查看支付通道实例，不能新增或更新。",
          instanceName: "实例名称",
          required: "必填",
          optional: "选填",
          remark: "备注",
          remarkPlaceholder: "可填写账号用途、业务线或环境说明",
          enableNow: "创建后立即启用",
          enableAfterProfile: "请先补齐商户资料后再启用该通道",
          setDefault: "设为当前通道默认实例",
          createButton: "创建通道实例",
          createDraftButton: "保存草稿实例",
          listEyebrow: "实例列表",
          totalInstances: "当前共 {count} 个实例",
          empty: "当前还没有 {title} 实例。创建后即可用于当前商户自己的支付订单。",
          enabled: "启用中",
          disabled: "已停用",
          defaultBadge: "默认实例",
          callbackUrl: "上游支付回调地址",
          callbackToken: "上游路由标识",
          createdAt: "创建于",
          updatedAt: "更新于",
          verifiedAt: "最近校验",
          lastError: "最近错误",
          enableInstance: "启用实例",
          enableLocked: "补齐资料后才可启用",
          setDefaultInstance: "设为默认实例",
          saveButton: "保存实例",
          saveDraftButton: "保存草稿修改",
        };

  return (
    <div className="space-y-8">
      <AdminPageHeader
        eyebrow={content.eyebrow}
        title={content.title}
        description={content.description}
      />

      <FlashMessage success={messages.success} error={messages.error} />

      {hasRegulatedTemplates && hasProfileGaps ? (
        <section className="rounded-[1.5rem] border border-[#f3d1ab] bg-[#fff4e7] p-5 text-sm text-[#8a4d18]">
          <div className="flex flex-wrap items-center gap-3">
            <StatusBadge tone="warning">{content.profileTitle}</StatusBadge>
            <span>{content.profileDesc}</span>
          </div>
          <p className="mt-3 leading-7">
            {content.missingFields}
            {locale === "en" ? ": " : "："}
            {profileMissingFields.join(locale === "en" ? ", " : "、")}
          </p>
        </section>
      ) : null}

      <section className={`${panelClass} p-5 sm:p-6`}>
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.22em] text-muted">{content.selectorEyebrow}</p>
            <h2 className="mt-2 text-2xl font-semibold text-foreground">{content.selectorTitle}</h2>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-muted">{content.selectorDesc}</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {merchantChannelTemplates.map((template) => {
              const isActive = template.channelCode === selectedTemplate.channelCode;
              const defaultBinding = bindingsByChannel.get(template.channelCode);

              return (
                <Link
                  key={template.channelCode}
                  href={`/merchant/channels?channel=${template.channelCode}`}
                  className={
                    isActive
                      ? "block rounded-[1.25rem] border border-accent bg-accent px-4 py-3 text-white shadow-[0_16px_40px_rgba(217,108,31,0.22)]"
                      : "block rounded-[1.25rem] border border-line bg-white/80 px-4 py-3 text-left text-foreground transition hover:border-accent hover:text-accent"
                  }
                >
                  <div className="flex h-full flex-col gap-2">
                    <div>
                      <p className="text-sm font-semibold">{template.title}</p>
                      <p className={`mt-1 text-xs ${isActive ? "text-white/80" : "text-muted"}`}>
                        {template.channelCode}
                      </p>
                    </div>
                    <span
                      className={`inline-flex w-fit rounded-full border px-2.5 py-1 text-[11px] ${
                        isActive
                          ? "border-white/20 bg-white/10 text-white"
                          : "border-line bg-white text-muted"
                      }`}
                    >
                      {defaultBinding?.enabled ? content.defaultReady : content.defaultMissing}
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      <section className="grid gap-6">
        <article className={`${panelClass} p-6`}>
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.22em] text-muted">{content.createEyebrow}</p>
              <h2 className="mt-2 text-2xl font-semibold text-foreground">{selectedTemplate.title}</h2>
            </div>
            <StatusBadge tone={selectedDefaultBinding?.enabled ? "success" : "warning"}>
              {selectedDefaultBinding?.enabled ? content.defaultReady : content.defaultMissing}
            </StatusBadge>
          </div>
          <p className="mt-3 text-sm leading-7 text-muted">{selectedTemplate.description}</p>
          <div className="mt-4 rounded-[1.25rem] border border-dashed border-line bg-white/65 p-4 text-sm leading-7 text-muted">
            {content.generatedTitle}
            <br />
            {content.generatedFirst}
            <br />
            {content.generatedSecond}
          </div>

          {selectedTemplateBlockedByProfile ? (
            <div className="mt-4 rounded-[1.25rem] border border-[#f3d1ab] bg-[#fff4e7] p-4 text-sm text-[#8a4d18]">
              <p className="font-medium">{content.profileCardTitle}</p>
              <p className="mt-2 leading-7">{content.profileCardDesc}</p>
            </div>
          ) : null}

          {!canManageChannels ? (
            <div className="mt-6 rounded-[1.25rem] border border-[#f3d1ab] bg-[#fff4e7] p-4 text-sm text-[#8a4d18]">
              {content.readonly}
            </div>
          ) : null}

          <form action={createMerchantChannelAccountAction} className="mt-6 grid gap-4">
            <input type="hidden" name="redirectTo" value={selectedChannelHref} />
            <input type="hidden" name="channelCode" value={selectedTemplate.channelCode} />
            <LabeledField label={content.instanceName}>
              <input
                name="displayName"
                placeholder={`${selectedTemplate.title} / 正式环境`}
                className={inputClass}
              />
            </LabeledField>

            {selectedTemplate.fields.map((field) => (
              <LabeledField
                key={field.key}
                label={field.label}
                hint={field.required ? content.required : content.optional}
              >
                {field.multiline ? (
                  <textarea
                    name={`config_${field.key}`}
                    placeholder={field.placeholder}
                    className={`${textareaClass} min-h-[110px] font-sans text-sm`}
                  />
                ) : (
                  <input
                    name={`config_${field.key}`}
                    placeholder={field.placeholder}
                    className={inputClass}
                  />
                )}
              </LabeledField>
            ))}

            <LabeledField label={content.remark}>
              <textarea
                name="remark"
                placeholder={content.remarkPlaceholder}
                className={`${textareaClass} min-h-[90px] font-sans text-sm`}
              />
            </LabeledField>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-[1.25rem] border border-line bg-white/65 p-4">
                <label className="flex items-center gap-3 text-sm font-medium text-foreground">
                  <input
                    type="checkbox"
                    name="enabled"
                    defaultChecked={!selectedTemplateBlockedByProfile}
                    disabled={selectedTemplateBlockedByProfile}
                    className="h-4 w-4 rounded border-line"
                  />
                  {selectedTemplateBlockedByProfile ? content.enableAfterProfile : content.enableNow}
                </label>
              </div>
              <div className="rounded-[1.25rem] border border-line bg-white/65 p-4">
                <label className="flex items-center gap-3 text-sm font-medium text-foreground">
                  <input
                    type="checkbox"
                    name="setAsDefault"
                    defaultChecked={!selectedDefaultBinding}
                    className="h-4 w-4 rounded border-line"
                  />
                  {content.setDefault}
                </label>
              </div>
            </div>

            <div>
              {canManageChannels ? (
                <button type="submit" className={buttonClass}>
                  {selectedTemplateBlockedByProfile ? content.createDraftButton : content.createButton}
                </button>
              ) : null}
            </div>
          </form>
        </article>
      </section>

      <section className="grid gap-6">
        <article className={`${panelClass} p-6`}>
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.22em] text-muted">{content.listEyebrow}</p>
              <h2 className="mt-2 text-2xl font-semibold text-foreground">{selectedTemplate.title}</h2>
            </div>
            <span className="rounded-full border border-line bg-white px-3 py-1 text-xs text-muted">
              {content.totalInstances.replace("{count}", String(selectedAccounts.length))}
            </span>
          </div>

          {selectedAccounts.length === 0 ? (
            <div className="mt-6 rounded-[1.25rem] border border-dashed border-line p-6 text-sm leading-7 text-muted">
              {content.empty.replace("{title}", selectedTemplate.title)}
            </div>
          ) : (
            <div className="mt-6 grid gap-6 xl:grid-cols-2">
              {selectedAccounts.map((account) => {
                const maskedConfig = maskMerchantChannelConfig(account.config) as Record<string, string>;
                const callbackUrl = buildMerchantChannelCallbackUrl(
                  account.channelCode,
                  account.id,
                  account.callbackToken,
                );
                const isDefault = selectedDefaultBinding?.merchantChannelAccountId === account.id;

                return (
                  <form
                    key={account.id}
                    action={updateMerchantChannelAccountAction}
                    className="rounded-[1.5rem] border border-line bg-white/75 p-5"
                  >
                    <input type="hidden" name="redirectTo" value={selectedChannelHref} />
                    <input type="hidden" name="id" value={account.id} />
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-lg font-semibold text-foreground">{account.displayName}</p>
                        <p className="mt-1 font-mono text-xs text-muted">{account.id}</p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <StatusBadge tone={account.enabled ? "success" : "danger"}>
                          {account.enabled ? content.enabled : content.disabled}
                        </StatusBadge>
                        {isDefault ? <StatusBadge tone="info">{content.defaultBadge}</StatusBadge> : null}
                      </div>
                    </div>

                    <div className="mt-4 rounded-[1.25rem] border border-line bg-[#faf7f1] p-4 text-sm leading-7 text-muted">
                      <p>
                        {content.callbackUrl}
                        {locale === "en" ? ": " : "："}
                        <span className="ml-2 break-all font-mono text-xs text-foreground">
                          {callbackUrl}
                        </span>
                      </p>
                      <p className="mt-2">
                        {content.callbackToken}
                        {locale === "en" ? ": " : "："}
                        <span className="ml-2 font-mono text-xs text-foreground">
                          {account.callbackToken}
                        </span>
                      </p>
                      <p className="mt-2">{content.createdAt} {formatDateTime(account.createdAt, locale)}</p>
                      <p className="mt-1">{content.updatedAt} {formatDateTime(account.updatedAt, locale)}</p>
                      <p className="mt-1">{content.verifiedAt} {formatDateTime(account.lastVerifiedAt, locale)}</p>
                      {account.lastErrorMessage ? (
                        <p className="mt-2 text-[#9b3d18]">
                          {content.lastError}
                          {locale === "en" ? ": " : "："}
                          {account.lastErrorMessage}
                        </p>
                      ) : null}
                    </div>

                    <div className="mt-5 grid gap-4">
                      {selectedTemplateBlockedByProfile ? (
                        <div className="rounded-[1.25rem] border border-[#f3d1ab] bg-[#fff4e7] p-4 text-sm text-[#8a4d18]">
                          <p className="font-medium">{content.profileCardTitle}</p>
                          <p className="mt-2 leading-7">{content.profileCardDesc}</p>
                        </div>
                      ) : null}

                      <LabeledField label={content.instanceName}>
                        <input
                          name="displayName"
                          defaultValue={account.displayName}
                          className={inputClass}
                        />
                      </LabeledField>

                      {selectedTemplate.fields.map((field) => (
                        <LabeledField
                          key={field.key}
                          label={field.label}
                          hint={field.required ? content.required : content.optional}
                        >
                          {field.multiline ? (
                            <textarea
                              name={`config_${field.key}`}
                              defaultValue={maskedConfig[field.key] ?? ""}
                              className={`${textareaClass} min-h-[110px] font-sans text-sm`}
                            />
                          ) : (
                            <input
                              name={`config_${field.key}`}
                              defaultValue={maskedConfig[field.key] ?? ""}
                              className={inputClass}
                            />
                          )}
                        </LabeledField>
                      ))}

                      <LabeledField label={content.remark}>
                        <textarea
                          name="remark"
                          defaultValue={account.remark ?? ""}
                          className={`${textareaClass} min-h-[90px] font-sans text-sm`}
                        />
                      </LabeledField>

                      <div className="grid gap-4 sm:grid-cols-2">
                        <div className="rounded-[1.25rem] border border-line bg-white/65 p-4">
                          <label className="flex items-center gap-3 text-sm font-medium text-foreground">
                            <input
                              type="checkbox"
                              name="enabled"
                              defaultChecked={account.enabled}
                              disabled={selectedTemplateBlockedByProfile && !account.enabled}
                              className="h-4 w-4 rounded border-line"
                            />
                            {selectedTemplateBlockedByProfile && !account.enabled
                              ? content.enableLocked
                              : content.enableInstance}
                          </label>
                        </div>
                        <div className="rounded-[1.25rem] border border-line bg-white/65 p-4">
                          <label className="flex items-center gap-3 text-sm font-medium text-foreground">
                            <input
                              type="checkbox"
                              name="setAsDefault"
                              defaultChecked={isDefault}
                              className="h-4 w-4 rounded border-line"
                            />
                            {content.setDefaultInstance}
                          </label>
                        </div>
                      </div>
                    </div>

                    <div className="mt-5">
                      {canManageChannels ? (
                        <button type="submit" className={buttonClass}>
                          {selectedTemplateBlockedByProfile ? content.saveDraftButton : content.saveButton}
                        </button>
                      ) : null}
                    </div>
                  </form>
                );
              })}
            </div>
          )}
        </article>
      </section>
    </div>
  );
}
