import Link from "next/link";
import { requireRegistryDeveloperSession } from "../../../../lib/auth/session";
import { getCurrentLocale } from "@/lib/i18n-server";
import { TemplateDownloader } from "./template-downloader";

function buildJsonBundleExample() {
  return `{
  "manifest": {
    "manifestVersion": 1,
    "slug": "acme.wxpay-native-plus",
    "kind": "PAYMENT_CHANNEL",
    "channelCode": "wxpay.native.plus",
    "providerKey": "wxpay",
    "packageName": "@acme/plugin-wxpay-native-plus",
    "displayName": "Acme WeChat Native Plus",
    "vendor": "Acme Payments",
    "description": "Third-party WeChat Native payment plugin for NovaPay Registry.",
    "version": "1.0.0",
    "capabilities": ["native_qr", "notify_callback", "order_query", "order_close"],
    "category": { "zh": "官方支付", "en": "Official Payment" },
    "summary": { "zh": "适配微信 Native 支付。", "en": "WeChat Native payment support." },
    "detail": { "zh": "开发者自定义支付插件。", "en": "Custom developer payment plugin." },
    "supportsCallbackRoute": true,
    "requiresMerchantProfileCompletion": true,
    "runtimeEntrypoint": "./runtime.js",
    "verificationProfile": {
      "version": 1,
      "pluginType": "PAYMENT_CHANNEL",
      "executionMode": "AUTO_ONLY",
      "requiredConfigKeys": ["appId", "mchId"],
      "requiredChecks": ["create_payment"],
      "expectedCreatePayment": {
        "status": ["requires_action", "processing"],
        "mode": ["qr_code"],
        "checkoutUrl": "required"
      }
    }
  },
  "files": [
    {
      "path": "runtime.js",
      "content": "export const pluginRuntime = { provider: { getSummary() { return { code: 'wxpay.native.plus', provider: 'wxpay', displayName: 'Acme WeChat Native Plus', description: 'Custom runtime', configured: true, implementationStatus: 'ready', capabilities: ['native_qr', 'notify_callback', 'order_query', 'order_close'] }; } } };"
    }
  ]
}`;
}

