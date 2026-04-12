import { saveSystemConfigAction } from "@/app/admin/actions";
import { formatDateTime, readPageMessages, type SearchParamsInput } from "@/app/admin/support";
import {
  AdminPageHeader,
  EmptyState,
  FlashMessage,
  LabeledField,
  buttonClass,
  inputClass,
  panelClass,
  textareaClass,
} from "@/app/admin/ui";
import { requireAdminPermission } from "@/lib/admin-session";
import { getCurrentLocale } from "@/lib/i18n-server";
import { getPrismaClient } from "@/lib/prisma";

export default async function SystemConfigPage({
  searchParams,
}: {
  searchParams?: SearchParamsInput;
}) {
  await requireAdminPermission("system_config:read");
  const prisma = getPrismaClient();
  const messages = await readPageMessages(searchParams);
  const locale = await getCurrentLocale();
  const content =
    locale === "en"
      ? {
          eyebrow: "System Config",
          title: "System configuration center",
          description:
            "Values in `SystemConfig` override environment defaults in the database and are suitable for online maintenance of payment timeout, callback retry, and signing windows.",
          createTitle: "Create system config",
          createButton: "Create Config",
          emptyTitle: "No system config yet",
          emptyDesc: "Start by adding payment timeout, signing window, and callback retry settings.",
          updatedAt: "Updated At",
          saveButton: "Save Config",
        }
      : {
          eyebrow: "System Config",
          title: "系统配置中心",
          description:
            "数据库中的 SystemConfig 会覆盖环境变量默认值，适合在线维护支付超时、回调重试和签名窗口。",
          createTitle: "新增系统配置",
          createButton: "创建配置",
          emptyTitle: "还没有系统配置",
          emptyDesc: "可以先把支付超时、签名时效和回调重试参数录进去。",
          updatedAt: "更新于",
          saveButton: "保存配置",
        };
  const configs = await prisma.systemConfig.findMany({
    orderBy: [{ group: "asc" }, { key: "asc" }],
  });

  return (
    <div className="space-y-8">
      <AdminPageHeader
        eyebrow={content.eyebrow}
        title={content.title}
        description={content.description}
      />

      <FlashMessage success={messages.success} error={messages.error} />

      <section className={`${panelClass} p-6`}>
        <h2 className="text-2xl font-semibold text-foreground">{content.createTitle}</h2>
        <form action={saveSystemConfigAction} className="mt-6 grid gap-4 lg:grid-cols-2">
          <input type="hidden" name="redirectTo" value="/admin/system-config" />
          <LabeledField label="Key">
            <input name="key" placeholder="PAYMENT_EXPIRE_MINUTES" className={inputClass} />
          </LabeledField>
          <LabeledField label="Group">
            <input name="group" placeholder="payment" className={inputClass} />
          </LabeledField>
          <LabeledField label="Label">
            <input name="label" placeholder="Payment expire minutes" className={inputClass} />
          </LabeledField>
          <LabeledField label="Value">
            <textarea name="value" className={`${textareaClass} min-h-[88px] font-sans text-sm`} />
          </LabeledField>
          <div className="lg:col-span-2">
            <button type="submit" className={buttonClass}>
              {content.createButton}
            </button>
          </div>
        </form>
      </section>

      {configs.length === 0 ? (
        <EmptyState title={content.emptyTitle} description={content.emptyDesc} />
      ) : (
        <section className="grid gap-6 xl:grid-cols-2">
          {configs.map((config) => (
            <article key={config.key} className={`${panelClass} p-6`}>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.22em] text-muted">{config.group}</p>
                  <h2 className="mt-2 break-all text-2xl font-semibold text-foreground">
                    {config.key}
                  </h2>
                </div>
                <span className="rounded-full border border-line bg-white px-3 py-1 text-xs text-muted">
                  {content.updatedAt} {formatDateTime(config.updatedAt, locale)}
                </span>
              </div>

              <form action={saveSystemConfigAction} className="mt-6 grid gap-4">
                <input type="hidden" name="redirectTo" value="/admin/system-config" />
                <LabeledField label="Key">
                  <input name="key" defaultValue={config.key} className={inputClass} />
                </LabeledField>
                <div className="grid gap-4 sm:grid-cols-2">
                  <LabeledField label="Group">
                    <input name="group" defaultValue={config.group} className={inputClass} />
                  </LabeledField>
                  <LabeledField label="Label">
                    <input name="label" defaultValue={config.label ?? ""} className={inputClass} />
                  </LabeledField>
                </div>
                <LabeledField label="Value">
                  <textarea
                    name="value"
                    defaultValue={config.value}
                    className={`${textareaClass} min-h-[110px] font-sans text-sm`}
                  />
                </LabeledField>
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
