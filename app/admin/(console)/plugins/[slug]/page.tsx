import Link from "next/link";
import { notFound } from "next/navigation";
import type { MarketplacePluginSource } from "@/generated/prisma/client";
import {
  markMarketplacePluginPurchasedAction,
  purchaseMarketplacePluginAction,
} from "@/app/admin/actions";
import {
  AdminPageHeader,
  EmptyState,
  StatCard,
  buttonClass,
  panelClass,
  subtleButtonClass,
  tableWrapperClass,
} from "@/app/admin/ui";
import { RegistryPurchaseFinalizer } from "../registry-purchase-finalizer";
import { requireAdminPermission } from "@/lib/admin-session";
import { getCurrentLocale } from "@/lib/i18n-server";
import { getMarketplacePaymentPluginDetail } from "@/lib/plugins/marketplace";
import { getPrismaClient } from "@/lib/prisma";

function formatDateTime(value: Date | null, locale: "zh" | "en") {
  if (!value) {
    return "—";
  }

  return new Intl.DateTimeFormat(locale === "en" ? "en-US" : "zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(value);
}

function getProviderKeyLabel(
  providerKey: string,
  locale: "zh" | "en",
) {
  const labels: Record<string, { zh: string; en: string }> = {
    alipay: { zh: "支付宝", en: "Alipay" },
    wxpay: { zh: "微信支付", en: "WeChat Pay" },
    crypto: { zh: "加密支付", en: "Crypto" },
    paypal: { zh: "PayPal", en: "PayPal" },
  };

  if (labels[providerKey]) {
    return labels[providerKey][locale];
  }

  const normalized = providerKey
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (segment) => segment.toUpperCase());

  return normalized || providerKey;
}

function getSourceLabel(
  source: MarketplacePluginSource,
  locale: "zh" | "en",
) {
  const labels = {
    BUILTIN: { zh: "内置插件", en: "Built-in" },
    REMOTE_SIGNED: { zh: "远程商店插件", en: "Registry Plugin" },
    LOCAL_PACKAGE: { zh: "本地插件包", en: "Local Package" },
  } as const;

  return labels[source][locale];
}

