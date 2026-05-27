import { Fragment } from "react";
import Link from "next/link";
import { batchMarketplacePluginAction } from "@/app/admin/actions";
import {
  installMarketplacePluginAction,
  markMarketplacePluginPurchasedAction,
  purchaseMarketplacePluginAction,
  revalidateMarketplaceLicensesAction,
  syncMarketplacePluginsAction,
  toggleMarketplacePluginEnabledAction,
  uninstallMarketplacePluginAction,
} from "@/app/admin/actions";
import {
  buildPageHref,
  getPaginationState,
  parsePageParam,
  readSearchFilters,
  type SearchParamsInput,
} from "@/app/admin/support";
import {
  AdminPageHeader,
  EmptyState,
  PaginationNav,
  StatusBadge,
  buttonClass,
  inputClass,
  panelClass,
  selectClass,
  subtleButtonClass,
  tableWrapperClass,
} from "@/app/admin/ui";
import { RegistryPurchaseFinalizer } from "./registry-purchase-finalizer";
import { requireAdminPermission } from "@/lib/admin-session";
import { getCurrentLocale } from "@/lib/i18n-server";
import { getSchedulerStatus } from "@/lib/plugins/license-revalidation-scheduler";
import { listMarketplacePaymentPlugins } from "@/lib/plugins/marketplace";
import type { PaymentCapability } from "@/lib/payments/types";
import { hasPermission } from "@/lib/rbac";

function formatDate(value: Date | null, locale: "zh" | "en") {
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
    timeZone: "Asia/Shanghai",
  }).format(value);
}

function formatInterval(ms: number, locale: "zh" | "en") {
  if (ms % (24 * 60 * 60 * 1000) === 0) {
    const days = ms / (24 * 60 * 60 * 1000);
    return locale === "en" ? `${days}d` : `${days} 天`;
  }

  if (ms % (60 * 60 * 1000) === 0) {
    const hours = ms / (60 * 60 * 1000);
    return locale === "en" ? `${hours}h` : `${hours} 小时`;
  }

  if (ms % (60 * 1000) === 0) {
    const minutes = ms / (60 * 1000);
    return locale === "en" ? `${minutes}m` : `${minutes} 分钟`;
  }

  return locale === "en" ? `${ms}ms` : `${ms} 毫秒`;
}

const PLUGIN_PAGE_SIZE = 10;

function getCapabilityLabel(capability: PaymentCapability, locale: "zh" | "en") {
  const labels: Record<PaymentCapability, { zh: string; en: string }> = {
    page_redirect: {
      zh: "页面跳转",
      en: "Page Redirect",
    },
    native_qr: {
      zh: "原生二维码",
      en: "Native QR",
    },
    notify_callback: {
      zh: "异步通知",
      en: "Notify Callback",
    },
    return_url: {
      zh: "返回地址",
      en: "Return URL",
    },
    quote_lock: {
      zh: "锁价",
      en: "Quote Lock",
    },
    rsa2_signature: {
      zh: "RSA2 签名",
      en: "RSA2 Signature",
    },
    order_query: {
      zh: "查单",
      en: "Order Query",
    },
    order_close: {
      zh: "关单",
      en: "Order Close",
    },
    refund: {
      zh: "退款",
      en: "Refund",
    },
    refund_query: {
      zh: "退款查询",
      en: "Refund Query",
    },
  };

  return labels[capability][locale];
}

