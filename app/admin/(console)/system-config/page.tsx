import {
  saveSystemConfigAction,
  saveSystemConfigBatchAction,
} from "@/app/admin/actions";
import { formatDateTime, readPageMessages, type SearchParamsInput } from "@/app/admin/support";
import {
  AdminPageHeader,
  EmptyState,
  FlashMessage,
  LabeledField,
  StatusBadge,
  buttonClass,
  inputClass,
  panelClass,
  selectClass,
  textareaClass,
} from "@/app/admin/ui";
import { requireAdminPermission } from "@/lib/admin-session";
import { type Locale } from "@/lib/i18n";
import { getCurrentLocale } from "@/lib/i18n-server";
import { getPrismaClient } from "@/lib/prisma";

type ConfigFieldKind = "text" | "url" | "integer" | "number" | "select";

interface SystemConfigFieldDefinition {
  key: string;
  group: string;
  label: string;
  hint: string;
  kind: ConfigFieldKind;
  required?: boolean;
  placeholder?: string;
  defaultValue?: string;
  options?: Array<{ label: string; value: string }>;
}

interface SystemConfigSectionDefinition {
  id: string;
  title: string;
  description: string;
  note: string;
  fields: SystemConfigFieldDefinition[];
  requiredKeys: string[];
}

function getOnchainSystemConfigSections(locale: Locale): SystemConfigSectionDefinition[] {
  const isEn = locale === "en";

  return [
    {
      id: "bsc",
      title: isEn ? "BSC Monitor" : "BSC 链监控",
      description: isEn
        ? "Configure the BSC RPC endpoint and USDT contract used by the shared on-chain worker."
        : "配置共享链上 worker 使用的 BSC RPC 节点和 USDT 合约地址。",
      note: isEn
        ? "RPC URL and token contract are required before enabling `usdt.bsc` for real monitoring."
        : "正式启用 `usdt.bsc` 自动监控前，RPC URL 和 Token 合约地址必须先配置。",
      requiredKeys: ["USDT_BSC_RPC_URL", "USDT_BSC_TOKEN_CONTRACT"],
      fields: [
        {
          key: "USDT_BSC_RPC_URL",
          group: "onchain",
          label: isEn ? "BSC RPC URL" : "BSC RPC 地址",
          hint: isEn
            ? "Use a stable HTTPS RPC endpoint for BSC."
            : "填写稳定可用的 BSC HTTPS RPC 节点。",
          kind: "url",
          required: true,
          placeholder: "https://bsc.example-rpc.com",
        },
        {
          key: "USDT_BSC_TOKEN_CONTRACT",
          group: "onchain",
          label: isEn ? "BSC USDT Contract" : "BSC USDT 合约地址",
          hint: isEn
            ? "The worker listens to Transfer logs from this contract."
            : "链上 worker 会从这个合约监听 Transfer 事件。",
          kind: "text",
          required: true,
          placeholder: "0x...",
        },
        {
          key: "USDT_BSC_CONFIRMATIONS",
          group: "onchain",
          label: isEn ? "BSC Confirmations" : "BSC 确认数",
          hint: isEn
            ? "Leave empty to use the default of 12."
            : "留空则使用默认值 12。",
          kind: "integer",
          defaultValue: "12",
          placeholder: "12",
        },
      ],
    },
    {
      id: "base",
      title: isEn ? "Base Monitor" : "Base 链监控",
      description: isEn
        ? "Configure the Base RPC endpoint and USDT contract used by the shared on-chain worker."
        : "配置共享链上 worker 使用的 Base RPC 节点和 USDT 合约地址。",
      note: isEn
        ? "RPC URL and token contract are required before enabling `usdt.base` for real monitoring."
        : "正式启用 `usdt.base` 自动监控前，RPC URL 和 Token 合约地址必须先配置。",
      requiredKeys: ["USDT_BASE_RPC_URL", "USDT_BASE_TOKEN_CONTRACT"],
      fields: [
        {
          key: "USDT_BASE_RPC_URL",
          group: "onchain",
          label: isEn ? "Base RPC URL" : "Base RPC 地址",
          hint: isEn
            ? "Use a stable HTTPS RPC endpoint for Base."
            : "填写稳定可用的 Base HTTPS RPC 节点。",
          kind: "url",
          required: true,
          placeholder: "https://base.example-rpc.com",
        },
        {
          key: "USDT_BASE_TOKEN_CONTRACT",
          group: "onchain",
          label: isEn ? "Base USDT Contract" : "Base USDT 合约地址",
          hint: isEn
            ? "The worker listens to Transfer logs from this contract."
            : "链上 worker 会从这个合约监听 Transfer 事件。",
          kind: "text",
          required: true,
          placeholder: "0x...",
        },
        {
          key: "USDT_BASE_CONFIRMATIONS",
          group: "onchain",
          label: isEn ? "Base Confirmations" : "Base 确认数",
          hint: isEn
            ? "Leave empty to use the default of 12."
            : "留空则使用默认值 12。",
          kind: "integer",
          defaultValue: "12",
          placeholder: "12",
        },
      ],
    },
    {
      id: "sol",
      title: isEn ? "Solana Monitor" : "Solana 链监控",
      description: isEn
        ? "Configure the Solana RPC endpoint and the USDT mint used by the shared on-chain worker."
        : "配置共享链上 worker 使用的 Solana RPC 节点和 USDT Mint 地址。",
      note: isEn
        ? "RPC URL and mint address are required before enabling `usdt.sol` for real monitoring."
        : "正式启用 `usdt.sol` 自动监控前，RPC URL 和 Mint 地址必须先配置。",
      requiredKeys: ["USDT_SOL_RPC_URL", "USDT_SOL_MINT"],
      fields: [
        {
          key: "USDT_SOL_RPC_URL",
          group: "onchain",
          label: isEn ? "Solana RPC URL" : "Solana RPC 地址",
          hint: isEn
            ? "Use a stable HTTPS RPC endpoint for Solana."
            : "填写稳定可用的 Solana HTTPS RPC 节点。",
          kind: "url",
          required: true,
          placeholder: "https://solana.example-rpc.com",
        },
        {
          key: "USDT_SOL_MINT",
          group: "onchain",
          label: isEn ? "Solana USDT Mint" : "Solana USDT Mint",
          hint: isEn
            ? "The worker checks token-account deltas for this mint."
            : "链上 worker 会按这个 Mint 检查 Token Account 余额变化。",
          kind: "text",
          required: true,
          placeholder: "Es9vMFrzaCER...",
        },
        {
          key: "USDT_SOL_CONFIRMATIONS",
          group: "onchain",
          label: isEn ? "Solana Confirmations" : "Solana 确认数",
          hint: isEn
            ? "Leave empty to use the default of 1."
            : "留空则使用默认值 1。",
          kind: "integer",
          defaultValue: "1",
          placeholder: "1",
        },
      ],
    },
    {
      id: "worker",
      title: isEn ? "Worker Strategy" : "扫描策略",
      description: isEn
        ? "Tune how often the on-chain worker scans and how much chain history it inspects."
        : "调整链上 worker 的扫描间隔与回看范围。",
      note: isEn
        ? "All fields are optional. Leaving them empty keeps the code defaults."
        : "这些项都不是必填，留空会继续使用代码默认值。",
      requiredKeys: [],
      fields: [
        {
          key: "ONCHAIN_WORKER_INTERVAL_MS",
          group: "onchain",
          label: isEn ? "Worker Interval (ms)" : "扫描间隔（毫秒）",
          hint: isEn
            ? "Default: 15000."
            : "默认值：15000。",
          kind: "integer",
          defaultValue: "15000",
          placeholder: "15000",
        },
        {
          key: "USDT_EVM_LOOKBACK_BLOCKS",
          group: "onchain",
          label: isEn ? "EVM Lookback Blocks" : "EVM 回看区块数",
          hint: isEn
            ? "Default: 180."
            : "默认值：180。",
          kind: "integer",
          defaultValue: "180",
          placeholder: "180",
        },
        {
          key: "USDT_SOL_SIGNATURE_LIMIT",
          group: "onchain",
          label: isEn ? "Solana Signature Limit" : "Solana 签名查询数量",
          hint: isEn
            ? "Default: 50."
            : "默认值：50。",
          kind: "integer",
          defaultValue: "50",
          placeholder: "50",
        },
      ],
    },
    {
      id: "quote",
      title: isEn ? "Quote Strategy" : "报价策略",
      description: isEn
        ? "Configure how NovaPay prices USDT orders before locking the payable amount."
        : "配置 NovaPay 在锁定 USDT 应付金额前的报价策略。",
      note: isEn
        ? "Recommended: CoinGecko -> CoinPaprika -> fixed 7.2."
        : "推荐策略：CoinGecko -> CoinPaprika -> 固定汇率 7.2。",
      requiredKeys: [],
      fields: [
        {
          key: "USDT_RATE_PRIMARY_SOURCE",
          group: "quote",
          label: isEn ? "Primary Source" : "主汇率源",
          hint: isEn
            ? "Default: coingecko."
            : "默认值：coingecko。",
          kind: "select",
          defaultValue: "coingecko",
          options: [
            { value: "coingecko", label: "CoinGecko" },
            { value: "coinpaprika", label: "CoinPaprika" },
          ],
        },
        {
          key: "USDT_RATE_SECONDARY_SOURCE",
          group: "quote",
          label: isEn ? "Secondary Source" : "备用汇率源",
          hint: isEn
            ? "Default: coinpaprika."
            : "默认值：coinpaprika。",
          kind: "select",
          defaultValue: "coinpaprika",
          options: [
            { value: "coingecko", label: "CoinGecko" },
            { value: "coinpaprika", label: "CoinPaprika" },
          ],
        },
        {
          key: "USDT_RATE_FIXED_CNY",
          group: "quote",
          label: isEn ? "Fallback Fixed Rate" : "固定兜底汇率",
          hint: isEn
            ? "Default: 7.2."
            : "默认值：7.2。",
          kind: "number",
          defaultValue: "7.2",
          placeholder: "7.2",
        },
        {
          key: "USDT_QUOTE_TTL_SECONDS",
          group: "quote",
          label: isEn ? "Quote TTL (seconds)" : "报价有效期（秒）",
          hint: isEn
            ? "Default: 900."
            : "默认值：900。",
          kind: "integer",
          defaultValue: "900",
          placeholder: "900",
        },
        {
          key: "USDT_QUOTE_SPREAD_BPS",
          group: "quote",
          label: isEn ? "Spread (bps)" : "报价点差（bps）",
          hint: isEn
            ? "Default: 150."
            : "默认值：150。",
          kind: "integer",
          defaultValue: "150",
          placeholder: "150",
        },
        {
          key: "USDT_RATE_MIN_CNY",
          group: "quote",
          label: isEn ? "Minimum Allowed Rate" : "最小允许汇率",
          hint: isEn
            ? "Default: 6.0."
            : "默认值：6.0。",
          kind: "number",
          defaultValue: "6.0",
          placeholder: "6.0",
        },
        {
          key: "USDT_RATE_MAX_CNY",
          group: "quote",
          label: isEn ? "Maximum Allowed Rate" : "最大允许汇率",
          hint: isEn
            ? "Default: 8.5."
            : "默认值：8.5。",
          kind: "number",
          defaultValue: "8.5",
          placeholder: "8.5",
        },
      ],
    },
    {
      id: "tail",
      title: isEn ? "Tail Allocation" : "尾差分配",
      description: isEn
        ? "Configure how NovaPay allocates exact payable amounts when short-term orders share the same base quote."
        : "配置 NovaPay 在短时间同额订单下的精确应付金额分配策略。",
      note: isEn
        ? "Recommended defaults are already safe for the current implementation."
        : "当前实现的推荐默认值已经足够稳健。",
      requiredKeys: [],
      fields: [
        {
          key: "USDT_TAIL_STEP",
          group: "tail",
          label: isEn ? "Tail Step (USDT)" : "尾差步长（USDT）",
          hint: isEn
            ? "Default: 0.0001."
            : "默认值：0.0001。",
          kind: "number",
          defaultValue: "0.0001",
          placeholder: "0.0001",
        },
        {
          key: "USDT_TAIL_MAX",
          group: "tail",
          label: isEn ? "Tail Max (USDT)" : "尾差绝对上限（USDT）",
          hint: isEn
            ? "Default: 0.0099."
            : "默认值：0.0099。",
          kind: "number",
          defaultValue: "0.0099",
          placeholder: "0.0099",
        },
        {
          key: "USDT_TAIL_RELATIVE_MAX_BPS",
          group: "tail",
          label: isEn ? "Tail Relative Max (bps)" : "尾差相对上限（bps）",
          hint: isEn
            ? "Default: 30."
            : "默认值：30。",
          kind: "integer",
          defaultValue: "30",
          placeholder: "30",
        },
      ],
    },
  ];
}

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
            "Values stored in `SystemConfig` override environment defaults and are ideal for maintaining on-chain monitor settings, quote rules, payment timeouts, callback retry policy, and signing windows online.",
          onchainTitle: "On-chain monitoring presets",
          onchainDesc:
            "Use the preset forms below instead of memorizing config keys manually. Saving here writes values into the `SystemConfig` table immediately.",
          createTitle: "Advanced manual config",
          createButton: "Create Config",
          emptyTitle: "No system config yet",
          emptyDesc: "Start with the on-chain presets, then add any advanced custom keys manually.",
          updatedAt: "Updated At",
          saveButton: "Save Config",
          saveSectionButton: "Save This Group",
          dbReady: "Saved in DB",
          dbCustomized: "Customized in DB",
          usingDefaults: "Using code defaults",
          useEnvOrDefault: "Needs DB values",
          keyLabel: "Key",
          keyHintPrefix: "Key:",
          defaultHintPrefix: "Default:",
          dbOverrideNote:
            "Database values override `.env`. Empty optional fields continue to use environment defaults or the built-in code defaults.",
        }
      : {
          eyebrow: "System Config",
          title: "系统配置中心",
          description:
            "写入 `SystemConfig` 的值会覆盖环境变量默认值，适合在线维护链上监控、报价规则、支付超时、回调重试与签名窗口。",
          onchainTitle: "链上监控预设配置",
          onchainDesc:
            "下面这些表单已经按链路和策略分组好了，不需要再自己记 Key。保存后会直接写入 `SystemConfig` 表。",
          createTitle: "高级手动配置",
          createButton: "创建配置",
          emptyTitle: "还没有系统配置",
          emptyDesc: "建议先使用上面的链上预设表单，再补充少量高级自定义键。",
          updatedAt: "更新于",
          saveButton: "保存配置",
          saveSectionButton: "保存本组配置",
          dbReady: "已写入数据库",
          dbCustomized: "已在数据库自定义",
          usingDefaults: "使用代码默认值",
          useEnvOrDefault: "仍依赖环境变量/默认值",
          keyLabel: "配置键",
          keyHintPrefix: "Key：",
          defaultHintPrefix: "默认值：",
          dbOverrideNote:
            "数据库中的值会覆盖 `.env`。可选项留空时，会继续走环境变量或代码默认值。",
        };
  const configs = await prisma.systemConfig.findMany({
    orderBy: [{ group: "asc" }, { key: "asc" }],
  });
  const configMap = new Map(configs.map((config) => [config.key, config]));
  const presetSections = getOnchainSystemConfigSections(locale);

  return (
    <div className="space-y-8">
      <AdminPageHeader
        eyebrow={content.eyebrow}
        title={content.title}
        description={content.description}
      />

      <FlashMessage success={messages.success} error={messages.error} />

      <section className={`${panelClass} p-6`}>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-2xl font-semibold text-foreground">{content.onchainTitle}</h2>
            <p className="mt-2 max-w-3xl text-sm leading-7 text-muted">{content.onchainDesc}</p>
          </div>
          <StatusBadge tone="info">{content.dbOverrideNote}</StatusBadge>
        </div>
      </section>

      <section className="grid gap-6">
        {presetSections.map((section) => {
          const dbReady =
            section.requiredKeys.length > 0 &&
            section.requiredKeys.every((key) => (configMap.get(key)?.value ?? "").trim());
          const hasCustomizedValue = section.fields.some((field) =>
            Boolean((configMap.get(field.key)?.value ?? "").trim()),
          );
          const tone =
            section.requiredKeys.length > 0
              ? dbReady
                ? "success"
                : "warning"
              : hasCustomizedValue
                ? "info"
                : "neutral";
          const badgeLabel =
            section.requiredKeys.length > 0
              ? dbReady
                ? content.dbReady
                : content.useEnvOrDefault
              : hasCustomizedValue
                ? content.dbCustomized
                : content.usingDefaults;

          return (
            <article key={section.id} className={`${panelClass} p-6`}>
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <h2 className="text-2xl font-semibold text-foreground">{section.title}</h2>
                  <p className="mt-2 max-w-3xl text-sm leading-7 text-muted">{section.description}</p>
                </div>
                <StatusBadge tone={tone}>{badgeLabel}</StatusBadge>
              </div>

              <form action={saveSystemConfigBatchAction} className="mt-6 grid gap-4 lg:grid-cols-2">
                <input type="hidden" name="redirectTo" value="/admin/system-config" />
                <input type="hidden" name="batchLabel" value={section.title} />

                {section.fields.map((field) => {
                  const storedConfig = configMap.get(field.key);
                  const storedValue = storedConfig?.value ?? "";
                  const resolvedValue = storedValue || field.defaultValue || "";
                  const hint = `${content.keyHintPrefix} ${field.key} · ${field.hint}${
                    field.defaultValue ? ` · ${content.defaultHintPrefix} ${field.defaultValue}` : ""
                  }`;

                  return (
                    <div key={field.key}>
                      <input type="hidden" name="configKey" value={field.key} />
                      <input type="hidden" name="configGroup" value={field.group} />
                      <input type="hidden" name="configLabel" value={field.label} />
                      <input type="hidden" name="configKind" value={field.kind} />
                      <input
                        type="hidden"
                        name="configRequired"
                        value={field.required ? "true" : "false"}
                      />

                      <LabeledField label={field.label} hint={hint}>
                        {field.kind === "select" ? (
                          <select
                            name="configValue"
                            className={selectClass}
                            defaultValue={resolvedValue}
                          >
                            {(field.options ?? []).map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        ) : field.kind === "text" && (field.placeholder?.length ?? 0) > 40 ? (
                          <textarea
                            name="configValue"
                            defaultValue={resolvedValue}
                            placeholder={field.placeholder}
                            className={`${textareaClass} min-h-[110px] font-sans text-sm`}
                          />
                        ) : (
                          <input
                            name="configValue"
                            defaultValue={resolvedValue}
                            placeholder={field.placeholder}
                            className={inputClass}
                          />
                        )}
                      </LabeledField>
                      {storedConfig ? (
                        <p className="mt-2 text-xs leading-6 text-muted">
                          {content.updatedAt} {formatDateTime(storedConfig.updatedAt, locale)}
                        </p>
                      ) : null}
                    </div>
                  );
                })}

                <div className="rounded-[1.25rem] border border-line bg-white/70 p-4 lg:col-span-2">
                  <p className="text-sm leading-7 text-muted">{section.note}</p>
                  <div className="mt-4">
                    <button type="submit" className={buttonClass}>
                      {content.saveSectionButton}
                    </button>
                  </div>
                </div>
              </form>
            </article>
          );
        })}
      </section>

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
