import { saveBindingAction } from "@/app/admin/actions";
import {
  formatDateTime,
  getPaymentChannelOptions,
  readPageMessages,
  type SearchParamsInput,
} from "@/app/admin/support";
import {
  AdminPageHeader,
  EmptyState,
  FlashMessage,
  LabeledField,
  buttonClass,
  inputClass,
  panelClass,
  selectClass,
} from "@/app/admin/ui";
import { requireAdminPermission } from "@/lib/admin-session";
import { getCurrentLocale } from "@/lib/i18n-server";
import { getMerchantDisplayName } from "@/lib/merchant-profile-completion";
import { getPrismaClient } from "@/lib/prisma";

export default async function BindingsPage({
  searchParams,
}: {
  searchParams?: SearchParamsInput;
}) {
  await requireAdminPermission("binding:read");
  const prisma = getPrismaClient();
  const messages = await readPageMessages(searchParams);
  const locale = await getCurrentLocale();
  const paymentChannelOptions = getPaymentChannelOptions(locale);
  const content =
    locale === "en"
      ? {
          eyebrow: "Bindings",
          title: "Merchant routing bindings",
          description:
            "Define which channels each merchant can use, choose the default merchant-owned channel instance, and maintain amount limits and fee rates. Legacy platform collection is disabled.",
          formTitle: "Create or update binding",
          merchantLabel: "Merchant",
          channelLabel: "Channel",
          accountLabel: "Merchant Channel Instance",
          accountHint:
            "When selected, orders use the merchant's own upstream credentials. Leave blank to auto-pick the most recently enabled merchant instance for the channel.",
          unspecified: "Unspecified",
          enabled: "Enable binding",
          minAmount: "Minimum Amount",
          maxAmount: "Maximum Amount",
          feeRate: "Fee Rate",
          saveButton: "Save Binding",
          emptyTitle: "No bindings yet",
          emptyDesc: "Create merchant-owned channel instances first, then establish default routing bindings.",
          enabledBadge: "enabled",
          disabledBadge: "disabled",
          createdAt: "Created At",
          currentRoute: "Current Route",
          merchantInstance: "Merchant Instance",
          legacyPlatform: "Legacy Platform Account",
          autoRoute: "Unspecified. Fallback to automatic system routing.",
          token: "Token",
          legacyWarning:
            "This binding still references the legacy platform collection mode. Switch it to a merchant-owned channel instance as soon as possible.",
        }
      : {
          eyebrow: "Bindings",
          title: "商户通道路由",
          description:
            "这里定义某个商户可使用哪些通道，以及默认走哪个商户自有通道实例，并维护限额与费率。平台代收款模式已停用。",
          formTitle: "新增或更新绑定",
          merchantLabel: "商户",
          channelLabel: "通道",
          accountLabel: "商户通道实例",
          accountHint: "选择后，订单会走商户自己维护的上游参数。留空则自动选择该通道最近启用的商户实例。",
          unspecified: "不指定",
          enabled: "启用绑定",
          minAmount: "最小金额",
          maxAmount: "最大金额",
          feeRate: "费率",
          saveButton: "保存绑定",
          emptyTitle: "还没有绑定",
          emptyDesc: "商户创建好自己的通道实例后，就可以建立默认路由绑定。",
          enabledBadge: "enabled",
          disabledBadge: "disabled",
          createdAt: "创建于",
          currentRoute: "当前路由",
          merchantInstance: "商户实例",
          legacyPlatform: "遗留平台账号",
          autoRoute: "未指定，按系统自动路由",
          token: "特征码",
          legacyWarning: "该绑定仍引用旧的平台收款模式，请尽快切换为商户自有通道实例。",
        };
  const [merchants, merchantChannelAccounts, bindings] = await Promise.all([
    prisma.merchant.findMany({
      orderBy: [{ createdAt: "asc" }],
      select: { id: true, code: true, name: true },
    }),
    prisma.merchantChannelAccount.findMany({
      orderBy: [{ merchantId: "asc" }, { channelCode: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        displayName: true,
        channelCode: true,
        enabled: true,
        callbackToken: true,
        merchant: {
          select: {
            id: true,
            code: true,
            name: true,
          },
        },
      },
    }),
    prisma.merchantChannelBinding.findMany({
      orderBy: [{ channelCode: "asc" }, { createdAt: "asc" }],
      include: {
        merchant: {
          select: { id: true, code: true, name: true },
        },
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
          select: { id: true, displayName: true, channelCode: true },
        },
      },
    }),
  ]);

  return (
    <div className="space-y-8">
      <AdminPageHeader
        eyebrow={content.eyebrow}
        title={content.title}
        description={content.description}
      />

      <FlashMessage success={messages.success} error={messages.error} />

      <section className={`${panelClass} p-6`}>
        <h2 className="text-2xl font-semibold text-foreground">{content.formTitle}</h2>
        <form action={saveBindingAction} className="mt-6 grid gap-4 lg:grid-cols-2">
          <input type="hidden" name="redirectTo" value="/admin/bindings" />
          <LabeledField label={content.merchantLabel}>
            <select name="merchantId" className={selectClass} defaultValue={merchants[0]?.id ?? ""}>
              {merchants.map((merchant) => (
                <option key={merchant.id} value={merchant.id}>
                  {merchant.code} / {getMerchantDisplayName(merchant.name, locale)}
                </option>
              ))}
            </select>
          </LabeledField>
          <LabeledField label={content.channelLabel}>
            <select
              name="channelCode"
              className={selectClass}
              defaultValue={paymentChannelOptions[0]?.code ?? ""}
            >
              {paymentChannelOptions.map((channel) => (
                <option key={channel.code} value={channel.code}>
                  {channel.code}
                </option>
              ))}
            </select>
          </LabeledField>
          <LabeledField label={content.accountLabel} hint={content.accountHint}>
            <select name="merchantChannelAccountId" className={selectClass} defaultValue="">
              <option value="">{content.unspecified}</option>
              {merchantChannelAccounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.merchant.code} / {account.channelCode} / {account.displayName}
                </option>
              ))}
            </select>
          </LabeledField>
          <div className="rounded-[1.25rem] border border-line bg-white/65 p-4">
            <label className="flex items-center gap-3 text-sm font-medium text-foreground">
              <input type="checkbox" name="enabled" defaultChecked className="h-4 w-4 rounded border-line" />
              {content.enabled}
            </label>
          </div>
          <LabeledField label={content.minAmount}>
            <input name="minAmount" placeholder="1.00" className={inputClass} />
          </LabeledField>
          <LabeledField label={content.maxAmount}>
            <input name="maxAmount" placeholder="50000.00" className={inputClass} />
          </LabeledField>
          <LabeledField label={content.feeRate}>
            <input name="feeRate" placeholder="0.0030" className={inputClass} />
          </LabeledField>
          <div className="lg:col-span-2">
            <button type="submit" className={buttonClass}>
              {content.saveButton}
            </button>
          </div>
        </form>
      </section>

      {bindings.length === 0 ? (
        <EmptyState title={content.emptyTitle} description={content.emptyDesc} />
      ) : (
        <section className="grid gap-6 xl:grid-cols-2">
          {bindings.map((binding) => (
            <article key={binding.id} className={`${panelClass} p-6`}>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.22em] text-muted">
                    {binding.merchant.code}
                  </p>
                  <h2 className="mt-2 text-2xl font-semibold text-foreground">
                    {binding.channelCode}
                  </h2>
                </div>
                <div className="rounded-full bg-accent-soft px-3 py-1 text-xs font-semibold text-accent">
                  {binding.enabled ? content.enabledBadge : content.disabledBadge}
                </div>
              </div>

              <p className="mt-3 text-sm leading-7 text-muted">
                {getMerchantDisplayName(binding.merchant.name, locale)} · {content.createdAt} {formatDateTime(binding.createdAt, locale)}
              </p>

              <form action={saveBindingAction} className="mt-6 grid gap-4">
                <input type="hidden" name="redirectTo" value="/admin/bindings" />
                <input type="hidden" name="merchantId" value={binding.merchantId} />

                <LabeledField label={content.channelLabel}>
                  <input
                    name="channelCode"
                    defaultValue={binding.channelCode}
                    className={inputClass}
                  />
                </LabeledField>

                <LabeledField label={content.accountLabel} hint={content.accountHint}>
                  <select
                    name="merchantChannelAccountId"
                    className={selectClass}
                    defaultValue={binding.merchantChannelAccountId ?? ""}
                  >
                    <option value="">{content.unspecified}</option>
                    {merchantChannelAccounts.map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.merchant.code} / {account.channelCode} / {account.displayName}
                      </option>
                    ))}
                  </select>
                </LabeledField>

                <div className="rounded-[1.25rem] border border-line bg-white/65 p-4">
                  <label className="flex items-center gap-3 text-sm font-medium text-foreground">
                    <input
                      type="checkbox"
                      name="enabled"
                      defaultChecked={binding.enabled}
                      className="h-4 w-4 rounded border-line"
                    />
                    {content.enabled}
                  </label>
                </div>

                <div className="grid gap-4 sm:grid-cols-3">
                  <LabeledField label={content.minAmount}>
                    <input
                      name="minAmount"
                      defaultValue={binding.minAmount?.toString() ?? ""}
                      className={inputClass}
                    />
                  </LabeledField>
                  <LabeledField label={content.maxAmount}>
                    <input
                      name="maxAmount"
                      defaultValue={binding.maxAmount?.toString() ?? ""}
                      className={inputClass}
                    />
                  </LabeledField>
                  <LabeledField label={content.feeRate}>
                    <input
                      name="feeRate"
                      defaultValue={binding.feeRate?.toString() ?? ""}
                      className={inputClass}
                    />
                  </LabeledField>
                </div>

                <div className="rounded-[1.25rem] border border-line bg-white/65 p-4 text-sm text-muted">
                  {content.currentRoute}
                  {locale === "en" ? ": " : "："}
                  <span className="ml-2 font-medium text-foreground">
                    {binding.merchantChannelAccount
                      ? `${content.merchantInstance} / ${binding.merchantChannelAccount.displayName}`
                      : binding.providerAccount
                        ? `${content.legacyPlatform} / ${binding.providerAccount.displayName}`
                        : content.autoRoute}
                  </span>
                  {binding.merchantChannelAccount ? (
                    <p className="mt-2 font-mono text-xs text-muted">
                      {content.token} {binding.merchantChannelAccount.callbackToken}
                    </p>
                  ) : binding.providerAccount ? (
                    <p className="mt-2 text-xs text-[#9b3d18]">
                      {content.legacyWarning}
                    </p>
                  ) : null}
                </div>

                <div>
                  <button type="submit" className={buttonClass}>
                    {content.saveButton}
                  </button>
                </div>
              </form>
            </article>
          ))}
        </section>
      )}
    </div>
  );
}
