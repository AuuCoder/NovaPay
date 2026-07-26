import { formatDateTime } from "@/app/admin/support";
import {
  AdminPageHeader,
  LabeledField,
  StatusBadge,
  buttonClass,
  inputClass,
  panelClass,
} from "@/app/admin/ui";
import {
  createMerchantEasyPayCredentialAction,
  dismissMerchantEasyPayRevealAction,
  updateMerchantEasyPayCredentialAction,
} from "@/app/merchant/actions";
import { CopyFieldList, type CopyFieldItem } from "@/app/merchant/copy-field-list";
import { DEFAULT_EASYPAY_TYPE_MAPPING } from "@/lib/easypay/mapping";
import { getCurrentLocale } from "@/lib/i18n-server";
import { readEasyPayCredentialReveal } from "@/lib/merchant-easypay-reveal";
import { hasMerchantPermission } from "@/lib/merchant-rbac";
import { requireMerchantSession } from "@/lib/merchant-session";
import { listMerchantInstalledPaymentChannels } from "@/lib/plugins/marketplace";
import { getPrismaClient } from "@/lib/prisma";
import { getPublicBaseUrl } from "@/lib/env";

function parseStoredMapping(value: unknown): Record<string, string> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return {};
  }
  const result: Record<string, string> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (typeof raw === "string" && raw.trim()) {
      result[key] = raw;
    }
  }
  return result;
}

