import Link from "next/link";
import {
  buildPageHref,
  readPageMessages,
  readSearchFilters,
  type SearchParamsInput,
} from "@/app/admin/support";
import {
  FlashMessage,
  StatusBadge,
  buttonClass,
  subtleButtonClass,
} from "@/app/admin/ui";
import {
  installMerchantMarketplacePluginAction,
  purchaseMerchantMarketplacePluginAction,
  uninstallMerchantMarketplacePluginAction,
} from "@/app/merchant/actions";
import { MerchantRegistryPurchaseFinalizer } from "./registry-purchase-finalizer";
import {
  formatMarketplaceDate,
  getCapabilityLabel,
  getProviderKeyLabel,
} from "./plugin-market-shared";
import { getCurrentLocale } from "@/lib/i18n-server";
import { hasMerchantPermission } from "@/lib/merchant-rbac";
import { requireMerchantPermission } from "@/lib/merchant-session";
import { listMerchantMarketplacePaymentPlugins } from "@/lib/plugins/marketplace";
export default async function MerchantPluginsPage({
  searchParams,
}: {
  searchParams?: SearchParamsInput;
}) {
  const session = await requireMerchantPermission("channel:read");
  const locale = await getCurrentLocale();
  const [messages, filters] = await Promise.all([
    readPageMessages(searchParams),
    readSearchFilters(searchParams, ["status", "q", "sort"]),
  ]);
  const plugins = await listMerchantMarketplacePaymentPlugins(
    session.merchantUser.merchantId,
    locale,
  );
  const canManagePlugins = hasMerchantPermission(
    session.merchantUser.role,
    "channel:write",
  );
  const keyword = filters.q.trim().toLowerCase();
  const statusFilter = filters.status;
  const sortFilter = filters.sort || "installed_desc";
  const installedCount = plugins.filter((plugin) => plugin.merchantInstalled).length;
  const availableCount = plugins.length - installedCount;

  const filteredPlugins = plugins.filter((plugin) => {
    const matchesStatus =
      statusFilter === "installed"
        ? plugin.merchantInstalled
        : statusFilter === "available"
          ? !plugin.merchantInstalled
          : true;

    if (!matchesStatus) {
      return false;
    }

    if (!keyword) {
      return true;
    }

    return [
      plugin.displayName,
      plugin.channelCode,
      plugin.packageName,
      plugin.vendor,
      plugin.summary,
      plugin.description,
    ]
      .join(" ")
      .toLowerCase()
      .includes(keyword);
  });

  const sortedPlugins = [...filteredPlugins].sort((left, right) => {
    switch (sortFilter) {
      case "name_asc":
        return left.displayName.localeCompare(right.displayName);
      case "channel_asc":
        return left.channelCode.localeCompare(right.channelCode);
      case "installed_desc":
      default:
        return Number(right.merchantInstalled) - Number(left.merchantInstalled);
    }
  });

  const content =
    locale === "en"
      ? {
          eyebrow: "Plugin Market",
          title: "Payment plugin marketplace",
          description:
            "Expand your merchant payment stack by installing remote plugins, then configure them in the channel workspace.",
          heroTitle: "Install only the payment capabilities you truly need.",
          heroBody:
            "NovaPay keeps plugin distribution, installation, and merchant configuration separated, so your channel workspace stays focused and safer.",
          searchPlaceholder: "Search plugin, provider, capability",
          all: "All",
          installedOnly: "Installed",
          availableOnly: "Available",
          sortInstalled: "Installed first",
          sortName: "Name",
          sortChannel: "Channel",
          apply: "Apply",
          statTotal: "Catalog",
          statInstalled: "Installed",
          statAvailable: "Available",
          installed: "Installed",
          available: "Available",
          trusted: "Trusted",
          purchased: "Purchased",
          purchaseRequired: "Purchase Required",
          install: "Install",
          purchase: "Purchase",
          uninstall: "Uninstall",
          configure: "Configure",
          emptyTitle: "No plugins matched the current filter",
          emptyDesc: "Try another search or switch the status filter.",
          readonly:
            "Your current role can browse merchant plugins, but cannot install or uninstall them.",
          details: "Details",
          installedAt: "Installed",
          detailsLink: "View detail",
          provider: "Provider",
          version: "Version",
          packageLabel: "Package",
          callbackRouteEnabled: "Dedicated callback route",
          callbackRouteDisabled: "No callback route",
          profileRuleRequired: "Profile required before activation",
          profileRuleOptional: "No extra profile gate",
        }
      : {
          eyebrow: "插件市场",
          title: "支付插件市场",
          description: "先安装远程支付插件，再到支付通道页完成参数配置和启用。",
          heroTitle: "只安装当前商户真正需要的支付能力。",
          heroBody:
            "NovaPay 把插件分发、安装和商户配置拆开，确保支付通道工作区保持聚焦，也更不容易误开无关方式。",
          searchPlaceholder: "搜索插件、提供方、能力",
          all: "全部",
          installedOnly: "已安装",
          availableOnly: "可安装",
          sortInstalled: "已安装优先",
          sortName: "插件名",
          sortChannel: "通道",
          apply: "筛选",
          statTotal: "目录总数",
          statInstalled: "已安装",
          statAvailable: "可安装",
          installed: "已安装",
          available: "可安装",
          trusted: "官方 / 受信任",
          purchased: "已购买",
          purchaseRequired: "需先购买",
          install: "安装",
          purchase: "购买",
          uninstall: "卸载",
          configure: "配置",
          emptyTitle: "当前筛选条件下没有插件",
          emptyDesc: "请更换关键词或切换状态筛选。",
          readonly: "当前角色只能浏览插件，不能执行安装或卸载。",
          details: "详情",
          installedAt: "安装时间",
          detailsLink: "查看详情",
          provider: "提供方",
          version: "版本",
          packageLabel: "包名",
          callbackRouteEnabled: "支持专属回调路由",
          callbackRouteDisabled: "无需回调路由",
          profileRuleRequired: "启用前需补齐资料",
          profileRuleOptional: "无额外资料门槛",
        };

  const filterItems = [
    { key: "", label: content.all, count: plugins.length },
    { key: "installed", label: content.installedOnly, count: installedCount },
    { key: "available", label: content.availableOnly, count: availableCount },
  ];

  function renderAction(plugin: (typeof plugins)[number]) {
    const canInstallPaidPlugin =
      plugin.pricingMode !== "PAID" || plugin.merchantPurchased;

    if (plugin.merchantInstalled) {
      return (
        <div className="flex gap-2">
          <Link href={`/merchant/channels?channel=${plugin.channelCode}`} className={buttonClass}>
            {content.configure}
          </Link>
          {plugin.pricingMode === "PAID" && !plugin.merchantPurchased && canManagePlugins ? (
            <form action={purchaseMerchantMarketplacePluginAction}>
              <input type="hidden" name="slug" value={plugin.slug} />
              <input type="hidden" name="redirectTo" value="/merchant/plugins" />
              <button type="submit" className={subtleButtonClass}>
                {content.purchase}
              </button>
            </form>
          ) : null}
          {canManagePlugins ? (
            <form action={uninstallMerchantMarketplacePluginAction}>
              <input type="hidden" name="slug" value={plugin.slug} />
              <input type="hidden" name="redirectTo" value="/merchant/plugins" />
              <button type="submit" className={subtleButtonClass}>
                {content.uninstall}
              </button>
            </form>
          ) : null}
        </div>
      );
    }

    if (!canManagePlugins) {
      return <span className="text-xs text-muted">—</span>;
    }

    if (!canInstallPaidPlugin) {
      return (
        <form action={purchaseMerchantMarketplacePluginAction}>
          <input type="hidden" name="slug" value={plugin.slug} />
          <input type="hidden" name="redirectTo" value="/merchant/plugins" />
          <button type="submit" className={buttonClass}>
            {content.purchase}
          </button>
        </form>
      );
    }

    return (
      <form action={installMerchantMarketplacePluginAction}>
        <input type="hidden" name="slug" value={plugin.slug} />
        <input type="hidden" name="redirectTo" value="/merchant/plugins" />
        <button type="submit" className={buttonClass}>
          {content.install}
        </button>
      </form>
    );
  }

  return (
    <div className="space-y-8">
      <MerchantRegistryPurchaseFinalizer locale={locale} />
      <FlashMessage success={messages.success} error={messages.error} />

      <section className="rounded-[1.75rem] border border-line bg-[linear-gradient(135deg,rgba(255,255,255,0.96),rgba(248,243,236,0.88))] p-6 shadow-[var(--shadow)] sm:p-8">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1.2fr)_360px] lg:items-center">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#8a7159]">
              {content.eyebrow}
            </p>
            <h1 className="mt-4 text-4xl font-semibold tracking-[-0.04em] text-foreground sm:text-5xl">
              {content.title}
            </h1>
            <p className="mt-4 max-w-2xl text-lg leading-8 text-muted">{content.description}</p>
            <p className="mt-6 max-w-2xl text-sm leading-7 text-muted">{content.heroBody}</p>
          </div>

          <div className="rounded-[1.5rem] border border-white/80 bg-white/72 p-5 shadow-[0_18px_44px_rgba(66,40,12,0.10)]">
            <p className="text-lg font-semibold text-foreground">{content.heroTitle}</p>
            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-line bg-white/80 px-4 py-3">
                <p className="text-[11px] uppercase tracking-[0.18em] text-muted">{content.statTotal}</p>
                <p className="mt-2 text-2xl font-semibold text-foreground">{plugins.length}</p>
              </div>
              <div className="rounded-2xl border border-[#bde2d5] bg-[#f1fbf7] px-4 py-3">
                <p className="text-[11px] uppercase tracking-[0.18em] text-[#4a7d6c]">{content.statInstalled}</p>
                <p className="mt-2 text-2xl font-semibold text-[#165746]">{installedCount}</p>
              </div>
              <div className="rounded-2xl border border-[#d7c2ac] bg-[#fff8f1] px-4 py-3">
                <p className="text-[11px] uppercase tracking-[0.18em] text-[#9b6b44]">{content.statAvailable}</p>
                <p className="mt-2 text-2xl font-semibold text-[#7b4a23]">{availableCount}</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {!canManagePlugins ? (
        <section className="rounded-[1.5rem] border border-line bg-white/70 px-5 py-4 text-sm leading-7 text-muted shadow-[var(--shadow)]">
          {content.readonly}
        </section>
      ) : null}

      <section className="rounded-[1.5rem] border border-line bg-white/72 p-5 shadow-[var(--shadow)]">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-wrap gap-2">
            {filterItems.map((item) => {
              const active = statusFilter === item.key;
              const href = buildPageHref(
                "/merchant/plugins",
                {
                  status: item.key || null,
                  q: filters.q || null,
                  sort: sortFilter || null,
                },
                1,
              );

              return (
                <a
                  key={item.key || "all"}
                  href={href}
                  className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                    active
                      ? "border-accent bg-accent text-white"
                      : "border-line bg-white text-foreground hover:border-accent/40"
                  }`}
                >
                  {item.label} ({item.count})
                </a>
              );
            })}
          </div>

          <form className="grid gap-2.5 md:grid-cols-[minmax(220px,1fr)_132px_148px_auto]">
            <input
              type="text"
              name="q"
              defaultValue={filters.q}
              placeholder={content.searchPlaceholder}
              className="w-full rounded-2xl border border-line bg-white/90 px-4 py-3 text-sm text-foreground outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
            />
            <select
              name="status"
              defaultValue={statusFilter}
              className="w-full rounded-2xl border border-line bg-white/90 px-4 py-3 text-sm text-foreground outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
            >
              <option value="">{content.all}</option>
              <option value="installed">{content.installedOnly}</option>
              <option value="available">{content.availableOnly}</option>
            </select>
            <select
              name="sort"
              defaultValue={sortFilter}
              className="w-full rounded-2xl border border-line bg-white/90 px-4 py-3 text-sm text-foreground outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
            >
              <option value="installed_desc">{content.sortInstalled}</option>
              <option value="name_asc">{content.sortName}</option>
              <option value="channel_asc">{content.sortChannel}</option>
            </select>
            <button type="submit" className={buttonClass}>
              {content.apply}
            </button>
          </form>
        </div>
      </section>

      {sortedPlugins.length === 0 ? (
        <section className="rounded-[1.5rem] border border-line bg-white/72 p-8 text-center shadow-[var(--shadow)]">
          <h2 className="text-xl font-semibold text-foreground">{content.emptyTitle}</h2>
          <p className="mt-2 text-sm leading-7 text-muted">{content.emptyDesc}</p>
        </section>
      ) : (
        <section className="grid gap-5 lg:grid-cols-2 xl:grid-cols-3">
          {sortedPlugins.map((plugin) => (
                <article
                  key={plugin.slug}
                  className="rounded-[1.5rem] border border-line bg-white/78 p-5 shadow-[var(--shadow)]"
                >
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-4">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,rgba(217,108,31,0.16),rgba(13,122,98,0.16))] text-xl font-semibold text-foreground">
                    {plugin.displayName.slice(0, 1)}
                  </div>
                  <div>
                    <Link href={`/merchant/plugins/${plugin.slug}`} className="text-lg font-semibold text-foreground hover:text-accent">
                      {plugin.displayName}
                    </Link>
                    <p className="mt-1 text-xs font-mono text-muted">{plugin.slug}</p>
                    <p className="mt-2 text-xs text-muted">
                      {content.provider}: {getProviderKeyLabel(plugin.providerKey, locale)}
                    </p>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <StatusBadge tone={plugin.merchantInstalled ? "success" : "neutral"}>
                    {plugin.merchantInstalled ? content.installed : content.available}
                  </StatusBadge>
                  <StatusBadge tone="success">{content.trusted}</StatusBadge>
                  {plugin.pricingMode === "PAID" ? (
                    <StatusBadge tone={plugin.merchantPurchased ? "success" : "neutral"}>
                      {plugin.merchantPurchased ? content.purchased : content.purchaseRequired}
                    </StatusBadge>
                  ) : null}
                </div>
              </div>

              <p className="mt-4 text-sm leading-6 text-muted">{plugin.summary}</p>

              <div className="mt-4 flex flex-wrap gap-2">
                {plugin.capabilities.slice(0, 4).map((capability) => (
                  <span
                    key={capability}
                    className="rounded-full border border-line bg-white px-2.5 py-1 text-[11px] font-medium text-foreground"
                  >
                    {getCapabilityLabel(capability, locale)}
                  </span>
                ))}
              </div>

              <div className="mt-5 rounded-2xl border border-line bg-white/70 p-3 text-xs leading-6 text-muted">
                <p>{content.packageLabel}: {plugin.packageName}</p>
                <p>{content.version}: {plugin.version}</p>
                <p>{content.installedAt}: {formatMarketplaceDate(plugin.merchantInstalledAt, locale)}</p>
                <p>
                  {plugin.supportsCallbackRoute
                    ? content.callbackRouteEnabled
                    : content.callbackRouteDisabled}
                </p>
                <p>
                  {plugin.requiresMerchantProfileCompletion
                    ? content.profileRuleRequired
                    : content.profileRuleOptional}
                </p>
              </div>

              <details className="mt-4 rounded-2xl border border-line bg-white/65 p-3">
                <summary className="cursor-pointer list-none text-xs font-medium text-foreground">
                  {content.details}
                </summary>
                <p className="mt-3 text-xs leading-6 text-muted">{plugin.description}</p>
              </details>

              <div className="mt-5 flex items-center justify-between gap-3">
                <Link href={`/merchant/plugins/${plugin.slug}`} className={subtleButtonClass}>
                  {content.detailsLink}
                </Link>
                {renderAction(plugin)}
              </div>
            </article>
          ))}
        </section>
      )}
    </div>
  );
}
