import Link from "next/link";
import { hasMerchantPermission } from "@/lib/merchant-rbac";
import { requireMerchantPermission } from "@/lib/merchant-session";
import { getCurrentLocale } from "@/lib/i18n-server";
import { getMarketplacePaymentPluginDetail } from "@/lib/plugins/marketplace";
import { getActiveMerchantChannelTemplate } from "@/lib/merchant-channel-accounts";
import {
  formatMarketplaceDate,
  getProviderKeyLabel,
} from "@/app/merchant/(console)/plugins/plugin-market-shared";
import {
  createMerchantChannelAccountAction,
  installMerchantMarketplacePluginAction,
  purchaseMerchantMarketplacePluginAction,
} from "@/app/merchant/actions";
import { notFound } from "next/navigation";
import { MerchantRegistryPurchaseFinalizer } from "../../registry-purchase-finalizer";

export default async function MerchantPluginInstallPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const session = await requireMerchantPermission("channel:read");
  const locale = await getCurrentLocale();
  const { slug } = await params;
  const plugin = await getMarketplacePaymentPluginDetail(slug, locale);

  if (!plugin) {
    notFound();
  }

  const canManagePlugins = hasMerchantPermission(
    session.merchantUser.role,
    "channel:write",
  );
  const template = await getActiveMerchantChannelTemplate(
    session.merchantUser.merchantId,
    plugin.channelCode,
    locale,
  );
  const merchantInstalled = plugin.merchantInstalls.some(
    (install) => install.merchantId === session.merchantUser.merchantId,
  );
  const merchantInstalledAt =
    plugin.merchantInstalls.find(
      (install) => install.merchantId === session.merchantUser.merchantId,
    )?.installedAt ?? null;
  const merchantPurchased = plugin.purchaseRecords.some(
    (record) => record.merchantId === session.merchantUser.merchantId,
  );

  const content =
    locale === "en"
      ? {
          back: "Back to detail",
          title: "Install plugin",
          subtitle: "Step 1 / Choose plugin  Step 2 / Confirm install  Step 3 / Configure channel",
          installNow: "Confirm install",
          purchaseNow: "Purchase first",
          createChannel: "Install and continue to configuration",
          channelName: "Channel instance name",
          remark: "Remark",
          defaultInstance: "Set as default instance",
          enableNow: "Enable immediately after creation",
          installed: "Already installed",
          installedNeedsPurchase: "Installed — purchase required",
          unpaidHint:
            "This paid plugin is installed but has not been purchased yet. Complete the purchase before configuring the channel.",
          configureLink: "Configure",
          readonly: "Your current role can view the install guide, but cannot install plugins.",
          nextStep: "After installation, head to the channel page to configure merchant parameters.",
          configureNow: "Continue with channel configuration below once the plugin is installed.",
        }
      : {
          back: "返回插件详情",
          title: "安装插件",
          subtitle: "步骤 1 / 选择插件  步骤 2 / 确认安装  步骤 3 / 配置通道",
          installNow: "确认安装",
          purchaseNow: "先购买",
          createChannel: "安装并继续配置",
          channelName: "通道实例名称",
          remark: "备注",
          defaultInstance: "设为默认实例",
          enableNow: "创建后立即启用",
          installed: "已安装",
          installedNeedsPurchase: "已安装 — 仍需购买",
          unpaidHint:
            "该付费插件已经安装到工作区，但尚未购买。请先完成购买后再配置通道，否则调用会失败。",
          configureLink: "配置",
          readonly: "当前角色只能查看安装说明，不能执行安装。",
          nextStep: "安装完成后，请前往支付通道页补充商户参数并启用。",
          configureNow: "插件安装成功后，可直接在下方继续录入通道参数。",
        };

  const needsPurchase =
    plugin.pricingMode === "PAID" && !merchantPurchased;

  return (
    <div className="space-y-8">
      <MerchantRegistryPurchaseFinalizer slug={plugin.slug} locale={locale} />
      <section className="rounded-[1.75rem] border border-line bg-[linear-gradient(135deg,rgba(255,255,255,0.96),rgba(248,243,236,0.9))] p-6 shadow-[var(--shadow)] sm:p-8">
        <Link href={`/merchant/plugins/${plugin.slug}`} className="text-sm font-medium text-accent">
          ← {content.back}
        </Link>
        <p className="mt-6 text-xs font-semibold uppercase tracking-[0.24em] text-[#8a7159]">
          {content.subtitle}
        </p>
        <h1 className="mt-4 text-4xl font-semibold tracking-[-0.04em] text-foreground">
          {content.title}
        </h1>
      </section>

      {!canManagePlugins ? (
        <section className="rounded-[1.5rem] border border-line bg-white/78 p-5 text-sm leading-7 text-muted shadow-[var(--shadow)]">
          {content.readonly}
        </section>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_360px]">
        <section className="rounded-[1.5rem] border border-line bg-white/78 p-6 shadow-[var(--shadow)]">
          <div className="flex items-start gap-5">
            <div className="flex h-16 w-16 items-center justify-center rounded-[1.5rem] bg-[linear-gradient(135deg,rgba(217,108,31,0.18),rgba(13,122,98,0.18))] text-2xl font-semibold text-foreground">
              {plugin.displayName.slice(0, 1)}
            </div>
            <div>
              <h2 className="text-2xl font-semibold text-foreground">{plugin.displayName}</h2>
              <p className="mt-2 text-sm leading-7 text-muted">{plugin.summary}</p>
            </div>
          </div>

          <div className="mt-8 rounded-[1.25rem] border border-line bg-white/70 p-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-muted">Provider</p>
                <p className="mt-2 text-sm font-medium text-foreground">
                  {getProviderKeyLabel(plugin.providerKey, locale)}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-muted">Version</p>
                <p className="mt-2 text-sm font-medium text-foreground">{plugin.version}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-muted">Installed At</p>
                <p className="mt-2 text-sm font-medium text-foreground">
                  {formatMarketplaceDate(merchantInstalledAt, locale)}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-muted">Package</p>
                <p className="mt-2 break-all text-xs font-mono text-foreground">{plugin.packageName}</p>
              </div>
            </div>
          </div>
        </section>

        <aside className="rounded-[1.5rem] border border-line bg-white/78 p-6 shadow-[var(--shadow)] xl:sticky xl:top-8 xl:self-start">
          {merchantInstalled && needsPurchase ? (
            <div className="space-y-4">
              <span className="inline-flex rounded-full border border-[#f3d1ab] bg-[#fff4e7] px-3 py-1 text-xs font-medium text-[#aa5a16]">
                {content.installedNeedsPurchase}
              </span>
              <p
                role="alert"
                className="rounded-[1.25rem] border border-[#f3d1ab] bg-[#fff4e7] px-4 py-3 text-xs leading-6 text-[#aa5a16]"
              >
                {content.unpaidHint}
              </p>
              {canManagePlugins ? (
                <form action={purchaseMerchantMarketplacePluginAction} className="space-y-3">
                  <input type="hidden" name="slug" value={plugin.slug} />
                  <input type="hidden" name="redirectTo" value={`/merchant/plugins/${plugin.slug}/install`} />
                  <button
                    type="submit"
                    className="w-full rounded-2xl bg-accent px-5 py-3 text-sm font-medium text-white shadow-[0_16px_30px_rgba(217,108,31,0.22)]"
                  >
                    {content.purchaseNow}
                  </button>
                </form>
              ) : null}
              <Link
                href={`/merchant/channels?channel=${plugin.channelCode}`}
                className="inline-flex w-full items-center justify-center rounded-2xl border border-line bg-white px-5 py-3 text-sm font-medium text-foreground"
              >
                {content.configureLink}
              </Link>
            </div>
          ) : merchantInstalled ? (
            <div className="space-y-4">
              <span className="inline-flex rounded-full border border-[#bde2d5] bg-[#f1fbf7] px-3 py-1 text-xs font-medium text-[#165746]">
                {content.installed}
              </span>
              <p className="text-sm leading-7 text-muted">{content.nextStep}</p>
              <Link href={`/merchant/channels?channel=${plugin.channelCode}`} className="rounded-2xl bg-accent px-5 py-3 text-sm font-medium text-white shadow-[0_16px_30px_rgba(217,108,31,0.22)]">
                {content.configureLink}
              </Link>
            </div>
          ) : canManagePlugins && plugin.pricingMode === "PAID" && !merchantPurchased ? (
            <div className="space-y-4">
              <form action={purchaseMerchantMarketplacePluginAction} className="space-y-4">
                <input type="hidden" name="slug" value={plugin.slug} />
                <input type="hidden" name="redirectTo" value={`/merchant/plugins/${plugin.slug}/install`} />
                <p className="text-sm leading-7 text-muted">{content.nextStep}</p>
                <button
                  type="submit"
                  className="rounded-2xl border border-line bg-white px-5 py-3 text-sm font-medium text-foreground"
                >
                  {content.purchaseNow}
                </button>
              </form>
            </div>
          ) : canManagePlugins ? (
            <div className="space-y-4">
              <form action={installMerchantMarketplacePluginAction} className="space-y-4">
                <input type="hidden" name="slug" value={plugin.slug} />
                <input type="hidden" name="redirectTo" value={`/merchant/plugins/${plugin.slug}/install`} />
                <p className="text-sm leading-7 text-muted">{content.nextStep}</p>
                <button
                  type="submit"
                  className="rounded-2xl border border-line bg-white px-5 py-3 text-sm font-medium text-foreground"
                >
                  {content.installNow}
                </button>
              </form>

              <p className="text-xs leading-6 text-muted">{content.configureNow}</p>

              {merchantInstalled && template ? (
                <form action={createMerchantChannelAccountAction} className="space-y-4 border-t border-line pt-4">
                  <input type="hidden" name="redirectTo" value={`/merchant/channels?channel=${plugin.channelCode}`} />
                  <input type="hidden" name="channelCode" value={plugin.channelCode} />
                  <div className="space-y-2">
                    <label className="text-xs uppercase tracking-[0.18em] text-muted">
                      {content.channelName}
                    </label>
                    <input
                      name="displayName"
                      defaultValue={`${plugin.displayName} / 正式环境`}
                      className="w-full rounded-2xl border border-line bg-white/90 px-4 py-3 text-sm text-foreground outline-none"
                    />
                  </div>

                  {template.fields.map((field) => (
                    <div key={field.key} className="space-y-2">
                      <label className="text-xs uppercase tracking-[0.18em] text-muted">
                        {field.label}
                      </label>
                      {field.multiline ? (
                        <textarea
                          name={`config_${field.key}`}
                          placeholder={field.placeholder}
                          className="min-h-[92px] w-full rounded-2xl border border-line bg-white/90 px-4 py-3 text-sm text-foreground outline-none"
                        />
                      ) : (
                        <input
                          name={`config_${field.key}`}
                          placeholder={field.placeholder}
                          className="w-full rounded-2xl border border-line bg-white/90 px-4 py-3 text-sm text-foreground outline-none"
                        />
                      )}
                    </div>
                  ))}

                  <div className="space-y-2">
                    <label className="text-xs uppercase tracking-[0.18em] text-muted">
                      {content.remark}
                    </label>
                    <textarea
                      name="remark"
                      className="min-h-[92px] w-full rounded-2xl border border-line bg-white/90 px-4 py-3 text-sm text-foreground outline-none"
                    />
                  </div>

                  <label className="flex items-center gap-3 text-sm text-foreground">
                    <input type="checkbox" name="enabled" defaultChecked className="h-4 w-4 rounded border-line" />
                    {content.enableNow}
                  </label>

                  <label className="flex items-center gap-3 text-sm text-foreground">
                    <input type="checkbox" name="setAsDefault" defaultChecked className="h-4 w-4 rounded border-line" />
                    {content.defaultInstance}
                  </label>

                  <button
                    type="submit"
                    className="rounded-2xl bg-accent px-5 py-3 text-sm font-medium text-white shadow-[0_16px_30px_rgba(217,108,31,0.22)]"
                  >
                    {content.createChannel}
                  </button>
                </form>
              ) : null}
            </div>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
