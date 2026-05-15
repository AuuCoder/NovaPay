import Link from "next/link";
import {
  createPluginRegistrySourceAction,
  syncPluginRegistrySourceAction,
  updatePluginRegistrySourceAction,
} from "@/app/admin/actions";
import {
  formatDateTime,
  readPageMessages,
  type SearchParamsInput,
} from "@/app/admin/support";
import {
  AdminPageHeader,
  EmptyState,
  FlashMessage,
  LabeledField,
  StatusBadge,
  buttonClass,
  inputClass,
  panelClass,
  subtleButtonClass,
} from "@/app/admin/ui";
import { requireAdminPermission } from "@/lib/admin-session";
import { getCurrentLocale } from "@/lib/i18n-server";
import { getPrismaClient } from "@/lib/prisma";
import { maskStoredSecret } from "@/lib/secret-box";

function isMockRegistryBaseUrl(baseUrl: string): boolean {
  try {
    const url = new URL(baseUrl);
    return url.pathname.startsWith("/api/mock-plugin-registry");
  } catch {
    return false;
  }
}

export default async function PluginSourcesPage({
  searchParams,
}: {
  searchParams?: SearchParamsInput;
}) {
  await requireAdminPermission("plugin_marketplace:read");
  const locale = await getCurrentLocale();
  const messages = await readPageMessages(searchParams);
  const sources = await getPrismaClient().pluginRegistrySource.findMany({
    orderBy: [{ createdAt: "asc" }],
  });
  const hasMockRegistrySource = sources.some((source) =>
    isMockRegistryBaseUrl(source.baseUrl),
  );
  const content =
    locale === "en"
      ? {
          eyebrow: "Registry Sources",
          title: "Remote plugin registry sources",
          description:
            "Configure external plugin registry endpoints here before adding remote marketplace sync and package download flows.",
          back: "Back to Plugin Market",
          createTitle: "Create registry source",
          nameLabel: "Source Name",
          baseUrlLabel: "Base URL",
          appIdLabel: "App ID",
          appKeyLabel: "App Key",
          appKeyHint: "Stored encrypted. Leave blank only when the remote registry does not require it.",
          enabledLabel: "Enable source",
          createButton: "Create Source",
          emptyTitle: "No registry sources yet",
          emptyDesc:
            "Add at least one remote plugin registry source before building the remote marketplace sync stage.",
          updateButton: "Save Source",
          syncButton: "Sync Registry",
          lastSyncAt: "Last Sync",
          createdAt: "Created",
          updatedAt: "Updated",
          appKeyCurrent: "Current encrypted app key",
          appKeyUpdateHint:
            "Leave blank to keep the current key, or enter a new value to rotate it.",
          enabledBadge: "Enabled",
          disabledBadge: "Disabled",
          mockRegistryBannerTitle: "Mock registry source detected",
          mockRegistryBannerBody:
            "A mock Registry source is configured. It is for development demos only and must not be used in production.",
        }
      : {
          eyebrow: "注册源",
          title: "远程插件商店源",
          description:
            "先在这里维护远程插件商店地址和接入凭证，后面再接远程市场同步与插件包下载流程。",
          back: "返回插件市场",
          createTitle: "新增商店源",
          nameLabel: "商店源名称",
          baseUrlLabel: "基础地址",
          appIdLabel: "App ID",
          appKeyLabel: "App Key",
          appKeyHint: "会加密保存；如果远程商店不要求凭证，可以留空。",
          enabledLabel: "启用该商店源",
          createButton: "创建商店源",
          emptyTitle: "当前还没有远程商店源",
          emptyDesc: "在开始做远程插件市场同步之前，先至少创建一个商店源配置。",
          updateButton: "保存商店源",
          syncButton: "立即同步",
          lastSyncAt: "最近同步",
          createdAt: "创建于",
          updatedAt: "更新于",
          appKeyCurrent: "当前加密 App Key",
          appKeyUpdateHint: "留空则保持当前密钥不变；输入新值会替换现有密钥。",
          enabledBadge: "已启用",
          disabledBadge: "已停用",
          mockRegistryBannerTitle: "检测到 mock Registry 商店源",
          mockRegistryBannerBody:
            "当前商店源中存在 mock Registry，仅供开发演示，请勿在生产部署使用。",
        };

  return (
    <div className="space-y-8">
      <AdminPageHeader
        eyebrow={content.eyebrow}
        title={content.title}
        description={content.description}
        actions={
          <Link href="/admin/plugins" className={subtleButtonClass}>
            {content.back}
          </Link>
        }
      />

      <FlashMessage success={messages.success} error={messages.error} />

      {hasMockRegistrySource ? (
        <section
          role="alert"
          className="rounded-[1.25rem] border border-[#f3d1ab] bg-[#fff4e7] px-5 py-4 text-[#aa5a16]"
        >
          <p className="text-sm font-semibold">{content.mockRegistryBannerTitle}</p>
          <p className="mt-1 text-xs leading-5">{content.mockRegistryBannerBody}</p>
        </section>
      ) : null}

      <section className={`${panelClass} p-6`}>
        <h2 className="text-2xl font-semibold text-foreground">{content.createTitle}</h2>
        <form action={createPluginRegistrySourceAction} className="mt-6 grid gap-4 lg:grid-cols-2">
          <input type="hidden" name="redirectTo" value="/admin/plugins/sources" />
          <LabeledField label={content.nameLabel}>
            <input name="name" className={inputClass} placeholder="Official Registry" />
          </LabeledField>
          <LabeledField label={content.baseUrlLabel}>
            <input
              name="baseUrl"
              className={inputClass}
              placeholder="https://plugins.example.com"
            />
          </LabeledField>
          <LabeledField label={content.appIdLabel}>
            <input name="appId" className={inputClass} placeholder="novapay-admin" />
          </LabeledField>
          <LabeledField label={content.appKeyLabel} hint={content.appKeyHint}>
            <input name="appKey" className={inputClass} />
          </LabeledField>
          <div className="rounded-[1.25rem] border border-line bg-white/65 p-4 lg:col-span-2">
            <label className="flex items-center gap-3 text-sm font-medium text-foreground">
              <input type="checkbox" name="enabled" defaultChecked className="h-4 w-4 rounded border-line" />
              {content.enabledLabel}
            </label>
          </div>
          <div className="lg:col-span-2">
            <button type="submit" className={buttonClass}>
              {content.createButton}
            </button>
          </div>
        </form>
      </section>

      {sources.length === 0 ? (
        <EmptyState title={content.emptyTitle} description={content.emptyDesc} />
      ) : (
        <section className="grid gap-6 xl:grid-cols-2">
          {sources.map((source) => (
            <article key={source.id} className={`${panelClass} p-6`}>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.22em] text-muted">{source.name}</p>
                  <h2 className="mt-2 break-all text-xl font-semibold text-foreground">
                    {source.baseUrl}
                  </h2>
                </div>
                <StatusBadge tone={source.enabled ? "success" : "warning"}>
                  {source.enabled ? content.enabledBadge : content.disabledBadge}
                </StatusBadge>
              </div>

              <div className="mt-4 grid gap-2 text-xs leading-6 text-muted">
                <p>{content.appIdLabel}: {source.appId || "—"}</p>
                <p>{content.appKeyCurrent}: {maskStoredSecret(source.appKeyCiphertext) || "—"}</p>
                <p>{content.lastSyncAt}: {formatDateTime(source.lastSyncAt, locale)}</p>
                <p>{content.createdAt}: {formatDateTime(source.createdAt, locale)}</p>
                <p>{content.updatedAt}: {formatDateTime(source.updatedAt, locale)}</p>
              </div>

              <form action={updatePluginRegistrySourceAction} className="mt-6 grid gap-4">
                <input type="hidden" name="redirectTo" value="/admin/plugins/sources" />
                <input type="hidden" name="id" value={source.id} />
                <LabeledField label={content.nameLabel}>
                  <input name="name" defaultValue={source.name} className={inputClass} />
                </LabeledField>
                <LabeledField label={content.baseUrlLabel}>
                  <input name="baseUrl" defaultValue={source.baseUrl} className={inputClass} />
                </LabeledField>
                <LabeledField label={content.appIdLabel}>
                  <input name="appId" defaultValue={source.appId ?? ""} className={inputClass} />
                </LabeledField>
                <input type="hidden" name="appKeyStrategy" value="preserve_if_blank" />
                <LabeledField label={content.appKeyLabel} hint={content.appKeyUpdateHint}>
                  <input name="appKey" defaultValue="" className={inputClass} />
                </LabeledField>
                <div className="rounded-[1.25rem] border border-line bg-white/65 p-4">
                  <label className="flex items-center gap-3 text-sm font-medium text-foreground">
                    <input
                      type="checkbox"
                      name="enabled"
                      defaultChecked={source.enabled}
                      className="h-4 w-4 rounded border-line"
                    />
                    {content.enabledLabel}
                  </label>
                </div>
                <div>
                  <button type="submit" className={buttonClass}>
                    {content.updateButton}
                  </button>
                </div>
              </form>
              <form action={syncPluginRegistrySourceAction} className="mt-3">
                <input type="hidden" name="redirectTo" value="/admin/plugins/sources" />
                <input type="hidden" name="id" value={source.id} />
                <button type="submit" className={subtleButtonClass}>
                  {content.syncButton}
                </button>
              </form>
            </article>
          ))}
        </section>
      )}
    </div>
  );
}
