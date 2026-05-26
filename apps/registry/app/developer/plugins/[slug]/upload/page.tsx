import Link from "next/link";
import { getCurrentLocale } from "@/lib/i18n-server";
import { UploadVersionForm } from "./upload-form";

export default async function UploadVersionPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const locale = await getCurrentLocale();
  const { slug } = await params;

  const content =
    locale === "en"
      ? {
          back: "Back to plugin",
          eyebrow: "Upload",
          title: "Upload a new version",
          lead:
            "Drop a signed bundle up to 50 MB. The registry validates the manifest, computes sha256, signs the package, and prepares the version for review workflows.",
          nextTitle: "What happens next",
          next1: "The bundle is extracted and the manifest is validated.",
          next2: "sha256 and Ed25519 signature are computed and persisted.",
          next3: "A static scan job runs against your package files.",
          next4: "The version enters the DRAFT state.",
          next5: "You run verification and submit it for review when ready.",
          reqTitle: "Bundle requirements",
          req1: "`plugin.json` is mandatory.",
          req2: "JSON bundle and tar.gz are supported now. ZIP is not supported yet.",
          req3: "Paid plugins must declare a billing plan, amount, and ISO currency.",
          req4: "Third-party payment plugins should declare `verificationProfile`.",
          req5: "Slug in the manifest must exactly match the URL slug.",
          form: {
            dropTitle: "Bundle",
            dropEmpty: "Drop your bundle here",
            replaceHint: (sizeKb: string) => `${sizeKb} KB · click to replace`,
            browseHint: "or click to browse · tar.gz / json",
            pricingMode: "Pricing mode",
            free: "Free",
            paid: "Paid",
            priceLabel: "Price label",
            priceLabelPlaceholder: "Optional display label",
            billingPlan: "Billing plan",
            planInstance: "Per instance one-time",
            planMerchant: "Per merchant subscription",
            planUsage: "Per usage",
            priceAmount: "Price amount",
            currency: "Currency",
            purchaseUrl: "Purchase URL",
            purchaseUrlPlaceholder: "https://example.com/buy",
            uploading: "Uploading...",
            upload: "Upload version",
            clear: "Clear",
            networkError: "Network error",
            uploaded: "Uploaded",
            deduplicated: "deduplicated",
            version: "Version",
            sha256: "sha256",
            signature: "Signature",
            status: "Status",
          },
        }
      : {
          back: "返回插件详情",
          eyebrow: "上传",
          title: "上传新版本",
          lead:
            "上传 50 MB 以内的已签名插件包。注册中心会校验 manifest、计算 sha256、完成签名，并把该版本纳入后续审核流程。",
          nextTitle: "接下来会发生什么",
          next1: "系统会先解包并校验 manifest。",
          next2: "系统会计算并保存 sha256 与 Ed25519 签名。",
          next3: "系统会对插件包文件触发静态扫描任务。",
          next4: "该版本会先进入 DRAFT 状态。",
          next5: "准备完成后，再运行验证并提交审核。",
          reqTitle: "插件包要求",
          req1: "`plugin.json` 是必需文件。",
          req2: "当前支持 JSON bundle 和 tar.gz，暂不支持 ZIP。",
          req3: "收费插件必须声明计费计划、金额和 ISO 币种。",
          req4: "第三方支付插件应声明 `verificationProfile`。",
          req5: "manifest 中的 slug 必须和当前 URL slug 完全一致。",
          form: {
            dropTitle: "插件包",
            dropEmpty: "将插件包拖拽到这里",
            replaceHint: (sizeKb: string) => `${sizeKb} KB · 点击替换`,
            browseHint: "或点击选择 · tar.gz / json",
            pricingMode: "定价模式",
            free: "免费",
            paid: "收费",
            priceLabel: "价格展示文案",
            priceLabelPlaceholder: "可选的展示文案",
            billingPlan: "计费计划",
            planInstance: "按实例一次性收费",
            planMerchant: "按商户订阅收费",
            planUsage: "按使用量收费",
            priceAmount: "价格金额",
            currency: "币种",
            purchaseUrl: "购买链接",
            purchaseUrlPlaceholder: "https://example.com/buy",
            uploading: "上传中...",
            upload: "上传版本",
            clear: "清空",
            networkError: "网络错误",
            uploaded: "上传完成",
            deduplicated: "已去重",
            version: "版本",
            sha256: "sha256",
            signature: "签名",
            status: "状态",
          },
        };

  return (
    <>
      <section className="hero-band">
        <div className="container">
          <Link
            href={`/developer/plugins/${slug}`}
            className="text-body-sm"
            style={{ color: "var(--color-positive-deep)", fontWeight: 600 }}
          >
            ← {content.back}
          </Link>
          <p className="text-eyebrow" style={{ marginTop: 16 }}>{content.eyebrow}</p>
          <h1 className="text-display-md" style={{ marginTop: 8 }}>{content.title}</h1>
          <p className="text-lead" style={{ marginTop: 12, maxWidth: 640 }}>
            {content.lead}
          </p>
        </div>
      </section>

      <section className="content-band">
        <div
          className="container"
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1.4fr) minmax(0, 1fr)",
            gap: 32,
          }}
        >
          <UploadVersionForm slug={slug} copy={content.form} />

          <div className="card-feature-sage" style={{ padding: 24 }}>
            <p className="text-eyebrow">{content.nextTitle}</p>
            <ol
              style={{
                marginTop: 16,
                paddingLeft: 20,
                display: "flex",
                flexDirection: "column",
                gap: 12,
                fontSize: 14,
              }}
            >
              <li>{content.next1}</li>
              <li>{content.next2}</li>
              <li>{content.next3}</li>
              <li>{content.next4}</li>
              <li>{content.next5}</li>
            </ol>
            <div className="divider" />
            <p className="text-eyebrow">{content.reqTitle}</p>
            <ul
              style={{
                marginTop: 16,
                paddingLeft: 20,
                display: "flex",
                flexDirection: "column",
                gap: 12,
                fontSize: 14,
              }}
            >
              <li>{content.req1}</li>
              <li>{content.req2}</li>
              <li>{content.req3}</li>
              <li>{content.req4}</li>
              <li>{content.req5}</li>
            </ul>
          </div>
        </div>
      </section>
    </>
  );
}
