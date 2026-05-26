import Link from "next/link";
import { getCurrentLocale } from "@/lib/i18n-server";
import { hasMerchantPermission } from "@/lib/merchant-rbac";
import { requireMerchantPermission } from "@/lib/merchant-session";
import { listMerchantMarketplacePaymentPlugins } from "@/lib/plugins/marketplace";
import { uninstallMerchantMarketplacePluginAction } from "@/app/merchant/actions";
import {
  formatMarketplaceDate,
  getProviderKeyLabel,
} from "../plugin-market-shared";

export default async function MerchantInstalledPluginsPage() {
  const session = await requireMerchantPermission("channel:read");
  const locale = await getCurrentLocale();
  const plugins = await listMerchantMarketplacePaymentPlugins(
    session.merchantUser.merchantId,
    locale,
  );
  const installedPlugins = plugins.filter((plugin) => plugin.merchantInstalled);
  const canManagePlugins = hasMerchantPermission(
    session.merchantUser.role,
    "channel:write",
  );

  const content =
    locale === "en"
      ? {
          eyebrow: "Installed",
          title: "Installed plugins",
          description:
            "Manage the plugins already assigned to this merchant workspace. Configure channels, disable usage, or remove plugins that are no longer needed.",
          configure: "Configure",
          uninstall: "Uninstall",
          installedAt: "Installed at",
          provider: "Provider",
          version: "Version",
          empty: "No plugins are installed yet.",
        }
      : {
          eyebrow: "已安装",
          title: "已安装插件",
          description: "管理当前商户工作台已经安装的插件，可直接进入配置通道，也可以移除不再需要的插件。",
          configure: "配置",
          uninstall: "卸载",
          installedAt: "安装时间",
          provider: "提供方",
          version: "版本",
          empty: "当前还没有已安装插件。",
        };

  return (
    <div className="space-y-8">
      <section className="rounded-[1.75rem] border border-line bg-[linear-gradient(135deg,rgba(255,255,255,0.96),rgba(248,243,236,0.9))] p-6 shadow-[var(--shadow)] sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#8a7159]">
          {content.eyebrow}
        </p>
        <h1 className="mt-4 text-4xl font-semibold tracking-[-0.04em] text-foreground">
          {content.title}
        </h1>
        <p className="mt-4 max-w-3xl text-lg leading-8 text-muted">{content.description}</p>
      </section>

      {installedPlugins.length === 0 ? (
        <section className="rounded-[1.5rem] border border-line bg-white/78 p-8 text-center shadow-[var(--shadow)]">
          <h2 className="text-xl font-semibold text-foreground">{content.empty}</h2>
        </section>
      ) : (
        <section className="space-y-4">
          {installedPlugins.map((plugin) => (
            <article
              key={plugin.slug}
              className="flex flex-col gap-5 rounded-[1.5rem] border border-line bg-white/78 p-5 shadow-[var(--shadow)] lg:flex-row lg:items-center lg:justify-between"
            >
              <div className="flex items-start gap-4">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,rgba(217,108,31,0.16),rgba(13,122,98,0.16))] text-xl font-semibold text-foreground">
                  {plugin.displayName.slice(0, 1)}
                </div>
                <div>
                  <p className="text-lg font-semibold text-foreground">{plugin.displayName}</p>
                  <p className="mt-1 text-sm text-muted">
                    {content.provider}: {getProviderKeyLabel(plugin.providerKey, locale)}
                  </p>
                  <p className="mt-1 text-sm text-muted">
                    {content.version}: {plugin.version}
                  </p>
                  <p className="mt-1 text-sm text-muted">
                    {content.installedAt}: {formatMarketplaceDate(plugin.merchantInstalledAt, locale)}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap gap-3">
                <Link href={`/merchant/channels?channel=${plugin.channelCode}`} className="rounded-2xl bg-accent px-5 py-3 text-sm font-medium text-white shadow-[0_16px_30px_rgba(217,108,31,0.22)]">
                  {content.configure}
                </Link>
                {canManagePlugins ? (
                  <form action={uninstallMerchantMarketplacePluginAction}>
                    <input type="hidden" name="slug" value={plugin.slug} />
                    <input type="hidden" name="redirectTo" value="/merchant/plugins/installed" />
                    <button type="submit" className="rounded-2xl border border-line bg-white px-5 py-3 text-sm font-medium text-foreground">
                      {content.uninstall}
                    </button>
                  </form>
                ) : null}
              </div>
            </article>
          ))}
        </section>
      )}
    </div>
  );
}