function getImplementationStatusLabel(
  status: "ready" | "skeleton" | undefined,
  locale: "zh" | "en",
) {
  if (status === "skeleton") {
    return locale === "en" ? "Skeleton" : "骨架实现";
  }

  return locale === "en" ? "Ready" : "可运行";
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

export default async function PluginsPage({
  searchParams,
}: {
  searchParams?: SearchParamsInput;
}) {
  const session = await requireAdminPermission("plugin_marketplace:read");
  const locale = await getCurrentLocale();
  const filters = await readSearchFilters(searchParams, [
    "status",
    "channelCode",
    "q",
    "sort",
    "page",
  ]);
  const plugins = await listMarketplacePaymentPlugins(locale);
  const schedulerStatus = getSchedulerStatus();
  const canManagePlugins = hasPermission(
    session.adminUser.role,
    "plugin_marketplace:write",
  );
  const keyword = filters.q.trim().toLowerCase();
  const statusFilter = filters.status;
  const channelCodeFilter = filters.channelCode;
  const sortFilter = filters.sort || "updated_desc";
  const requestedPage = parsePageParam(filters.page);

  const filteredPlugins = plugins.filter((plugin) => {
    const matchesStatus =
      statusFilter === "installed"
        ? plugin.installed
        : statusFilter === "enabled"
          ? plugin.installed && plugin.enabled
          : statusFilter === "disabled"
            ? plugin.installed && !plugin.enabled
            : true;

    if (!matchesStatus) {
      return false;
    }

    if (channelCodeFilter && plugin.channelCode !== channelCodeFilter) {
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
        return Number(right.installed) - Number(left.installed);
      case "synced_desc":
        return (
          (right.lastSyncedAt?.getTime() ?? 0) - (left.lastSyncedAt?.getTime() ?? 0)
        );
      case "updated_desc":
      default:
        return right.updatedAt.getTime() - left.updatedAt.getTime();
    }
  });

  const pagination = getPaginationState(
    sortedPlugins.length,
    requestedPage,
    PLUGIN_PAGE_SIZE,
  );
  const pagedPlugins = sortedPlugins.slice(
    pagination.offset,
    pagination.offset + PLUGIN_PAGE_SIZE,
  );

  const installedCount = plugins.filter((plugin) => plugin.installed).length;
  const enabledCount = plugins.filter((plugin) => plugin.installed && plugin.enabled).length;
  const disabledCount = plugins.filter((plugin) => plugin.installed && !plugin.enabled).length;

  const filterItems = [
    {
      key: "",
      label: locale === "en" ? "All" : "全部",
      count: plugins.length,
    },
    {
      key: "installed",
      label: locale === "en" ? "Installed" : "已安装",
      count: installedCount,
    },
    {
      key: "enabled",
      label: locale === "en" ? "Enabled" : "已启用",
      count: enabledCount,
    },
    {
      key: "disabled",
      label: locale === "en" ? "Disabled" : "已停用",
      count: disabledCount,
    },
  ];

  const content =
    locale === "en"
      ? {
          eyebrow: "Plugin Market",
          title: "Remote plugin marketplace",
          description:
            "Review, purchase, install, and enable plugins that were uploaded to the remote NovaPay plugin marketplace.",
          syncButton: "Sync Marketplace",
          revalidateButton: "Revalidate Licenses",
          sourcesButton: "Registry Sources",
          monitorTitle: "License Revalidation",
          monitorDesc:
            "Track whether the background license monitor is running and whether the latest pass disabled any plugin due to revoked or expired licenses.",
          monitorRunning: "Running",
          monitorStopped: "Stopped",
          monitorHealthy: "Healthy",
          monitorError: "Needs Review",
          monitorIdle: "Waiting for first run",
          monitorInterval: "Interval",
          monitorLastRun: "Last Run",
          monitorLastResult: "Last Result",
          monitorLastError: "Last Error",
          monitorNotRunYet: "Not run yet",
          monitorNoError: "No recent scheduler errors.",
          monitorInspected: "Inspected",
          monitorDisabled: "Disabled",
          toolbarTitle: "Catalog",
          toolbarDesc:
            "Filter the catalog first, then expand only the plugins that need a closer review.",
          searchPlaceholder: "Search plugin, channel, package, vendor",
          allChannels: "All Channels",
          sortUpdated: "Recently Updated",
          sortSynced: "Recently Synced",
          sortName: "Name",
          sortChannel: "Channel",
          sortInstalled: "Installed First",
          searchButton: "Apply",
          batchActionLabel: "Bulk Action",
          batchApply: "Run",
          batchInstall: "Install Selected",
          batchEnable: "Enable Selected",
          batchDisable: "Disable Selected",
          batchUninstall: "Uninstall Selected",
          selectLabel: "Select",
          statTotal: "Catalog",
          statInstalled: "Installed",
          statEnabled: "Enabled",
          statDisabled: "Disabled",
          sourceTrusted: "Trusted",
          sourceUntrusted: "Review Needed",
          sourceLocal: "Local Package",
          sourceBuiltin: "Built-in",
          sourceRemote: "Registry Plugin",
          pricingFree: "Free",
          pricingPaid: "Paid",
          purchasedBadge: "Purchased",
          notPurchasedBadge: "Purchase Required",
          markPurchased: "Mark Purchased",
          purchase: "Purchase",
          packageLabel: "Package",
          versionLabel: "Version",
          providerLabel: "Provider",
          installedAt: "Installed At",
          syncedAt: "Last Synced",
          capabilitiesLabel: "Capabilities",
          usageLabel: "Usage",
          usageAccounts: "Merchant Accounts",
          usageBindings: "Bindings",
          usageOrders: "Orders",
          usageRefunds: "Refunds",
          usageInspectBindings: "Inspect bindings",
          usageInspectMerchants: "Inspect merchants",
          usageInspectOrders: "Inspect orders",
          inUseBadge: "In Use",
          idleBadge: "Idle",
          pluginCol: "Plugin",
          channelCol: "Channel",
          runtimeCol: "Runtime",
          syncedCol: "Synced",
          actionsCol: "Actions",
          detailsSummary: "View details",
          emptyTitle: "No plugins found",
          emptyDesc: "Try a different filter or sync the built-in catalog first.",
          install: "Install",
          import: "Import",
          uninstall: "Uninstall",
          remove: "Remove",
          enable: "Enable",
          publish: "Publish",
          disable: "Disable",
          unpublish: "Unpublish",
          installedBadge: "Installed",
          notInstalledBadge: "Available",
          importedBadge: "Imported",
          notImportedBadge: "Not Imported",
          enabledBadge: "Active",
          disabledBadge: "Disabled",
          publishedBadge: "Published",
          notPublishedBadge: "Not Published",
          manifestOnlyBadge: "Manifest Only",
          callbackRouteLabel: "Callback Route",
          callbackRouteEnabled: "Dedicated callback route",
          callbackRouteDisabled: "No callback route required",
          profileRuleLabel: "Merchant Profile",
          profileRuleRequired: "Profile required before activation",
          profileRuleOptional: "No extra profile gate",
          implementationLabel: "Implementation",
          localPathLabel: "Local Manifest",
          manifestVersionLabel: "Manifest Version",
          runtimeLoadErrorBadge: "Runtime Error",
          readOnlyNotice:
            "Your current role can review plugin status, but install, enable, disable, and uninstall actions are restricted.",
          activeUsageWarning:
            "Disable is blocked while active merchant instances or bindings still depend on this plugin.",
          configuredUsageWarning:
            "Uninstall is blocked while merchant instances or bindings are still attached to this plugin.",
          safeRuntimeHint:
            "No active merchant runtime depends on this plugin right now.",
          localPackageHint:
            "This local package is currently manifest-only. It can be cataloged safely, but it cannot be enabled for live runtime execution yet.",
          remoteRuntimeHint:
            "This remote package is installed, but its runtime definition is not available in the current process yet.",
          merchantVisibilityImported:
            "This package is imported into platform governance, but merchants still cannot see it until you publish it.",
          merchantVisibilityPublished:
            "This package has been published and can now appear in merchant plugin workspaces.",
          merchantVisibilityUnimported:
            "This package has been discovered locally, but it has not been imported into the platform catalog yet.",
          pageRange: "Showing",
          pageConnector: "of",
          previous: "Previous Page",
          next: "Next Page",
        }
      : {
          eyebrow: "Plugin Market",
          title: "远程插件市场",
          description:
            "这里集中管理远程 NovaPay 插件市场上传的插件，包括同步、购买、安装、启用和审核状态。",
          syncButton: "同步插件市场",
          revalidateButton: "重校验许可证",
          sourcesButton: "商店源配置",
          monitorTitle: "许可证重校验",
          monitorDesc:
            "这里直接查看后台许可证巡检是否在运行，以及最近一次执行有没有因为许可证过期或撤销而停用插件。",
          monitorRunning: "运行中",
          monitorStopped: "未运行",
          monitorHealthy: "状态正常",
          monitorError: "需要关注",
          monitorIdle: "等待首次执行",
          monitorInterval: "执行周期",
          monitorLastRun: "上次执行",
          monitorLastResult: "最近结果",
          monitorLastError: "最近错误",
          monitorNotRunYet: "尚未执行",
          monitorNoError: "最近没有调度器错误。",
          monitorInspected: "检查数",
          monitorDisabled: "停用数",
          toolbarTitle: "插件目录",
          toolbarDesc: "先筛选，再查看，最后只对需要处理的插件展开详情。",
          searchPlaceholder: "搜索插件名、通道、包名、提供方",
          allChannels: "全部通道",
          sortUpdated: "最近更新",
          sortSynced: "最近同步",
          sortName: "插件名",
          sortChannel: "通道",
          sortInstalled: "已安装优先",
          searchButton: "应用筛选",
          batchActionLabel: "批量操作",
          batchApply: "执行",
          batchInstall: "批量安装",
          batchEnable: "批量启用",
          batchDisable: "批量停用",
          batchUninstall: "批量卸载",
          selectLabel: "选择",
          statTotal: "目录总数",
          statInstalled: "已安装",
          statEnabled: "已启用",
          statDisabled: "已停用",
          sourceTrusted: "受信任",
          sourceUntrusted: "待审核",
          sourceLocal: "本地插件包",
          sourceBuiltin: "内置插件",
          sourceRemote: "远程商店插件",
          pricingFree: "免费",
          pricingPaid: "收费",
          purchasedBadge: "已购",
          notPurchasedBadge: "待购买",
          markPurchased: "记录已购",
          purchase: "购买",
          packageLabel: "包名",
          versionLabel: "版本",
          providerLabel: "提供方",
          installedAt: "安装时间",
          syncedAt: "最近同步",
          capabilitiesLabel: "能力清单",
          usageLabel: "使用情况",
          usageAccounts: "商户实例",
          usageBindings: "路由绑定",
          usageOrders: "订单",
          usageRefunds: "退款",
          usageInspectBindings: "查看绑定",
          usageInspectMerchants: "查看商户",
          usageInspectOrders: "查看订单",
          inUseBadge: "使用中",
          idleBadge: "空闲",
          pluginCol: "插件",
          channelCol: "通道",
          runtimeCol: "运行状态",
          syncedCol: "同步时间",
          actionsCol: "操作",
          detailsSummary: "展开详情",
          emptyTitle: "暂无插件",
          emptyDesc: "可以先调整筛选条件，或者同步一次内置插件目录。",
          install: "安装",
          import: "导入",
          uninstall: "卸载",
          remove: "移除",
          enable: "启用",
          publish: "发布",
          disable: "停用",
          unpublish: "下线",
          installedBadge: "已安装",
          notInstalledBadge: "可安装",
          importedBadge: "已导入",
          notImportedBadge: "未导入",
          enabledBadge: "运行中",
          disabledBadge: "已停用",
          publishedBadge: "已发布",
          notPublishedBadge: "未发布",
          manifestOnlyBadge: "仅清单",
          callbackRouteLabel: "回调能力",
          callbackRouteEnabled: "带专属回调路由",
          callbackRouteDisabled: "无需回调路由",
          profileRuleLabel: "资料要求",
          profileRuleRequired: "启用前需补齐商户资料",
          profileRuleOptional: "无额外资料门槛",
          implementationLabel: "实现状态",
          localPathLabel: "本地清单路径",
          manifestVersionLabel: "清单版本",
          runtimeLoadErrorBadge: "运行时错误",
          readOnlyNotice: "当前角色仅可查看插件状态，不能执行安装、启用、停用或卸载。",
          activeUsageWarning: "仍有启用中的商户实例或路由绑定依赖当前插件，暂时不能停用。",
          configuredUsageWarning: "仍有关联的商户实例或路由绑定，清理前不能卸载当前插件。",
          safeRuntimeHint: "当前没有启用中的商户运行时依赖这个插件。",
          localPackageHint:
            "当前本地插件包只完成了清单接入，可以纳入市场管理，但还不能启用为真实运行时实现。",
          remoteRuntimeHint:
            "当前远程插件包已经安装，但本进程里还拿不到完整运行时定义。",
          merchantVisibilityImported:
            "当前插件包已经导入平台目录，但在发布前商户侧仍然看不到它。",
          merchantVisibilityPublished:
            "当前插件包已经发布，商户插件市场现在可以看到它。",
          merchantVisibilityUnimported:
            "当前插件包已经被本地扫描发现，但还没有导入平台目录。",
          pageRange: "当前显示",
          pageConnector: "/",
          previous: "上一页",
          next: "下一页",
        };

  type PluginItem = (typeof plugins)[number];
  const schedulerTone = schedulerStatus.lastRunError
    ? "danger"
    : schedulerStatus.running
      ? "success"
      : "warning";
  const schedulerLabel = schedulerStatus.lastRunError
    ? content.monitorError
    : schedulerStatus.running
      ? content.monitorHealthy
      : content.monitorIdle;

  function getInstallStatusLabel(plugin: PluginItem) {
    return plugin.installed ? content.installedBadge : content.notInstalledBadge;
  }

  function getRuntimeStatusLabel(plugin: PluginItem) {
    return plugin.enabled ? content.enabledBadge : content.disabledBadge;
  }

  function getSourceLabel(plugin: PluginItem) {
    return plugin.source === "REMOTE_SIGNED"
      ? content.sourceRemote
      : content.sourceBuiltin;
  }

  function getPluginActionState(plugin: PluginItem) {
    const hasActiveUsage =
      plugin.usage.enabledMerchantAccountCount > 0 || plugin.usage.enabledBindingCount > 0;
    const hasAnyUsage = plugin.usage.merchantAccountCount > 0 || plugin.usage.bindingCount > 0;
    const canRun = plugin.runnable;

    return {
      canInstall: !plugin.installed,
      canEnable: plugin.installed && !plugin.enabled && canRun,
      canDisable: plugin.installed && plugin.enabled && !hasActiveUsage,
      canUninstall: plugin.installed && !hasAnyUsage,
      canMarkPurchased:
        plugin.source === "REMOTE_SIGNED" &&
        plugin.pricingMode === "PAID" &&
        !plugin.purchasedAt,
      hasActiveUsage,
      hasAnyUsage,
      canRun,
    };
  }

  function renderOperationalHint(plugin: PluginItem) {
    const state = getPluginActionState(plugin);
    const ordersHref = buildPageHref(
      "/admin/orders",
      {
        channelCode: plugin.channelCode,
      },
      1,
    );
    const bindingsHref = buildPageHref(
      "/admin/bindings",
      {
        channelCode: plugin.channelCode,
      },
      1,
    );

    if (state.hasActiveUsage) {
      return (
        <p className="text-[11px] leading-5 text-[#aa5a16]">
          {content.activeUsageWarning}{" "}
          <a
            href={bindingsHref}
            className="font-medium text-foreground underline underline-offset-2"
          >
            {content.usageInspectBindings}
          </a>{" "}
          <a href={ordersHref} className="font-medium text-foreground underline underline-offset-2">
            {content.usageInspectOrders}
          </a>
        </p>
      );
    }

    if (state.hasAnyUsage) {
      return <p className="text-[11px] leading-5 text-[#aa5a16]">{content.configuredUsageWarning}</p>;
    }

    if (!state.canRun) {
      return (
        <p className="text-[11px] leading-5 text-muted">
          {content.remoteRuntimeHint}
        </p>
      );
    }

    return <p className="text-[11px] leading-5 text-muted">{content.safeRuntimeHint}</p>;
  }

  function renderActionButtons(plugin: PluginItem) {
    const state = getPluginActionState(plugin);

    if (!canManagePlugins) {
      return <span className="text-sm text-muted">—</span>;
    }

    if (state.canInstall) {
      return (
        <>
          <form action={installMarketplacePluginAction}>
            <input type="hidden" name="slug" value={plugin.slug} />
            <input type="hidden" name="redirectTo" value="/admin/plugins" />
            <button
              type="submit"
              disabled={plugin.pricingMode === "PAID" && !plugin.purchasedAt}
              className={`${buttonClass} w-full px-2.5 py-2 text-xs disabled:cursor-not-allowed disabled:opacity-45`}
            >
              {content.install}
            </button>
          </form>
          {state.canMarkPurchased ? (
            <>
              <form action={purchaseMarketplacePluginAction}>
                <input type="hidden" name="slug" value={plugin.slug} />
                <input type="hidden" name="redirectTo" value="/admin/plugins" />
                <button type="submit" className={`${buttonClass} w-full px-2.5 py-2 text-xs`}>
                  {content.purchase}
                </button>
              </form>
              <form action={markMarketplacePluginPurchasedAction}>
                <input type="hidden" name="slug" value={plugin.slug} />
                <input type="hidden" name="redirectTo" value="/admin/plugins" />
                <button type="submit" className={`${subtleButtonClass} w-full px-2.5 py-2 text-xs`}>
                  {content.markPurchased}
                </button>
              </form>
            </>
          ) : null}
        </>
      );
    }

    return (
      <>
        <form action={toggleMarketplacePluginEnabledAction}>
          <input type="hidden" name="slug" value={plugin.slug} />
          <input type="hidden" name="redirectTo" value="/admin/plugins" />
          <input type="hidden" name="enabled" value={plugin.enabled ? "" : "on"} />
          <button
            type="submit"
            disabled={plugin.enabled ? !state.canDisable : !state.canEnable}
            className={`w-full px-2.5 py-2 text-xs disabled:cursor-not-allowed disabled:opacity-45 ${
              plugin.enabled ? subtleButtonClass : buttonClass
            }`}
          >
            {plugin.enabled
              ? content.disable
              : content.enable}
          </button>
        </form>
        <form action={uninstallMarketplacePluginAction}>
          <input type="hidden" name="slug" value={plugin.slug} />
          <input type="hidden" name="redirectTo" value="/admin/plugins" />
          <button
            type="submit"
            disabled={!state.canUninstall}
            className={`${subtleButtonClass} w-full px-2.5 py-2 text-xs disabled:cursor-not-allowed disabled:opacity-45`}
          >
            {content.uninstall}
          </button>
        </form>
      </>
    );
  }

  function renderPluginDetails(plugin: PluginItem) {
    const merchantHref = buildPageHref(
      "/admin/merchants",
      {
        channelCode: plugin.channelCode,
      },
      1,
    );
    const bindingsHref = buildPageHref(
      "/admin/bindings",
      {
        channelCode: plugin.channelCode,
      },
      1,
    );
    const ordersHref = buildPageHref(
      "/admin/orders",
      {
        channelCode: plugin.channelCode,
      },
      1,
    );

    return (
      <details className="rounded-xl border border-line bg-white/75 p-2.5">
        <summary className="cursor-pointer list-none text-xs font-medium text-foreground">
          {content.detailsSummary}
        </summary>
        <div className="mt-2.5 space-y-2.5">
          <p className="text-xs leading-5 text-muted">{plugin.description}</p>
          <div className="flex flex-wrap gap-1.5">
            {plugin.capabilities.map((capability) => (
              <span
                key={capability}
                className="rounded-full border border-line bg-white px-2 py-0.5 text-[11px] font-medium text-foreground"
              >
                {getCapabilityLabel(capability, locale)}
              </span>
            ))}
          </div>
          <div className="grid gap-1 text-[11px] leading-5 text-muted">
            <p>{content.providerLabel}: {plugin.vendor}</p>
            <p>{content.packageLabel}: {plugin.packageName}</p>
            <p>{content.versionLabel}: {plugin.version}</p>
            <p>
              {content.channelCol}: {plugin.channelCode}
              {" · "}
              {content.providerLabel}: {getProviderKeyLabel(plugin.providerKey, locale)}
            </p>
            <p>
              {content.callbackRouteLabel}:{" "}
              {plugin.supportsCallbackRoute
                ? content.callbackRouteEnabled
                : content.callbackRouteDisabled}
            </p>
            <p>
              {content.profileRuleLabel}:{" "}
              {plugin.requiresMerchantProfileCompletion
                ? content.profileRuleRequired
                : content.profileRuleOptional}
            </p>
            <p>
              {content.implementationLabel}:{" "}
              {getImplementationStatusLabel(
                plugin.channelSummary.implementationStatus,
                locale,
              )}
            </p>
            {plugin.localPath ? (
              <p>{content.localPathLabel}: {plugin.localPath}</p>
            ) : null}
            {plugin.manifestVersion !== null ? (
              <p>{content.manifestVersionLabel}: {plugin.manifestVersion}</p>
            ) : null}
          </div>
          <div className="grid gap-1 text-[11px] leading-5 text-muted">
            <p className="font-medium text-foreground">{content.usageLabel}</p>
            <p>
              {content.usageAccounts}: {plugin.usage.enabledMerchantAccountCount}/
              {plugin.usage.merchantAccountCount}
              {" · "}
              <a
                href={merchantHref}
                className="font-medium text-foreground underline underline-offset-2"
              >
                {content.usageInspectMerchants}
              </a>
            </p>
            <p>
              {content.usageBindings}: {plugin.usage.enabledBindingCount}/
              {plugin.usage.bindingCount}
              {" · "}
              <a
                href={bindingsHref}
                className="font-medium text-foreground underline underline-offset-2"
              >
                {content.usageInspectBindings}
              </a>
            </p>
            <p>
              {content.usageOrders}: {plugin.usage.orderCount} · {content.usageRefunds}:{" "}
              {plugin.usage.refundCount}
              {" · "}
              <a
                href={ordersHref}
                className="font-medium text-foreground underline underline-offset-2"
              >
                {content.usageInspectOrders}
              </a>
            </p>
          </div>
          {renderOperationalHint(plugin)}
        </div>
      </details>
    );
  }

  return (
    <div className="space-y-5">
      <RegistryPurchaseFinalizer locale={locale} />
      <AdminPageHeader
        eyebrow={content.eyebrow}
        title={content.title}
        description={content.description}
        actions={
          <>
            <Link href="/admin/plugins/sources" className={subtleButtonClass}>
              {content.sourcesButton}
            </Link>
            {canManagePlugins ? (
              <>
                <form action={revalidateMarketplaceLicensesAction}>
                  <input type="hidden" name="redirectTo" value="/admin/plugins" />
                  <button type="submit" className={subtleButtonClass}>
                    {content.revalidateButton}
                  </button>
                </form>
                <form action={syncMarketplacePluginsAction}>
                  <input type="hidden" name="redirectTo" value="/admin/plugins" />
                  <button type="submit" className={buttonClass}>
                    {content.syncButton}
                  </button>
                </form>
              </>
            ) : null}
          </>
        }
      />

      <section className={`${panelClass} p-4 sm:p-5`}>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-2">
            <h2 className="text-xl font-semibold text-foreground">{content.monitorTitle}</h2>
            <p className="max-w-3xl text-sm leading-6 text-muted">{content.monitorDesc}</p>
          </div>
          <StatusBadge tone={schedulerTone}>
            {schedulerStatus.running ? content.monitorRunning : content.monitorStopped}
            {" · "}
            {schedulerLabel}
          </StatusBadge>
        </div>

        <div className="mt-5 grid gap-3 lg:grid-cols-4">
          <div className="rounded-[1.25rem] border border-line bg-white/75 p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-muted">
              {content.monitorInterval}
            </p>
            <p className="mt-2 text-lg font-semibold text-foreground">
              {formatInterval(schedulerStatus.intervalMs, locale)}
            </p>
          </div>
          <div className="rounded-[1.25rem] border border-line bg-white/75 p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-muted">
              {content.monitorLastRun}
            </p>
            <p className="mt-2 text-sm font-medium text-foreground">
              {schedulerStatus.lastRunAt
                ? formatDate(schedulerStatus.lastRunAt, locale)
                : content.monitorNotRunYet}
            </p>
          </div>
          <div className="rounded-[1.25rem] border border-line bg-white/75 p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-muted">
              {content.monitorLastResult}
            </p>
            <p className="mt-2 text-sm font-medium text-foreground">
              {content.monitorInspected}: {schedulerStatus.lastRunResult?.inspected ?? 0}
              {" · "}
              {content.monitorDisabled}: {schedulerStatus.lastRunResult?.disabled ?? 0}
            </p>
          </div>
          <div className="rounded-[1.25rem] border border-line bg-white/75 p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-muted">
              {content.monitorLastError}
            </p>
            <p
              className={`mt-2 text-sm ${
                schedulerStatus.lastRunError ? "text-[#973225]" : "text-muted"
              }`}
            >
              {schedulerStatus.lastRunError ?? content.monitorNoError}
            </p>
          </div>
        </div>
      </section>

      <section className={`${panelClass} p-4 sm:p-5`}>
        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
            <div className="space-y-2">
              <h2 className="text-xl font-semibold text-foreground">{content.toolbarTitle}</h2>
              <p className="max-w-3xl text-sm leading-6 text-muted">{content.toolbarDesc}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <span className="rounded-full border border-line bg-white/85 px-3 py-1.5 text-xs font-medium text-foreground">
                {content.statTotal}: {plugins.length}
              </span>
              <span className="rounded-full border border-[#bde2d5] bg-[#f1fbf7] px-3 py-1.5 text-xs font-medium text-[#165746]">
                {content.statInstalled}: {installedCount}
              </span>
              <span className="rounded-full border border-[#bfd3ff] bg-[#f2f6ff] px-3 py-1.5 text-xs font-medium text-[#284baf]">
                {content.statEnabled}: {enabledCount}
              </span>
              <span className="rounded-full border border-[#f3d1ab] bg-[#fff4e7] px-3 py-1.5 text-xs font-medium text-[#aa5a16]">
                {content.statDisabled}: {disabledCount}
              </span>
            </div>
          </div>

          <div className="rounded-[1.1rem] border border-line bg-white/72 p-3.5">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
              <div className="flex flex-wrap gap-2">
                {filterItems.map((item) => {
                  const active = statusFilter === item.key;
                  const href = buildPageHref(
                    "/admin/plugins",
                    {
                      status: item.key || null,
                      channelCode: channelCodeFilter || null,
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

              <form className="grid gap-2.5 md:grid-cols-[minmax(220px,1fr)_132px_148px_148px_auto]">
                <input
                  type="text"
                  name="q"
                  defaultValue={filters.q}
                  placeholder={content.searchPlaceholder}
                  className={inputClass}
                />
                <select name="status" defaultValue={statusFilter} className={selectClass}>
                  <option value="">{filterItems[0].label}</option>
                  <option value="installed">{filterItems[1].label}</option>
                  <option value="enabled">{filterItems[2].label}</option>
                  <option value="disabled">{filterItems[3].label}</option>
                </select>
                <select
                  name="channelCode"
                  defaultValue={channelCodeFilter}
                  className={selectClass}
                >
                  <option value="">{content.allChannels}</option>
                  {plugins.map((plugin) => (
                    <option key={plugin.channelCode} value={plugin.channelCode}>
                      {plugin.channelCode}
                    </option>
                  ))}
                </select>
                <select name="sort" defaultValue={sortFilter} className={selectClass}>
                  <option value="updated_desc">{content.sortUpdated}</option>
                  <option value="synced_desc">{content.sortSynced}</option>
                  <option value="name_asc">{content.sortName}</option>
                  <option value="channel_asc">{content.sortChannel}</option>
                  <option value="installed_desc">{content.sortInstalled}</option>
                </select>
                <button type="submit" className={buttonClass}>
                  {content.searchButton}
                </button>
              </form>
            </div>
          </div>
        </div>
      </section>

      {sortedPlugins.length === 0 ? (
        <EmptyState title={content.emptyTitle} description={content.emptyDesc} />
      ) : (
        <section className={`${panelClass} p-4 sm:p-5`}>
          {canManagePlugins ? (
            <form id="plugin-batch-form" action={batchMarketplacePluginAction}>
              <input type="hidden" name="redirectTo" value="/admin/plugins" />
              <div className="flex flex-col gap-3 rounded-[1.1rem] border border-line bg-white/72 p-3.5 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-sm font-medium text-foreground">{content.batchActionLabel}</div>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <select
                    name="batchAction"
                    defaultValue="enable"
                    className={`${selectClass} min-w-[160px]`}
                  >
                    <option value="install">{content.batchInstall}</option>
                    <option value="enable">{content.batchEnable}</option>
                    <option value="disable">{content.batchDisable}</option>
                    <option value="uninstall">{content.batchUninstall}</option>
                  </select>
                  <button
                    type="submit"
                    className={`${buttonClass} min-w-[88px] whitespace-nowrap`}
                  >
                    {content.batchApply}
                  </button>
                </div>
              </div>
            </form>
          ) : (
            <div className="rounded-[1.1rem] border border-line bg-white/72 p-3.5 text-sm leading-6 text-muted">
              {content.readOnlyNotice}
            </div>
          )}

          <div className="mt-4">
            <div className="space-y-4 md:hidden">
              {pagedPlugins.map((plugin) => (
                <article
                  key={plugin.slug}
                  className="rounded-[1.15rem] border border-line bg-white/72 p-4"
                >
                  <div className="flex items-start gap-3">
                    {canManagePlugins ? (
                      <input
                        type="checkbox"
                        name="selectedSlugs"
                        value={plugin.slug}
                        form="plugin-batch-form"
                        className="mt-1 h-4 w-4 rounded border-line"
                      />
                    ) : (
                      <span className="mt-0.5 text-xs text-muted">—</span>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <Link
                            href={`/admin/plugins/${plugin.slug}`}
                            className="truncate text-base font-semibold text-foreground hover:text-accent"
                          >
                            {plugin.displayName}
                          </Link>
                          <p className="mt-1 text-sm leading-6 text-muted">
                            {plugin.summary}
                          </p>
                        </div>
                        <span className="inline-flex shrink-0 whitespace-nowrap rounded-full border border-line bg-white px-2.5 py-1 text-[11px] font-medium text-secondary">
                          {plugin.category}
                        </span>
                      </div>

                      <div className="mt-3 flex flex-wrap gap-1.5">
                        <StatusBadge tone={plugin.installed ? "success" : "neutral"}>
                          {getInstallStatusLabel(plugin)}
                        </StatusBadge>
                        <StatusBadge tone={plugin.enabled ? "info" : "warning"}>
                          {getRuntimeStatusLabel(plugin)}
                        </StatusBadge>
                          <StatusBadge tone={plugin.trusted ? "success" : "warning"}>
                            {plugin.trusted ? content.sourceTrusted : content.sourceUntrusted}
                          </StatusBadge>
                          <StatusBadge tone={plugin.source === "REMOTE_SIGNED" ? "neutral" : "warning"}>
                            {getSourceLabel(plugin)}
                          </StatusBadge>
                          {plugin.pricingMode ? (
                            <StatusBadge tone={plugin.pricingMode === "PAID" ? "warning" : "success"}>
                              {plugin.pricingMode === "PAID" ? content.pricingPaid : content.pricingFree}
                            </StatusBadge>
                          ) : null}
                          {plugin.pricingMode === "PAID" ? (
                            <StatusBadge tone={plugin.purchasedAt ? "success" : "warning"}>
                              {plugin.purchasedAt ? content.purchasedBadge : content.notPurchasedBadge}
                            </StatusBadge>
                          ) : null}
                          {!plugin.runnable ? (
                            <StatusBadge tone="warning">{content.manifestOnlyBadge}</StatusBadge>
                          ) : null}
                          {plugin.loadError ? (
                            <StatusBadge tone="danger">{content.runtimeLoadErrorBadge}</StatusBadge>
                          ) : null}
                          <StatusBadge
                            tone={
                              plugin.usage.enabledMerchantAccountCount > 0 ||
                            plugin.usage.enabledBindingCount > 0
                              ? "warning"
                              : "neutral"
                          }
                        >
                          {plugin.usage.enabledMerchantAccountCount > 0 ||
                          plugin.usage.enabledBindingCount > 0
                            ? content.inUseBadge
                            : content.idleBadge}
                        </StatusBadge>
                      </div>

                      <div className="mt-4 grid gap-3 rounded-xl border border-line bg-white/75 p-3 text-xs leading-5 text-muted">
                        <p>
                          <span className="font-medium text-foreground">
                            {content.channelCol}:
                          </span>{" "}
                          {plugin.channelCode}
                        </p>
                        <p>
                          <span className="font-medium text-foreground">
                            {content.runtimeCol}:
                          </span>{" "}
                          {getRuntimeStatusLabel(plugin)}
                        </p>
                        <p>
                          <span className="font-medium text-foreground">
                            {content.syncedCol}:
                          </span>{" "}
                          {formatDate(plugin.lastSyncedAt, locale)}
                        </p>
                      </div>

                      <div className="mt-4">{renderPluginDetails(plugin)}</div>

                      <div className="mt-4 flex flex-col gap-2">{renderActionButtons(plugin)}</div>
                    </div>
                  </div>
                </article>
              ))}
            </div>

            <div className={`${tableWrapperClass} hidden md:block lg:hidden`}>
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-white/80 text-xs uppercase tracking-[0.18em] text-muted">
                    <tr>
                      <th className="px-4 py-3 font-medium">{content.selectLabel}</th>
                      <th className="px-4 py-3 font-medium">{content.pluginCol}</th>
                      <th className="px-4 py-3 font-medium">{content.runtimeCol}</th>
                      <th className="px-4 py-3 font-medium">{content.syncedCol}</th>
                      <th className="px-4 py-3 font-medium">{content.actionsCol}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line bg-white/60 align-top">
                    {pagedPlugins.map((plugin) => (
                      <tr key={plugin.slug}>
                        <td className="px-4 py-3.5 align-top">
                          {canManagePlugins ? (
                            <input
                              type="checkbox"
                              name="selectedSlugs"
                              value={plugin.slug}
                              form="plugin-batch-form"
                              className="mt-1 h-4 w-4 rounded border-line"
                            />
                          ) : (
                            <span className="text-xs text-muted">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3.5">
                          <div className="space-y-3">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <Link
                                  href={`/admin/plugins/${plugin.slug}`}
                                  className="truncate font-semibold text-foreground hover:text-accent"
                                >
                                  {plugin.displayName}
                                </Link>
                                <p className="mt-1 line-clamp-1 text-xs leading-5 text-muted">
                                  {plugin.summary}
                                </p>
                                <p className="mt-1.5 break-all font-mono text-[11px] leading-5 text-muted">
                                  {plugin.channelCode}
                                </p>
                              </div>
                              <span className="inline-flex shrink-0 whitespace-nowrap rounded-full border border-line bg-white px-2.5 py-1 text-[11px] font-medium text-secondary">
                                {plugin.category}
                              </span>
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                              <StatusBadge tone={plugin.installed ? "success" : "neutral"}>
                                {getInstallStatusLabel(plugin)}
                              </StatusBadge>
                              <StatusBadge tone={plugin.enabled ? "info" : "warning"}>
                                {getRuntimeStatusLabel(plugin)}
                              </StatusBadge>
                              <StatusBadge
                                tone={plugin.source === "REMOTE_SIGNED" ? "neutral" : "warning"}
                              >
                                {getSourceLabel(plugin)}
                              </StatusBadge>
                              {plugin.pricingMode ? (
                                <StatusBadge tone={plugin.pricingMode === "PAID" ? "warning" : "success"}>
                                  {plugin.pricingMode === "PAID" ? content.pricingPaid : content.pricingFree}
                                </StatusBadge>
                              ) : null}
                              {plugin.pricingMode === "PAID" ? (
                                <StatusBadge tone={plugin.purchasedAt ? "success" : "warning"}>
                                  {plugin.purchasedAt ? content.purchasedBadge : content.notPurchasedBadge}
                                </StatusBadge>
                              ) : null}
                              {!plugin.runnable ? (
                                <StatusBadge tone="warning">{content.manifestOnlyBadge}</StatusBadge>
                              ) : null}
                              {plugin.loadError ? (
                                <StatusBadge tone="danger">{content.runtimeLoadErrorBadge}</StatusBadge>
                              ) : null}
                              <StatusBadge
                                tone={
                                  plugin.usage.enabledMerchantAccountCount > 0 ||
                                  plugin.usage.enabledBindingCount > 0
                                    ? "warning"
                                    : "neutral"
                                }
                              >
                                {plugin.usage.enabledMerchantAccountCount > 0 ||
                                plugin.usage.enabledBindingCount > 0
                                  ? content.inUseBadge
                                  : content.idleBadge}
                              </StatusBadge>
                            </div>
                            {renderPluginDetails(plugin)}
                          </div>
                        </td>
                        <td className="px-4 py-3.5 text-xs text-muted">
                          <p className="font-medium text-foreground">
                            {plugin.enabled ? content.enabledBadge : content.disabledBadge}
                          </p>
                          <p className="mt-1.5">
                            {content.installedAt}: {formatDate(plugin.installedAt, locale)}
                          </p>
                        </td>
                        <td className="px-4 py-3.5 text-xs text-foreground">
                          {formatDate(plugin.lastSyncedAt, locale)}
                        </td>
                        <td className="px-4 py-3.5">
                          <div className="flex flex-col gap-1.5">
                            {renderActionButtons(plugin)}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className={`${tableWrapperClass} hidden lg:block`}>
              <div className="overflow-x-hidden">
                <table className="w-full table-fixed text-left text-sm">
                  <colgroup>
                    <col className="w-[5%]" />
                    <col className="w-[29%]" />
                    <col className="w-[14%]" />
                    <col className="w-[14%]" />
                    <col className="w-[12%]" />
                    <col className="w-[14%]" />
                    <col className="w-[12%]" />
                  </colgroup>
                  <thead className="bg-white/80 text-xs uppercase tracking-[0.18em] text-muted">
                    <tr>
                      <th className="px-4 py-3 font-medium">{content.selectLabel}</th>
                      <th className="px-4 py-3 font-medium">{content.pluginCol}</th>
                      <th className="px-4 py-3 font-medium">{content.channelCol}</th>
                      <th className="px-4 py-3 font-medium">{content.packageLabel}</th>
                      <th className="px-4 py-3 font-medium">{content.runtimeCol}</th>
                      <th className="px-4 py-3 font-medium">{content.syncedCol}</th>
                      <th className="px-4 py-3 font-medium">{content.actionsCol}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line bg-white/60 align-top">
                    {pagedPlugins.map((plugin) => (
                      <Fragment key={plugin.slug}>
                        <tr key={`${plugin.slug}-main`}>
                          <td className="px-4 py-3.5 align-top">
                            {canManagePlugins ? (
                              <input
                                type="checkbox"
                                name="selectedSlugs"
                                value={plugin.slug}
                                form="plugin-batch-form"
                                className="mt-1 h-4 w-4 rounded border-line"
                              />
                            ) : (
                              <span className="text-xs text-muted">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3.5">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <Link
                                  href={`/admin/plugins/${plugin.slug}`}
                                  className="truncate font-semibold text-foreground hover:text-accent"
                                >
                                  {plugin.displayName}
                                </Link>
                                <p className="mt-1 line-clamp-1 text-xs leading-5 text-muted">
                                  {plugin.summary}
                                </p>
                              </div>
                              <span className="inline-flex shrink-0 whitespace-nowrap rounded-full border border-line bg-white px-2.5 py-1 text-[11px] font-medium text-secondary">
                                {plugin.category}
                              </span>
                            </div>
                            <div className="mt-2.5 flex flex-wrap gap-1.5">
                              <StatusBadge tone={plugin.installed ? "success" : "neutral"}>
                                {getInstallStatusLabel(plugin)}
                              </StatusBadge>
                              <StatusBadge tone={plugin.enabled ? "info" : "warning"}>
                                {getRuntimeStatusLabel(plugin)}
                              </StatusBadge>
                              <StatusBadge tone={plugin.trusted ? "success" : "warning"}>
                                {plugin.trusted
                                  ? content.sourceTrusted
                                  : content.sourceUntrusted}
                              </StatusBadge>
                              <StatusBadge
                                tone={plugin.source === "REMOTE_SIGNED" ? "neutral" : "warning"}
                              >
                                {getSourceLabel(plugin)}
                              </StatusBadge>
                              {plugin.pricingMode ? (
                                <StatusBadge tone={plugin.pricingMode === "PAID" ? "warning" : "success"}>
                                  {plugin.pricingMode === "PAID" ? content.pricingPaid : content.pricingFree}
                                </StatusBadge>
                              ) : null}
                              {plugin.pricingMode === "PAID" ? (
                                <StatusBadge tone={plugin.purchasedAt ? "success" : "warning"}>
                                  {plugin.purchasedAt ? content.purchasedBadge : content.notPurchasedBadge}
                                </StatusBadge>
                              ) : null}
                              {!plugin.runnable ? (
                                <StatusBadge tone="warning">{content.manifestOnlyBadge}</StatusBadge>
                              ) : null}
                              {plugin.loadError ? (
                                <StatusBadge tone="danger">{content.runtimeLoadErrorBadge}</StatusBadge>
                              ) : null}
                              <StatusBadge
                                tone={
                                  plugin.usage.enabledMerchantAccountCount > 0 ||
                                  plugin.usage.enabledBindingCount > 0
                                    ? "warning"
                                    : "neutral"
                                }
                              >
                                {plugin.usage.enabledMerchantAccountCount > 0 ||
                                plugin.usage.enabledBindingCount > 0
                                  ? content.inUseBadge
                                  : content.idleBadge}
                              </StatusBadge>
                            </div>
                          </td>
                          <td className="px-4 py-3.5">
                            <p className="break-all font-mono text-[11px] leading-5 text-foreground">
                              {plugin.channelCode}
                            </p>
                            <p className="mt-1.5 text-xs text-muted">
                              {getProviderKeyLabel(plugin.channelSummary.provider, locale)}
                            </p>
                          </td>
                          <td className="px-4 py-3.5">
                            <p className="break-all font-mono text-[11px] leading-5 text-foreground">
                              {plugin.packageName}
                            </p>
                            <p className="mt-1.5 text-xs text-muted">
                              {content.versionLabel}: {plugin.version}
                            </p>
                          </td>
                          <td className="px-4 py-3.5">
                            <p className="text-xs font-medium text-foreground">
                              {getRuntimeStatusLabel(plugin)}
                            </p>
                            <p className="mt-1.5 text-xs text-muted">
                              {content.installedAt}: {formatDate(plugin.installedAt, locale)}
                            </p>
                          </td>
                          <td className="px-4 py-3.5">
                            <p className="text-xs leading-5 text-foreground">
                              {formatDate(plugin.lastSyncedAt, locale)}
                            </p>
                          </td>
                          <td className="px-4 py-3.5">
                            <div className="flex flex-col gap-1.5">
                              {renderActionButtons(plugin)}
                            </div>
                          </td>
                        </tr>
                        <tr key={`${plugin.slug}-details`}>
                          <td colSpan={7} className="border-t border-line/50 bg-white/45 px-4 py-3">
                            {renderPluginDetails(plugin)}
                          </td>
                        </tr>
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <PaginationNav
            summary={`${content.pageRange} ${pagination.pageStart}-${pagination.pageEnd} ${content.pageConnector} ${sortedPlugins.length}`}
            previousHref={
              pagination.currentPage > 1
                ? buildPageHref(
                    "/admin/plugins",
                    {
                      status: statusFilter || null,
                      channelCode: channelCodeFilter || null,
                      q: filters.q || null,
                      sort: sortFilter || null,
                    },
                    pagination.currentPage - 1,
                  )
                : null
            }
            previousLabel={content.previous}
            nextHref={
              pagination.currentPage < pagination.totalPages
                ? buildPageHref(
                    "/admin/plugins",
                    {
                      status: statusFilter || null,
                      channelCode: channelCodeFilter || null,
                      q: filters.q || null,
                      sort: sortFilter || null,
                    },
                    pagination.currentPage + 1,
                  )
                : null
            }
            nextLabel={content.next}
          />
        </section>
      )}
    </div>
  );
}
