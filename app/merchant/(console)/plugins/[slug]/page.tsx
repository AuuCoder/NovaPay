import Link from "next/link";
import { notFound } from "next/navigation";
import { hasMerchantPermission } from "@/lib/merchant-rbac";
import { requireMerchantPermission } from "@/lib/merchant-session";
import { getCurrentLocale } from "@/lib/i18n-server";
import { getMarketplacePaymentPluginDetail } from "@/lib/plugins/marketplace";
import { purchaseMerchantMarketplacePluginAction } from "@/app/merchant/actions";
import {
  formatMarketplaceDate,
  getCapabilityLabel,
  getProviderKeyLabel,
} from "../plugin-market-shared";
import { MerchantRegistryPurchaseFinalizer } from "../registry-purchase-finalizer";

export default async function MerchantPluginDetailPage({
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
          back: "Back to market",
          detail: "Plugin detail",
          install: "Install plugin",
          purchase: "Purchase via Registry",
          configure: "Configure channel",
          installed: "Installed",
          available: "Available",
          trusted: "Trusted",
          purchased: "Purchased",
          purchaseRequired: "Purchase Required",
          unpaidNotice:
            "This paid plugin is installed in your workspace but has not been purchased yet. Configuration is available, but channel calls will fail until a license is issued.",
          description: "Description",
          capabilities: "Capabilities",
          metadata: "Information",
          packageName: "Package",
          version: "Version",
          provider: "Provider",
          installedAt: "Installed at",
          callback: "Callback route",
          callbackYes: "Dedicated callback route available",
          callbackNo: "No callback route required",
          profileRule: "Merchant profile gate",
          profileYes: "Profile completion required before activation",
          profileNo: "No extra profile gate",
          usage: "Current usage",
          merchants: "Merchant installs",
          orders: "Orders",
          refunds: "Refunds",
          source: "Source",
          runtime: "Runtime",
        }
      : {
          back: "返回市场",
          detail: "插件详情",
          install: "安装插件",
          purchase: "通过 Registry 购买",
          configure: "配置通道",
          installed: "已安装",
          available: "可安装",
          trusted: "官方 / 受信任",
          purchased: "已购买",
          purchaseRequired: "需先购买",
          unpaidNotice:
            "此付费插件已经安装到工作区，但尚未购买许可证。可以打开通道配置，但在签发许可证之前调用会失败，请先完成购买。",
          description: "插件介绍",
          capabilities: "能力",
          metadata: "信息",
          packageName: "包名",
          version: "版本",
          provider: "提供方",
          installedAt: "安装时间",
          callback: "回调能力",
          callbackYes: "支持专属回调路由",
          callbackNo: "无需回调路由",
          profileRule: "资料要求",
          profileYes: "启用前需要补齐资料",
          profileNo: "无额外资料门槛",
          usage: "当前使用情况",
          merchants: "商户安装数",
          orders: "订单数",
          refunds: "退款数",
          source: "来源",
          runtime: "运行时",
        };

  const needsPurchase =
    plugin.pricingMode === "PAID" && !merchantPurchased;

  return (
    <div className="space-y-8">
      <MerchantRegistryPurchaseFinalizer slug={plugin.slug} locale={locale} />
      <section className="rounded-[1.75rem] border border-line bg-[linear-gradient(135deg,rgba(255,255,255,0.96),rgba(248,243,236,0.9))] p-6 shadow-[var(--shadow)] sm:p-8">
        <Link href="/merchant/plugins" className="text-sm font-medium text-accent">
          ← {content.back}
        </Link>

        <div className="mt-6 flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
          <div className="flex items-start gap-5">
            <div className="flex h-20 w-20 items-center justify-center rounded-[1.75rem] bg-[linear-gradient(135deg,rgba(217,108,31,0.18),rgba(13,122,98,0.18))] text-3xl font-semibold text-foreground">
              {plugin.displayName.slice(0, 1)}
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#8a7159]">
                {content.detail}
              </p>
              <h1 className="mt-3 text-4xl font-semibold tracking-[-0.04em] text-foreground">
                {plugin.displayName}
              </h1>
              <p className="mt-2 font-mono text-xs text-muted">{plugin.slug}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <StatusBadge tone={merchantInstalled ? "success" : "neutral"}>
                  {merchantInstalled ? content.installed : content.available}
                </StatusBadge>
                <StatusBadge tone="success">{content.trusted}</StatusBadge>
                {plugin.pricingMode === "PAID" ? (
                  <StatusBadge tone={merchantPurchased ? "success" : "neutral"}>
                    {merchantPurchased ? content.purchased : content.purchaseRequired}
                  </StatusBadge>
                ) : null}
                <StatusBadge tone="neutral">{getProviderKeyLabel(plugin.providerKey, locale)}</StatusBadge>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            {merchantInstalled ? (
              <>
                {canManagePlugins && needsPurchase ? (
                  <form action={purchaseMerchantMarketplacePluginAction}>
                    <input type="hidden" name="slug" value={plugin.slug} />
                    <input type="hidden" name="redirectTo" value={`/merchant/plugins/${plugin.slug}`} />
                    <button type="submit" className="rounded-2xl bg-accent px-5 py-3 text-sm font-medium text-white shadow-[0_16px_30px_rgba(217,108,31,0.22)]">
                      {content.purchase}
                    </button>
                  </form>
                ) : null}
                <Link
                  href={`/merchant/channels?channel=${plugin.channelCode}`}
                  className={
                    needsPurchase
                      ? "rounded-2xl border border-line bg-white px-5 py-3 text-sm font-medium text-foreground"
                      : "rounded-2xl bg-accent px-5 py-3 text-sm font-medium text-white shadow-[0_16px_30px_rgba(217,108,31,0.22)]"
                  }
                >
                  {content.configure}
                </Link>
              </>
            ) : canManagePlugins && plugin.pricingMode === "PAID" && !merchantPurchased ? (
              <form action={purchaseMerchantMarketplacePluginAction}>
                <input type="hidden" name="slug" value={plugin.slug} />
                <input type="hidden" name="redirectTo" value={`/merchant/plugins/${plugin.slug}`} />
                <button type="submit" className="rounded-2xl bg-accent px-5 py-3 text-sm font-medium text-white shadow-[0_16px_30px_rgba(217,108,31,0.22)]">
                  {content.purchase}
                </button>
              </form>
            ) : canManagePlugins ? (
              <Link href={`/merchant/plugins/${plugin.slug}/install`} className="rounded-2xl bg-accent px-5 py-3 text-sm font-medium text-white shadow-[0_16px_30px_rgba(217,108,31,0.22)]">
                {content.install}
              </Link>
            ) : null}
          </div>
        </div>

        {merchantInstalled && needsPurchase ? (
          <p
            role="alert"
            className="mt-6 rounded-[1.25rem] border border-[#f3d1ab] bg-[#fff4e7] px-5 py-4 text-xs leading-6 text-[#aa5a16]"
          >
            {content.unpaidNotice}
          </p>
        ) : null}
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.65fr)_360px]">
        <section className="rounded-[1.5rem] border border-line bg-white/78 p-6 shadow-[var(--shadow)]">
          <h2 className="text-2xl font-semibold text-foreground">{content.description}</h2>
          <p className="mt-4 text-sm leading-7 text-muted">{plugin.description}</p>

          <div className="mt-8">
            <h3 className="text-lg font-semibold text-foreground">{content.capabilities}</h3>
            <div className="mt-4 flex flex-wrap gap-2">
              {plugin.capabilities.map((capability) => (
                <span
                  key={capability}
                  className="rounded-full border border-line bg-white px-3 py-1.5 text-xs font-medium text-foreground"
                >
                  {getCapabilityLabel(capability, locale)}
                </span>
              ))}
            </div>
          </div>

          <div className="mt-8">
            <h3 className="text-lg font-semibold text-foreground">{content.usage}</h3>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-line bg-white/70 px-4 py-3">
                <p className="text-[11px] uppercase tracking-[0.18em] text-muted">{content.merchants}</p>
                <p className="mt-2 text-2xl font-semibold text-foreground">{plugin.usage.merchantAccountCount}</p>
              </div>
              <div className="rounded-2xl border border-line bg-white/70 px-4 py-3">
                <p className="text-[11px] uppercase tracking-[0.18em] text-muted">{content.orders}</p>
                <p className="mt-2 text-2xl font-semibold text-foreground">{plugin.usage.orderCount}</p>
              </div>
              <div className="rounded-2xl border border-line bg-white/70 px-4 py-3">
                <p className="text-[11px] uppercase tracking-[0.18em] text-muted">{content.refunds}</p>
                <p className="mt-2 text-2xl font-semibold text-foreground">{plugin.usage.refundCount}</p>
              </div>
            </div>
          </div>
        </section>

        <aside className="rounded-[1.5rem] border border-line bg-white/78 p-6 shadow-[var(--shadow)] xl:sticky xl:top-8 xl:self-start">
          <h2 className="text-lg font-semibold text-foreground">{content.metadata}</h2>
          <div className="mt-5 space-y-4 text-sm text-muted">
            <div>
              <p className="text-xs uppercase tracking-[0.18em]">{content.provider}</p>
              <p className="mt-1 text-foreground">{getProviderKeyLabel(plugin.providerKey, locale)}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.18em]">{content.version}</p>
              <p className="mt-1 text-foreground">{plugin.version}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.18em]">{content.packageName}</p>
              <p className="mt-1 break-all font-mono text-xs text-foreground">{plugin.packageName}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.18em]">{content.installedAt}</p>
              <p className="mt-1 text-foreground">{formatMarketplaceDate(merchantInstalledAt, locale)}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.18em]">{content.callback}</p>
              <p className="mt-1 text-foreground">
                {plugin.supportsCallbackRoute ? content.callbackYes : content.callbackNo}
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.18em]">{content.profileRule}</p>
              <p className="mt-1 text-foreground">
                {plugin.requiresMerchantProfileCompletion ? content.profileYes : content.profileNo}
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.18em]">{content.source}</p>
              <p className="mt-1 text-foreground">{plugin.source}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.18em]">{content.runtime}</p>
              <p className="mt-1 text-foreground">{plugin.runnable ? "Runtime Ready" : "Manifest Only"}</p>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

function StatusBadge({
  children,
  tone,
}: {
  children: string;
  tone: "success" | "neutral";
}) {
  const className =
    tone === "success"
      ? "inline-flex rounded-full border border-[#bde2d5] bg-[#f1fbf7] px-3 py-1 text-xs font-medium text-[#165746]"
      : "inline-flex rounded-full border border-line bg-white/80 px-3 py-1 text-xs font-medium text-foreground";

  return <span className={className}>{children}</span>;
}