export default async function MerchantEasyPayPage() {
  const locale = await getCurrentLocale();
  const session = await requireMerchantSession();
  const prisma = getPrismaClient();

  const canManageCredentials = hasMerchantPermission(
    session.merchantUser.role,
    "credential:write",
  );

  const [credentials, installedChannels, reveal] = await Promise.all([
    prisma.easyPayCredential.findMany({
      where: { merchantId: session.merchantUser.merchantId },
      orderBy: { createdAt: "desc" },
    }),
    listMerchantInstalledPaymentChannels(session.merchantUser.merchantId),
    readEasyPayCredentialReveal(),
  ]);

  const baseUrl = getPublicBaseUrl() ?? "https://your-novapay-host";

  const content =
    locale === "en"
      ? {
          eyebrow: "EasyPay",
          title: "EasyPay credentials",
          description:
            "EasyPay (彩虹易支付) compatible endpoints. Hand the pid and KEY to any EasyPay client; requests are signed with MD5 and routed to your installed channels.",
          endpoints: "Protocol endpoints",
          revealTitle: "Save this EasyPay KEY now",
          revealDesc:
            "The KEY is shown only within this short secure window. After it closes, only a masked preview remains.",
          revealPid: "pid (merchant id)",
          revealKey: "KEY (signing secret)",
          revealDismiss: "I have saved it",
          createTitle: "Create EasyPay credential",
          noPermission: "This role cannot manage EasyPay credentials.",
          labelField: "Credential label",
          labelPlaceholder: "Production / Shop A",
          mappingTitle: "Payment type mapping",
          mappingDesc:
            "Map EasyPay `type` values (e.g. alipay, wxpay) to your installed NovaPay channels. Targets must be installed first.",
          mappingType: "EasyPay type",
          mappingChannel: "NovaPay channel",
          createButton: "Generate credential",
          noCredentials: "No EasyPay credential yet.",
          keyPreview: "KEY preview",
          toggleLabel: "Enable credential",
          createdAt: "Created",
          save: "Save",
          installedNote: "Installed channels",
          noInstalled: "No payment channels installed yet. Install plugins on the Channels page first.",
          enabled: "Enabled",
          disabled: "Disabled",
        }
      : {
          eyebrow: "易支付",
          title: "易支付凭证",
          description:
            "兼容彩虹易支付协议的接入端点。把 pid 与 KEY 交给任意易支付客户端即可,请求使用 MD5 签名并路由到你已安装的支付通道。",
          endpoints: "协议端点",
          revealTitle: "请立即保存这组易支付 KEY",
          revealDesc:
            "KEY 只会在当前安全窗口内显示一次。窗口结束后,后台仅保留脱敏预览。",
          revealPid: "pid(商户号)",
          revealKey: "KEY(签名密钥)",
          revealDismiss: "我已保存",
          createTitle: "新增易支付凭证",
          noPermission: "当前角色没有管理易支付凭证的权限。",
          labelField: "凭证标签",
          labelPlaceholder: "Production / 店铺A",
          mappingTitle: "支付类型映射",
          mappingDesc:
            "把易支付 `type`(如 alipay、wxpay)映射到你已安装的 NovaPay 通道。目标通道必须先在「通道」页安装。",
          mappingType: "易支付 type",
          mappingChannel: "NovaPay 通道",
          createButton: "生成凭证",
          noCredentials: "当前还没有易支付凭证。",
          keyPreview: "KEY 预览",
          toggleLabel: "启用凭证",
          createdAt: "创建于",
          save: "保存",
          installedNote: "已安装通道",
          noInstalled: "尚未安装任何支付通道,请先到「通道」页安装插件。",
          enabled: "已启用",
          disabled: "已停用",
        };

  const endpointFields: CopyFieldItem[] = [
    { id: "easypay-submit", label: "submit.php", value: `${baseUrl}/submit.php` },
    { id: "easypay-mapi", label: "mapi.php", value: `${baseUrl}/mapi.php` },
    { id: "easypay-api", label: "api.php", value: `${baseUrl}/api.php` },
  ];

  const installedCodes = installedChannels.map((channel) => channel.code);
  // 默认映射建议行:仅保留目标通道已安装的项,叠加一条空行供新增。
  const suggestedMapping = Object.entries(DEFAULT_EASYPAY_TYPE_MAPPING).filter(([, code]) =>
    installedCodes.includes(code),
  );
  const mappingDraftRows = suggestedMapping.length > 0 ? suggestedMapping : [["", ""]];

  const actionButtonClass = `${buttonClass} w-full sm:w-auto`;

  return (
    <div className="space-y-8">
      <AdminPageHeader eyebrow={content.eyebrow} title={content.title} description={content.description} />

      {reveal ? (
        <section className={`${panelClass} border-accent p-5 sm:p-6`}>
          <h2 className="text-lg font-semibold text-foreground">{content.revealTitle}</h2>
          <p className="mt-2 text-sm leading-7 text-muted">{content.revealDesc}</p>
          <div className="mt-4">
            <CopyFieldList
              locale={locale}
              items={[
                { id: "easypay-reveal-pid", label: content.revealPid, value: reveal.pid },
                { id: "easypay-reveal-key", label: content.revealKey, value: reveal.key },
              ]}
            />
          </div>
          <form action={dismissMerchantEasyPayRevealAction} className="mt-4">
            <input type="hidden" name="redirectTo" value="/merchant/easypay" />
            <button type="submit" className={actionButtonClass}>
              {content.revealDismiss}
            </button>
          </form>
        </section>
      ) : null}

      <section className={`${panelClass} p-5 sm:p-6`}>
        <h2 className="text-lg font-semibold text-foreground">{content.endpoints}</h2>
        <div className="mt-4">
          <CopyFieldList locale={locale} items={endpointFields} />
        </div>
      </section>

      <section className={`${panelClass} p-5 sm:p-6`}>
        <h2 className="text-lg font-semibold text-foreground">{content.createTitle}</h2>
        {!canManageCredentials ? (
          <p className="mt-3 text-sm text-muted">{content.noPermission}</p>
        ) : installedChannels.length === 0 ? (
          <p className="mt-3 text-sm text-muted">{content.noInstalled}</p>
        ) : (
          <form action={createMerchantEasyPayCredentialAction} className="mt-4 space-y-5">
            <input type="hidden" name="redirectTo" value="/merchant/easypay" />
            <LabeledField label={content.labelField}>
              <input
                name="label"
                required
                placeholder={content.labelPlaceholder}
                className={inputClass}
              />
            </LabeledField>

            <div>
              <p className="text-sm font-medium text-foreground">{content.mappingTitle}</p>
              <p className="mt-1 text-xs leading-6 text-muted">{content.mappingDesc}</p>
              <p className="mt-1 text-xs text-muted">
                {content.installedNote}: {installedCodes.join("、") || "—"}
              </p>
              <div className="mt-3 space-y-2">
                {mappingDraftRows.map((row, index) => (
                  <div key={index} className="flex flex-wrap gap-2">
                    <input
                      name="mappingType"
                      defaultValue={row[0]}
                      placeholder={content.mappingType}
                      className={`${inputClass} flex-1`}
                    />
                    <input
                      name="mappingChannel"
                      defaultValue={row[1]}
                      placeholder={content.mappingChannel}
                      list="easypay-installed-channels"
                      className={`${inputClass} flex-1`}
                    />
                  </div>
                ))}
                {/* 额外空行供新增映射 */}
                <div className="flex flex-wrap gap-2">
                  <input
                    name="mappingType"
                    placeholder={content.mappingType}
                    className={`${inputClass} flex-1`}
                  />
                  <input
                    name="mappingChannel"
                    placeholder={content.mappingChannel}
                    list="easypay-installed-channels"
                    className={`${inputClass} flex-1`}
                  />
                </div>
              </div>
              <datalist id="easypay-installed-channels">
                {installedChannels.map((channel) => (
                  <option key={channel.code} value={channel.code}>
                    {channel.displayName}
                  </option>
                ))}
              </datalist>
            </div>

            <button type="submit" className={actionButtonClass}>
              {content.createButton}
            </button>
          </form>
        )}
      </section>

      <section className={`${panelClass} p-5 sm:p-6`}>
        <h2 className="text-lg font-semibold text-foreground">{content.title}</h2>
        {credentials.length === 0 ? (
          <p className="mt-3 text-sm text-muted">{content.noCredentials}</p>
        ) : (
          <div className="mt-4 space-y-4">
            {credentials.map((credential) => {
              const mapping = parseStoredMapping(credential.typeMapping);
              const mappingRows = Object.entries(mapping);
              const draftRows = mappingRows.length > 0 ? mappingRows : [["", ""]];

              return (
                <article key={credential.id} className="rounded-2xl border border-line p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-foreground">{credential.label}</p>
                      <p className="mt-1 font-mono text-xs text-muted">pid: {credential.pid}</p>
                    </div>
                    <StatusBadge tone={credential.enabled ? "success" : "neutral"}>
                      {credential.enabled ? content.enabled : content.disabled}
                    </StatusBadge>
                  </div>

                  <dl className="mt-3 grid gap-3 sm:grid-cols-2">
                    <div>
                      <dt className="text-xs uppercase tracking-[0.18em] text-muted">
                        {content.keyPreview}
                      </dt>
                      <dd className="mt-1 font-mono text-sm text-foreground">{credential.keyPreview}</dd>
                    </div>
                    <div>
                      <dt className="text-xs uppercase tracking-[0.18em] text-muted">
                        {content.createdAt}
                      </dt>
                      <dd className="mt-1 text-sm text-foreground">
                        {formatDateTime(credential.createdAt, locale)}
                      </dd>
                    </div>
                  </dl>

                  {canManageCredentials ? (
                    <form
                      action={updateMerchantEasyPayCredentialAction}
                      className="mt-4 space-y-3 border-t border-line pt-4"
                    >
                      <input type="hidden" name="id" value={credential.id} />
                      <input type="hidden" name="redirectTo" value="/merchant/easypay" />

                      <div className="space-y-2">
                        <p className="text-xs font-medium text-foreground">{content.mappingTitle}</p>
                        {draftRows.map((row, index) => (
                          <div key={index} className="flex flex-wrap gap-2">
                            <input
                              name="mappingType"
                              defaultValue={row[0]}
                              placeholder={content.mappingType}
                              className={`${inputClass} flex-1`}
                            />
                            <input
                              name="mappingChannel"
                              defaultValue={row[1]}
                              placeholder={content.mappingChannel}
                              list="easypay-installed-channels"
                              className={`${inputClass} flex-1`}
                            />
                          </div>
                        ))}
                        <div className="flex flex-wrap gap-2">
                          <input
                            name="mappingType"
                            placeholder={content.mappingType}
                            className={`${inputClass} flex-1`}
                          />
                          <input
                            name="mappingChannel"
                            placeholder={content.mappingChannel}
                            list="easypay-installed-channels"
                            className={`${inputClass} flex-1`}
                          />
                        </div>
                      </div>

                      <label className="flex items-center gap-2 text-sm text-foreground">
                        <input
                          type="checkbox"
                          name="enabled"
                          value="true"
                          defaultChecked={credential.enabled}
                        />
                        {content.toggleLabel}
                      </label>

                      <button type="submit" className={actionButtonClass}>
                        {content.save}
                      </button>
                    </form>
                  ) : null}
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