export default async function NewPluginGuidePage() {
  await requireRegistryDeveloperSession();
  const locale = await getCurrentLocale();
  const content =
    locale === "en"
      ? {
          eyebrow: "First upload",
          title: "Create and publish your plugin",
          lead:
            "The Registry is public for browsing, but only the original developer account can manage a plugin slug. Use this page to understand namespace rules, packaging requirements, and the initial upload path.",
          uploadNow: "Open upload flow",
          back: "Back to plugins",
          sectionRules: "Ownership & naming",
          sectionTemplate: "Bundle template",
          sectionChecklist: "Integration checklist",
          sectionFiles: "Required fields",
          slugRule1: "Use your own namespace such as `acme.*` or `yourbrand.*`.",
          slugRule2: "The `novapay.*` namespace is reserved for official NovaPay plugins.",
          slugRule3: "The first successful upload claims the slug for your developer account.",
          fileRule1: "`plugin.json` must include bilingual `category`, `summary`, and `detail`.",
          fileRule2: "`runtime.js` is required for runnable payment plugins.",
          fileRule3: "`verificationProfile` is required for third-party payment plugins that need pre-publish testing.",
          checklist1: "Prepare a JSON bundle or tar.gz that contains `plugin.json` and runtime files.",
          checklist2: "Upload the first version through `/developer/plugins/{slug}/upload`.",
          checklist3: "Run verification with your own required merchant config.",
          checklist4: "Submit for review after the version reaches `PASSED`.",
          example: "Example JSON bundle",
          generator: "Template generator",
          download: "Download JSON bundle",
          sampleUpload: "Open upload page for this slug",
          slug: "Slug",
          preset: "Preset",
          providerKey: "Provider Key",
          channelCode: "Channel Code",
          vendor: "Vendor",
          displayName: "Display Name",
          packageName: "Package Name",
          descriptionField: "Description",
          presetWxpay: "WeChat preset",
          presetAlipay: "Alipay preset",
          presetCrypto: "Crypto preset",
          presetGeneric: "Generic third-party preset",
        }
      : {
          eyebrow: "首次上传",
          title: "创建并发布你的插件",
          lead:
            "插件市场对所有登录用户公开浏览，但只有最初发布该 slug 的开发者账号才能继续管理它。这个页面会把命名规则、打包要求和首次上传路径讲清楚。",
          uploadNow: "打开上传流程",
          back: "返回插件列表",
          sectionRules: "归属与命名规则",
          sectionTemplate: "插件包模板",
          sectionChecklist: "对接清单",
          sectionFiles: "必备字段",
          slugRule1: "请使用你自己的命名空间，例如 `acme.*` 或 `yourbrand.*`。",
          slugRule2: "`novapay.*` 命名空间保留给 NovaPay 官方插件使用。",
          slugRule3: "某个 slug 第一次成功上传后，就会归属到当前开发者账号。",
          fileRule1: "`plugin.json` 必须包含双语的 `category`、`summary`、`detail`。",
          fileRule2: "可运行支付插件必须提供 `runtime.js`。",
          fileRule3: "第三方支付插件需要提供 `verificationProfile`，用于发布前验证。",
          checklist1: "准备一个 JSON bundle 或 tar.gz，里面至少包含 `plugin.json` 和运行时代码。",
          checklist2: "首次版本通过 `/developer/plugins/{slug}/upload` 路径上传。",
          checklist3: "按你插件真实需要的商户参数运行验证。",
          checklist4: "验证通过后再提交审核。",
          example: "JSON bundle 示例",
          generator: "模板生成器",
          download: "下载 JSON 模板包",
          sampleUpload: "打开这个 slug 的上传页",
          slug: "Slug",
          preset: "预设",
          providerKey: "提供方标识",
          channelCode: "通道编码",
          vendor: "厂商",
          displayName: "显示名称",
          packageName: "包名",
          descriptionField: "描述",
          presetWxpay: "微信支付预设",
          presetAlipay: "支付宝预设",
          presetCrypto: "加密支付预设",
          presetGeneric: "通用第三方预设",
        };

  const sampleSlug = "acme.wxpay-native-plus";

  return (
    <>
      <section className="hero-band">
        <div className="container">
          <Link
            href="/developer/plugins"
            className="text-body-sm"
            style={{ color: "var(--color-positive-deep)", fontWeight: 600 }}
          >
            ← {content.back}
          </Link>
          <p className="text-eyebrow" style={{ marginTop: 16 }}>{content.eyebrow}</p>
          <div className="flex-between" style={{ alignItems: "flex-end", gap: 24, marginTop: 12 }}>
            <div style={{ flex: 1, minWidth: 280 }}>
              <h1 className="text-display-lg">{content.title}</h1>
              <p className="text-lead" style={{ marginTop: 12, maxWidth: 720 }}>
                {content.lead}
              </p>
            </div>
            <Link href={`/developer/plugins/${sampleSlug}/upload`} className="btn btn-primary">
              {content.uploadNow}
            </Link>
          </div>
        </div>
      </section>

      <section className="content-band">
        <div className="container" style={{ display: "grid", gap: 32 }}>
          <div className="grid-2">
            <div className="card card-lg">
              <h2 className="text-display-xs">{content.sectionRules}</h2>
              <ul style={{ marginTop: 16, display: "grid", gap: 12, paddingLeft: 20 }}>
                <li>{content.slugRule1}</li>
                <li>{content.slugRule2}</li>
                <li>{content.slugRule3}</li>
              </ul>
            </div>

            <div className="card-feature-sage" style={{ padding: 28 }}>
              <h2 className="text-display-xs">{content.sectionFiles}</h2>
              <ul style={{ marginTop: 16, display: "grid", gap: 12, paddingLeft: 20 }}>
                <li>{content.fileRule1}</li>
                <li>{content.fileRule2}</li>
                <li>{content.fileRule3}</li>
              </ul>
            </div>
          </div>

          <div className="card card-lg">
            <h2 className="text-display-xs">{content.sectionChecklist}</h2>
            <ol style={{ marginTop: 16, display: "grid", gap: 12, paddingLeft: 20 }}>
              <li>{content.checklist1}</li>
              <li>{content.checklist2}</li>
              <li>{content.checklist3}</li>
              <li>{content.checklist4}</li>
            </ol>
          </div>

          <div>
            <h2 className="text-display-xs" style={{ marginBottom: 16 }}>{content.generator}</h2>
            <TemplateDownloader
              locale={locale}
              labels={{
                slug: content.slug,
                preset: content.preset,
                providerKey: content.providerKey,
                channelCode: content.channelCode,
                vendor: content.vendor,
                displayName: content.displayName,
                packageName: content.packageName,
                description: content.descriptionField,
                download: content.download,
                sampleUpload: content.sampleUpload,
                presetWxpay: content.presetWxpay,
                presetAlipay: content.presetAlipay,
                presetCrypto: content.presetCrypto,
                presetGeneric: content.presetGeneric,
              }}
            />
          </div>

          <div className="card" style={{ overflow: "hidden" }}>
            <div style={{ padding: "20px 24px 0" }}>
              <h2 className="text-display-xs">{content.sectionTemplate}</h2>
              <p className="text-body-sm text-mute" style={{ marginTop: 8 }}>
                {content.example}
              </p>
            </div>
            <pre
              style={{
                margin: 0,
                padding: 24,
                overflowX: "auto",
                fontSize: 12,
                lineHeight: 1.6,
                fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                background: "rgba(9, 27, 22, 0.94)",
                color: "rgba(239, 250, 245, 0.96)",
              }}
            >
              <code>{buildJsonBundleExample()}</code>
            </pre>
          </div>
        </div>
      </section>
    </>
  );
}
