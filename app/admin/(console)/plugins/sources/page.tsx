import Link from "next/link";
import {
  createPluginRegistrySourceAction,
  syncPluginRegistrySourceTrustAnchorAction,
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
import { getPluginRegistrySyncRuntimeStatuses } from "@/lib/plugins/remote-registry";
import { getPrismaClient } from "@/lib/prisma";
import { maskStoredSecret } from "@/lib/secret-box";

function getSourceAuditActionLabel(
  action: string,
  locale: "zh" | "en",
) {
  const labels: Record<string, { zh: string; en: string; tone: "success" | "warning" | "danger" | "info" }> = {
    "plugin_registry_source.create": {
      zh: "已创建",
      en: "Created",
      tone: "success",
    },
    "plugin_registry_source.update": {
      zh: "已更新",
      en: "Updated",
      tone: "info",
    },
    "plugin_registry_source.sync": {
      zh: "同步成功",
      en: "Sync Succeeded",
      tone: "success",
    },
    "plugin_registry_source.sync_failed": {
      zh: "同步失败",
      en: "Sync Failed",
      tone: "danger",
    },
  };

  return (
    labels[action] ?? {
      zh: action,
      en: action,
      tone: "warning",
    }
  );
}

export default async function PluginSourcesPage({
  searchParams,
}: {
  searchParams?: SearchParamsInput;
}) {
  await requireAdminPermission("plugin_marketplace:read");
  const locale = await getCurrentLocale();
  const messages = await readPageMessages(searchParams);
  const prisma = getPrismaClient();
  const [sources, auditLogs] = await Promise.all([
    prisma.pluginRegistrySource.findMany({
      orderBy: [{ createdAt: "asc" }],
    }),
    prisma.adminAuditLog.findMany({
      where: {
        resourceType: "plugin_registry_source",
        action: {
          in: [
            "plugin_registry_source.create",
            "plugin_registry_source.update",
            "plugin_registry_source.sync",
            "plugin_registry_source.sync_failed",
          ],
        },
      },
      orderBy: [{ createdAt: "desc" }],
      take: 50,
    }),
  ]);
  const runtimeStatuses = getPluginRegistrySyncRuntimeStatuses();
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
          trustPublicKeyLabel: "Trust Public Key",
          trustPublicKeyHint:
            "Optional. When configured, NovaPay verifies the registry's current signing key before syncing remote plugins.",
          trustPublicKeyKeyIdLabel: "Trust Key ID",
          trustPublicKeyKeyIdHint:
            "Optional key identifier used only for operator-facing mismatch diagnostics.",
          licensePublicKeyLabel: "License Public Key",
          licensePublicKeyHint:
            "Optional future-facing field for registry-issued license verification metadata.",
          enabledLabel: "Enable source",
          createButton: "Create Source",
          emptyTitle: "No registry sources yet",
          emptyDesc:
            "Add at least one remote plugin registry source before building the remote marketplace sync stage.",
          updateButton: "Save Source",
          refreshTrustButton: "Refresh Trust Anchor",
          syncButton: "Sync Registry",
          syncStatusTitle: "Recent Sync Status",
          timelineTitle: "Recent Activity",
          timelineEmpty: "No source-scoped activity yet.",
          timelineActor: "Actor",
          timelineAt: "Time",
          syncOk: "Success",
          syncFailed: "Failed",
          syncIdle: "No sync record yet",
          syncPlugins: "Plugins",
          syncAttemptedAt: "Attempted At",
          syncError: "Failure Reason",
          syncNoError: "No recent sync failures.",
          lastSyncAt: "Last Sync",
          createdAt: "Created",
          updatedAt: "Updated",
          appKeyCurrent: "Current encrypted app key",
          trustPublicKeyCurrent: "Current trust public key",
          trustPublicKeyKeyIdCurrent: "Current trust key ID",
          licensePublicKeyCurrent: "Current license public key",
          appKeyUpdateHint:
            "Leave blank to keep the current key, or enter a new value to rotate it.",
          enabledBadge: "Enabled",
          disabledBadge: "Disabled",
          createNamePlaceholder: "Official Registry",
          createBaseUrlPlaceholder: "https://plugins.example.com",
          createAppIdPlaceholder: "novapay-admin",
          trustKeyIdPlaceholder: "registry-key-2026-01",
          publicKeyPlaceholder: "-----BEGIN PUBLIC KEY-----",
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
          trustPublicKeyLabel: "信任公钥",
          trustPublicKeyHint:
            "可选。配置后，NovaPay 会在同步远程插件前校验 Registry 当前签名公钥是否匹配。",
          trustPublicKeyKeyIdLabel: "信任 Key ID",
          trustPublicKeyKeyIdHint:
            "可选，仅用于在公钥不匹配时给运营人员更清晰的诊断信息。",
          licensePublicKeyLabel: "许可证公钥",
          licensePublicKeyHint:
            "可选，为后续 Registry 许可证校验元数据预留的字段。",
          enabledLabel: "启用该商店源",
          createButton: "创建商店源",
          emptyTitle: "当前还没有远程商店源",
          emptyDesc: "在开始做远程插件市场同步之前，先至少创建一个商店源配置。",
          updateButton: "保存商店源",
          refreshTrustButton: "同步当前信任锚",
          syncButton: "立即同步",
          syncStatusTitle: "最近同步状态",
          timelineTitle: "最近操作",
          timelineEmpty: "当前还没有这个商店源的操作记录。",
          timelineActor: "操作者",
          timelineAt: "时间",
          syncOk: "成功",
          syncFailed: "失败",
          syncIdle: "还没有同步记录",
          syncPlugins: "插件数",
          syncAttemptedAt: "尝试时间",
          syncError: "失败原因",
          syncNoError: "最近没有同步失败。",
          lastSyncAt: "最近同步",
          createdAt: "创建于",
          updatedAt: "更新于",
          appKeyCurrent: "当前加密 App Key",
          trustPublicKeyCurrent: "当前信任公钥",
          trustPublicKeyKeyIdCurrent: "当前信任 Key ID",
          licensePublicKeyCurrent: "当前许可证公钥",
          appKeyUpdateHint: "留空则保持当前密钥不变；输入新值会替换现有密钥。",
          enabledBadge: "已启用",
          disabledBadge: "已停用",
          createNamePlaceholder: "官方插件商店",
          createBaseUrlPlaceholder: "https://plugins.example.com",
          createAppIdPlaceholder: "novapay-admin",
          trustKeyIdPlaceholder: "registry-key-2026-01",
          publicKeyPlaceholder: "-----BEGIN PUBLIC KEY-----",
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

      <section className={`${panelClass} p-6`}>
        <h2 className="text-2xl font-semibold text-foreground">{content.createTitle}</h2>
        <form action={createPluginRegistrySourceAction} className="mt-6 grid gap-4 lg:grid-cols-2">
          <input type="hidden" name="redirectTo" value="/admin/plugins/sources" />
          <LabeledField label={content.nameLabel}>
            <input name="name" className={inputClass} placeholder={content.createNamePlaceholder} />
          </LabeledField>
          <LabeledField label={content.baseUrlLabel}>
            <input
              name="baseUrl"
              className={inputClass}
              placeholder={content.createBaseUrlPlaceholder}
            />
          </LabeledField>
          <LabeledField label={content.appIdLabel}>
            <input name="appId" className={inputClass} placeholder={content.createAppIdPlaceholder} />
          </LabeledField>
          <LabeledField label={content.appKeyLabel} hint={content.appKeyHint}>
            <input name="appKey" className={inputClass} />
          </LabeledField>
          <LabeledField label={content.trustPublicKeyKeyIdLabel} hint={content.trustPublicKeyKeyIdHint}>
            <input name="trustPublicKeyKeyId" className={inputClass} placeholder={content.trustKeyIdPlaceholder} />
          </LabeledField>
          <div className="lg:col-span-2">
            <LabeledField label={content.trustPublicKeyLabel} hint={content.trustPublicKeyHint}>
              <textarea
                name="trustPublicKey"
                rows={4}
                className={`${inputClass} min-h-28 resize-y font-mono text-xs`}
                placeholder={content.publicKeyPlaceholder}
              />
            </LabeledField>
          </div>
          <div className="lg:col-span-2">
            <LabeledField label={content.licensePublicKeyLabel} hint={content.licensePublicKeyHint}>
              <textarea
                name="licensePublicKey"
                rows={4}
                className={`${inputClass} min-h-28 resize-y font-mono text-xs`}
                placeholder={content.publicKeyPlaceholder}
              />
            </LabeledField>
          </div>
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
              {(() => {
                const runtimeStatus = runtimeStatuses.get(source.id) ?? null;
                const sourceAuditLogs = auditLogs.filter((log) => log.resourceId === source.id);
                const latestAudit = sourceAuditLogs[0] ?? null;
                const isFailure =
                  runtimeStatus
                    ? !runtimeStatus.success
                    : latestAudit?.action === "plugin_registry_source.sync_failed";
                const statusTone = isFailure
                  ? "danger"
                  : runtimeStatus || latestAudit
                    ? "success"
                    : "neutral";
                const statusLabel = runtimeStatus
                  ? runtimeStatus.success
                    ? content.syncOk
                    : content.syncFailed
                  : latestAudit?.action === "plugin_registry_source.sync_failed"
                    ? content.syncFailed
                    : latestAudit?.action === "plugin_registry_source.sync"
                      ? content.syncOk
                      : content.syncIdle;
                const attemptedAt = runtimeStatus?.attemptedAt ?? latestAudit?.createdAt ?? null;
                const pluginCount =
                  runtimeStatus?.pluginCount ??
                  (latestAudit?.metadata &&
                  typeof latestAudit.metadata === "object" &&
                  !Array.isArray(latestAudit.metadata) &&
                  typeof latestAudit.metadata.pluginCount === "number"
                    ? latestAudit.metadata.pluginCount
                    : null);
                const errorMessage =
                  runtimeStatus?.errorMessage ??
                  (latestAudit?.metadata &&
                  typeof latestAudit.metadata === "object" &&
                  !Array.isArray(latestAudit.metadata) &&
                  typeof latestAudit.metadata.error === "string"
                    ? latestAudit.metadata.error
                    : null);

                return (
                  <>
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

              <div className="mt-4 rounded-[1.25rem] border border-line bg-white/75 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <p className="text-sm font-medium text-foreground">{content.syncStatusTitle}</p>
                  <StatusBadge tone={statusTone}>{statusLabel}</StatusBadge>
                </div>
                <div className="mt-3 grid gap-2 text-xs leading-6 text-muted">
                  <p>{content.syncAttemptedAt}: {formatDateTime(attemptedAt, locale)}</p>
                  <p>{content.syncPlugins}: {pluginCount ?? "—"}</p>
                  <p className={isFailure ? "text-[#973225]" : undefined}>
                    {content.syncError}: {errorMessage ?? content.syncNoError}
                  </p>
                </div>
              </div>

              <div className="mt-4 grid gap-2 text-xs leading-6 text-muted">
                <p>{content.appIdLabel}: {source.appId || "—"}</p>
                <p>{content.appKeyCurrent}: {maskStoredSecret(source.appKeyCiphertext) || "—"}</p>
                <p className="break-all">{content.trustPublicKeyKeyIdCurrent}: {source.trustPublicKeyKeyId || "—"}</p>
                <p className="break-all">{content.trustPublicKeyCurrent}: {source.trustPublicKey || "—"}</p>
                <p className="break-all">{content.licensePublicKeyCurrent}: {source.licensePublicKey || "—"}</p>
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
                <LabeledField label={content.trustPublicKeyKeyIdLabel} hint={content.trustPublicKeyKeyIdHint}>
                  <input
                    name="trustPublicKeyKeyId"
                    defaultValue={source.trustPublicKeyKeyId ?? ""}
                    className={inputClass}
                  />
                </LabeledField>
                <LabeledField label={content.trustPublicKeyLabel} hint={content.trustPublicKeyHint}>
                  <textarea
                    name="trustPublicKey"
                    defaultValue={source.trustPublicKey ?? ""}
                    rows={4}
                    className={`${inputClass} min-h-28 resize-y font-mono text-xs`}
                  />
                </LabeledField>
                <LabeledField label={content.licensePublicKeyLabel} hint={content.licensePublicKeyHint}>
                  <textarea
                    name="licensePublicKey"
                    defaultValue={source.licensePublicKey ?? ""}
                    rows={4}
                    className={`${inputClass} min-h-28 resize-y font-mono text-xs`}
                  />
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
              <form action={syncPluginRegistrySourceTrustAnchorAction} className="mt-3">
                <input type="hidden" name="redirectTo" value="/admin/plugins/sources" />
                <input type="hidden" name="id" value={source.id} />
                <button type="submit" className={subtleButtonClass}>
                  {content.refreshTrustButton}
                </button>
              </form>

              <div className="mt-6 rounded-[1.25rem] border border-line bg-white/75 p-4">
                <p className="text-sm font-medium text-foreground">{content.timelineTitle}</p>
                {sourceAuditLogs.length === 0 ? (
                  <p className="mt-3 text-xs leading-6 text-muted">{content.timelineEmpty}</p>
                ) : (
                  <div className="mt-3 space-y-3">
                    {sourceAuditLogs.slice(0, 4).map((log) => {
                      const actionMeta = getSourceAuditActionLabel(log.action, locale);

                      return (
                        <article
                          key={log.id}
                          className="rounded-xl border border-line bg-white/80 p-3"
                        >
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <StatusBadge tone={actionMeta.tone}>
                              {actionMeta[locale]}
                            </StatusBadge>
                            <span className="text-[11px] text-muted">
                              {content.timelineAt}: {formatDateTime(log.createdAt, locale)}
                            </span>
                          </div>
                          <p className="mt-2 text-sm leading-6 text-foreground">
                            {log.summary}
                          </p>
                          <p className="mt-1 text-[11px] leading-5 text-muted">
                            {content.timelineActor}: {log.actor}
                          </p>
                        </article>
                      );
                    })}
                  </div>
                )}
              </div>
                  </>
                );
              })()}
            </article>
          ))}
        </section>
      )}
    </div>
  );
}