export default async function PluginDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  await requireAdminPermission("plugin_marketplace:read");
  const locale = await getCurrentLocale();
  const { slug } = await params;
  const plugin = await getMarketplacePaymentPluginDetail(slug, locale);

  if (!plugin) {
    notFound();
  }

  const auditLogs = await getPrismaClient().adminAuditLog.findMany({
    where: {
      resourceType: "marketplace_plugin",
      resourceId: plugin.id,
    },
    orderBy: [{ createdAt: "desc" }],
    take: 12,
  });

  const content =
    locale === "en"
      ? {
          eyebrow: "Plugin Detail",
          title: plugin.displayName,
          description:
            "Use the detail page to review runtime exposure, merchant adoption, and recent operator actions before changing plugin state.",
          back: "Back to Plugin Market",
          statInstalled: "Installed",
          statEnabled: "Enabled",
          statMerchants: "Merchant Installs",
          statOrders: "Orders",
          packageLabel: "Package",
          versionLabel: "Version",
          pricingLabel: "Pricing",
          purchaseUrlLabel: "Purchase Link",
          purchaseNow: "Open Purchase Link",
          purchaseWithRegistry: "Purchase via Registry",
          markPurchased: "Mark Purchased",
          purchasedAtLabel: "Purchased At",
          purchaseRecordTitle: "Record Purchase",
          orderReferenceLabel: "Order Reference",
          licenseKeyLabel: "License Key",
          notesLabel: "Purchase Notes",
          savePurchaseRecord: "Save Purchase Record",
          purchaseRecordsTitle: "Purchase Records",
          noPurchaseRecords: "No purchase records yet.",
          providerLabel: "Provider",
          sourceLabel: "Source",
          channelLabel: "Channel",
          runnableLabel: "Runnable",
          runnableYes: "Ready for runtime",
          runnableNo: "Manifest only",
          runtimeEntrypointLabel: "Runtime Entrypoint",
          runtimePathLabel: "Resolved Runtime Path",
          localPathLabel: "Local Manifest Path",
          manifestVersionLabel: "Manifest Version",
          callbackLabel: "Callback Route",
          callbackEnabled: "Dedicated callback route supported",
          callbackDisabled: "No callback route required",
          profileLabel: "Merchant Profile Rule",
          profileRequired: "Profile completion required before activation",
          profileOptional: "No extra profile gate",
          capabilitiesTitle: "Capabilities",
          usageTitle: "Runtime Usage",
          merchantInstallsTitle: "Merchant Installs",
          merchantInstallsDesc:
            "Merchants listed here have installed this plugin into their own workspace. Existing channel instances and bindings are shown as direct dependency signals.",
          merchantCol: "Merchant",
          installedAtCol: "Installed",
          accountCountCol: "Channel Instances",
          bindingCountCol: "Bindings",
          inspectCol: "Inspect",
          openMerchant: "Open Merchant",
          auditTitle: "Recent Audit Trail",
          auditDesc:
            "These are the most recent administrative operations recorded against this plugin resource.",
          actorCol: "Actor",
          actionCol: "Action",
          summaryCol: "Summary",
          timeCol: "Time",
          noMerchantInstalls: "No merchant has installed this plugin yet.",
          noAudit: "No plugin-scoped audit logs yet.",
          refundsLabel: "Refunds",
          installedBadge: "Installed",
          availableBadge: "Available",
          importedBadge: "Imported",
          notImportedBadge: "Not Imported",
          enabledBadge: "Enabled",
          disabledBadge: "Disabled",
          publishedBadge: "Published",
          notPublishedBadge: "Not Published",
        }
      : {
          eyebrow: "插件详情",
          title: plugin.displayName,
          description:
            "在改动插件状态前，这里可以集中查看运行暴露情况、商户安装情况，以及最近发生过哪些后台操作。",
          back: "返回插件市场",
          statInstalled: "已安装",
          statEnabled: "已启用",
          statMerchants: "商户安装数",
          statOrders: "订单数",
          packageLabel: "包名",
          versionLabel: "版本",
          pricingLabel: "定价",
          purchaseUrlLabel: "购买链接",
          purchaseNow: "打开购买链接",
          purchaseWithRegistry: "通过 Registry 购买",
          markPurchased: "记录已购",
          purchasedAtLabel: "购买时间",
          purchaseRecordTitle: "登记购买记录",
          orderReferenceLabel: "订单号",
          licenseKeyLabel: "许可证号",
          notesLabel: "购买备注",
          savePurchaseRecord: "保存购买记录",
          purchaseRecordsTitle: "购买记录",
          noPurchaseRecords: "当前还没有购买记录。",
          providerLabel: "提供方",
          sourceLabel: "来源",
          channelLabel: "通道",
          runnableLabel: "运行能力",
          runnableYes: "可进入运行时",
          runnableNo: "仅清单纳管",
          runtimeEntrypointLabel: "运行时入口",
          runtimePathLabel: "解析后的运行时路径",
          localPathLabel: "本地清单路径",
          manifestVersionLabel: "清单版本",
          callbackLabel: "回调能力",
          callbackEnabled: "支持专属回调路由",
          callbackDisabled: "无需回调路由",
          profileLabel: "资料要求",
          profileRequired: "启用前需补齐商户资料",
          profileOptional: "无额外资料门槛",
          capabilitiesTitle: "能力清单",
          usageTitle: "运行时使用情况",
          merchantInstallsTitle: "商户安装情况",
          merchantInstallsDesc:
            "这里列出已经把当前插件安装到自己工作台的商户，同时展示它们是否已经创建了通道实例或路由绑定。",
          merchantCol: "商户",
          installedAtCol: "安装时间",
          accountCountCol: "通道实例",
          bindingCountCol: "路由绑定",
          inspectCol: "查看",
          openMerchant: "查看商户",
          auditTitle: "最近审计记录",
          auditDesc: "这里展示最近记录到当前插件资源上的后台操作。",
          actorCol: "操作者",
          actionCol: "动作",
          summaryCol: "摘要",
          timeCol: "时间",
          noMerchantInstalls: "当前还没有商户安装这个插件。",
          noAudit: "当前还没有插件级审计记录。",
          refundsLabel: "退款",
          installedBadge: "已安装",
          availableBadge: "可安装",
          importedBadge: "已导入",
          notImportedBadge: "未导入",
          enabledBadge: "已启用",
          disabledBadge: "已停用",
          publishedBadge: "已发布",
          notPublishedBadge: "未发布",
        };

  const installBadge = plugin.installed ? content.installedBadge : content.availableBadge;
  const runtimeBadge = plugin.enabled ? content.enabledBadge : content.disabledBadge;
  const pricingText =
    plugin.pricingMode === "PAID"
      ? plugin.priceLabel || (locale === "en" ? "Paid Plugin" : "收费插件")
      : plugin.pricingMode === "FREE"
        ? locale === "en"
          ? "Free"
          : "免费"
        : null;

  return (
    <div className="space-y-8">
      <RegistryPurchaseFinalizer slug={plugin.slug} locale={locale} />

      <AdminPageHeader
        eyebrow={content.eyebrow}
        title={content.title}
        description={content.description}
        actions={
          <>
            {plugin.source === "REMOTE_SIGNED" &&
            plugin.pricingMode === "PAID" &&
            !plugin.purchasedAt ? (
              <>
                <form action={purchaseMarketplacePluginAction}>
                  <input type="hidden" name="slug" value={plugin.slug} />
                  <input
                    type="hidden"
                    name="redirectTo"
                    value={`/admin/plugins/${plugin.slug}`}
                  />
                  <button type="submit" className={subtleButtonClass}>
                    {content.purchaseWithRegistry}
                  </button>
                </form>
                <form action={markMarketplacePluginPurchasedAction}>
                  <input type="hidden" name="slug" value={plugin.slug} />
                  <input
                    type="hidden"
                    name="redirectTo"
                    value={`/admin/plugins/${plugin.slug}`}
                  />
                  <button type="submit" className={subtleButtonClass}>
                    {content.markPurchased}
                  </button>
                </form>
              </>
            ) : null}
            <Link href="/admin/plugins" className={subtleButtonClass}>
              {content.back}
            </Link>
          </>
        }
      />

      <section className="grid gap-4 md:grid-cols-4">
        <StatCard
          label={content.statInstalled}
          value={installBadge}
          detail={`${content.channelLabel}: ${plugin.channelCode}`}
        />
        <StatCard
          label={content.statEnabled}
          value={runtimeBadge}
          detail={`${content.providerLabel}: ${getProviderKeyLabel(plugin.providerKey, locale)}`}
        />
        <StatCard
          label={content.statMerchants}
          value={plugin.merchantInstalls.length}
          detail={`${content.usageTitle}: ${plugin.usage.enabledMerchantAccountCount}/${plugin.usage.merchantAccountCount}`}
        />
        <StatCard
          label={content.statOrders}
          value={plugin.usage.orderCount}
          detail={`${content.refundsLabel}: ${plugin.usage.refundCount}`}
        />
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <div className={`${panelClass} p-5 sm:p-6`}>
          <div className="grid gap-3 text-sm leading-6 text-muted">
            <p>
              <span className="font-medium text-foreground">{content.packageLabel}:</span>{" "}
              <span className="break-all font-mono">{plugin.packageName}</span>
            </p>
            <p>
              <span className="font-medium text-foreground">{content.versionLabel}:</span>{" "}
              {plugin.version}
            </p>
            {pricingText ? (
              <p>
                <span className="font-medium text-foreground">{content.pricingLabel}:</span>{" "}
                {pricingText}
              </p>
            ) : null}
            {plugin.purchasedAt ? (
              <p>
                <span className="font-medium text-foreground">{content.purchasedAtLabel}:</span>{" "}
                {formatDateTime(plugin.purchasedAt, locale)}
              </p>
            ) : null}
            <p>
              <span className="font-medium text-foreground">{content.providerLabel}:</span>{" "}
              {plugin.vendor}
            </p>
            {plugin.purchaseUrl ? (
              <p>
                <span className="font-medium text-foreground">{content.purchaseUrlLabel}:</span>{" "}
                <a
                  href={plugin.purchaseUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="break-all font-mono text-accent hover:underline"
                >
                  {plugin.purchaseUrl}
                </a>
              </p>
            ) : null}
            <p>
              <span className="font-medium text-foreground">{content.sourceLabel}:</span>{" "}
              {getSourceLabel(plugin.source, locale)}
            </p>
            <p>
              <span className="font-medium text-foreground">{content.runnableLabel}:</span>{" "}
              {plugin.runnable ? content.runnableYes : content.runnableNo}
            </p>
            <p>
              <span className="font-medium text-foreground">{content.channelLabel}:</span>{" "}
              {plugin.channelCode}
              {" · "}
              <span className="font-medium text-foreground">{content.providerLabel}:</span>{" "}
              {getProviderKeyLabel(plugin.providerKey, locale)}
            </p>
            {plugin.localPath ? (
              <p>
                <span className="font-medium text-foreground">{content.localPathLabel}:</span>{" "}
                <span className="break-all font-mono">{plugin.localPath}</span>
              </p>
            ) : null}
            {plugin.runtimeEntrypoint ? (
              <p>
                <span className="font-medium text-foreground">{content.runtimeEntrypointLabel}:</span>{" "}
                <span className="break-all font-mono">{plugin.runtimeEntrypoint}</span>
              </p>
            ) : null}
            {plugin.runtimePath ? (
              <p>
                <span className="font-medium text-foreground">{content.runtimePathLabel}:</span>{" "}
                <span className="break-all font-mono">{plugin.runtimePath}</span>
              </p>
            ) : null}
            {plugin.manifestVersion !== null ? (
              <p>
                <span className="font-medium text-foreground">{content.manifestVersionLabel}:</span>{" "}
                {plugin.manifestVersion}
              </p>
            ) : null}
            <p>
              <span className="font-medium text-foreground">{content.callbackLabel}:</span>{" "}
              {plugin.supportsCallbackRoute
                ? content.callbackEnabled
                : content.callbackDisabled}
            </p>
            <p>
              <span className="font-medium text-foreground">{content.profileLabel}:</span>{" "}
              {plugin.requiresMerchantProfileCompletion
                ? content.profileRequired
                : content.profileOptional}
            </p>
            <p className="pt-1 text-foreground">{plugin.description}</p>
          </div>
        </div>

        <div className={`${panelClass} p-5 sm:p-6`}>
          <p className="text-sm font-medium text-foreground">{content.capabilitiesTitle}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {plugin.capabilities.map((capability) => (
              <span
                key={capability}
                className="rounded-full border border-line bg-white px-3 py-1 text-xs font-medium text-foreground"
              >
                {capability}
              </span>
            ))}
          </div>

          <p className="mt-6 text-sm font-medium text-foreground">{content.usageTitle}</p>
          <div className="mt-4 grid gap-3 text-sm text-muted sm:grid-cols-2">
            <div className="rounded-xl border border-line bg-white/70 p-4">
              <p>{content.accountCountCol}</p>
              <p className="mt-2 text-lg font-semibold text-foreground">
                {plugin.usage.enabledMerchantAccountCount}/{plugin.usage.merchantAccountCount}
              </p>
            </div>
            <div className="rounded-xl border border-line bg-white/70 p-4">
              <p>{content.bindingCountCol}</p>
              <p className="mt-2 text-lg font-semibold text-foreground">
                {plugin.usage.enabledBindingCount}/{plugin.usage.bindingCount}
              </p>
            </div>
          </div>
        </div>
      </section>

      {plugin.source === "REMOTE_SIGNED" && plugin.pricingMode === "PAID" ? (
        <section className={`${panelClass} p-5 sm:p-6`}>
          <h2 className="text-2xl font-semibold text-foreground">{content.purchaseRecordTitle}</h2>
          {!plugin.purchasedAt ? (
            <form action={purchaseMarketplacePluginAction} className="mt-6">
              <input type="hidden" name="slug" value={plugin.slug} />
              <input type="hidden" name="redirectTo" value={`/admin/plugins/${plugin.slug}`} />
              <button type="submit" className={buttonClass}>
                {content.purchaseWithRegistry}
              </button>
            </form>
          ) : null}
          <form action={markMarketplacePluginPurchasedAction} className="mt-6 grid gap-4 lg:grid-cols-2">
            <input type="hidden" name="slug" value={plugin.slug} />
            <input type="hidden" name="redirectTo" value={`/admin/plugins/${plugin.slug}`} />
            <div className="lg:col-span-2">
              <label className="block space-y-2">
                <span className="text-sm font-medium text-foreground">{content.orderReferenceLabel}</span>
                <input name="orderReference" className="w-full rounded-2xl border border-line bg-white/90 px-4 py-3 text-sm text-foreground outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20" />
              </label>
            </div>
            <label className="block space-y-2">
              <span className="text-sm font-medium text-foreground">{content.licenseKeyLabel}</span>
              <input name="licenseKey" className="w-full rounded-2xl border border-line bg-white/90 px-4 py-3 text-sm text-foreground outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20" />
            </label>
            <label className="block space-y-2">
              <span className="text-sm font-medium text-foreground">{content.notesLabel}</span>
              <input name="notes" className="w-full rounded-2xl border border-line bg-white/90 px-4 py-3 text-sm text-foreground outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20" />
            </label>
            <div className="lg:col-span-2">
              <button type="submit" className={subtleButtonClass}>
                {content.savePurchaseRecord}
              </button>
            </div>
          </form>

          <h3 className="mt-8 text-lg font-semibold text-foreground">{content.purchaseRecordsTitle}</h3>
          {plugin.purchaseRecords.length === 0 ? (
            <div className="mt-4 rounded-[1.25rem] border border-dashed border-line p-6 text-sm leading-7 text-muted">
              {content.noPurchaseRecords}
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              {plugin.purchaseRecords.map((record) => (
                <article key={record.id} className="rounded-[1.25rem] border border-line bg-white/75 p-4 text-sm leading-7 text-muted">
                  <p><span className="font-medium text-foreground">{content.purchasedAtLabel}:</span> {formatDateTime(record.purchasedAt, locale)}</p>
                  <p><span className="font-medium text-foreground">{content.orderReferenceLabel}:</span> {record.orderReference || "—"}</p>
                  <p><span className="font-medium text-foreground">{content.licenseKeyLabel}:</span> {record.licenseKey || "—"}</p>
                  <p><span className="font-medium text-foreground">{content.pricingLabel}:</span> {record.priceLabel || "—"}</p>
                  <p><span className="font-medium text-foreground">{content.notesLabel}:</span> {record.notes || "—"}</p>
                </article>
              ))}
            </div>
          )}
        </section>
      ) : null}

      <section className={`${panelClass} p-5 sm:p-6`}>
        <h2 className="text-2xl font-semibold text-foreground">{content.merchantInstallsTitle}</h2>
        <p className="mt-2 text-sm leading-7 text-muted">{content.merchantInstallsDesc}</p>

        {plugin.merchantInstalls.length === 0 ? (
          <div className="mt-6">
            <EmptyState title={content.noMerchantInstalls} description={plugin.summary} />
          </div>
        ) : (
          <div className={`mt-6 ${tableWrapperClass}`}>
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-white/80 text-xs uppercase tracking-[0.18em] text-muted">
                  <tr>
                    <th className="px-4 py-3 font-medium">{content.merchantCol}</th>
                    <th className="px-4 py-3 font-medium">{content.installedAtCol}</th>
                    <th className="px-4 py-3 font-medium">{content.accountCountCol}</th>
                    <th className="px-4 py-3 font-medium">{content.bindingCountCol}</th>
                    <th className="px-4 py-3 font-medium">{content.inspectCol}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line bg-white/60">
                  {plugin.merchantInstalls.map((install) => (
                    <tr key={install.merchantId}>
                      <td className="px-4 py-3.5">
                        <p className="font-medium text-foreground">{install.merchantName}</p>
                        <p className="mt-1 font-mono text-xs text-muted">{install.merchantCode}</p>
                      </td>
                      <td className="px-4 py-3.5 text-muted">
                        {formatDateTime(install.installedAt, locale)}
                      </td>
                      <td className="px-4 py-3.5 text-muted">{install.channelAccountCount}</td>
                      <td className="px-4 py-3.5 text-muted">{install.bindingCount}</td>
                      <td className="px-4 py-3.5">
                        <Link
                          href={`/admin/merchants/${install.merchantId}`}
                          className={subtleButtonClass}
                        >
                          {content.openMerchant}
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      <section className={`${panelClass} p-5 sm:p-6`}>
        <h2 className="text-2xl font-semibold text-foreground">{content.auditTitle}</h2>
        <p className="mt-2 text-sm leading-7 text-muted">{content.auditDesc}</p>

        {auditLogs.length === 0 ? (
          <div className="mt-6">
            <EmptyState title={content.noAudit} description={plugin.summary} />
          </div>
        ) : (
          <div className={`mt-6 ${tableWrapperClass}`}>
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-white/80 text-xs uppercase tracking-[0.18em] text-muted">
                  <tr>
                    <th className="px-4 py-3 font-medium">{content.actorCol}</th>
                    <th className="px-4 py-3 font-medium">{content.actionCol}</th>
                    <th className="px-4 py-3 font-medium">{content.summaryCol}</th>
                    <th className="px-4 py-3 font-medium">{content.timeCol}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line bg-white/60">
                  {auditLogs.map((log) => (
                    <tr key={log.id}>
                      <td className="px-4 py-3.5 text-muted">{log.actor}</td>
                      <td className="px-4 py-3.5 font-mono text-xs text-foreground">
                        {log.action}
                      </td>
                      <td className="px-4 py-3.5 text-muted">{log.summary}</td>
                      <td className="px-4 py-3.5 text-muted">
                        {formatDateTime(log.createdAt, locale)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
