import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentLocale } from "@/lib/i18n-server";
import { getMainSiteSetupStatus } from "@/lib/platform-setup";
import { completeMainSiteSetupAction } from "./actions";

function resolveMessage(value: string | string[] | undefined) {
  return typeof value === "string" ? value : Array.isArray(value) ? value[0] : null;
}

export default async function MainSiteSetupPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const locale = await getCurrentLocale();
  const status = await getMainSiteSetupStatus();
  const params = (await searchParams) ?? {};
  const error = resolveMessage(params.error);
  const success = resolveMessage(params.success);

  if (status.setupComplete && success !== "setup_completed") {
    redirect("/");
  }

  const content =
    locale === "en"
      ? {
          eyebrow: "First-time Setup",
          title: "Initialize the NovaPay main site",
          lead:
            "Complete the administrator account, runtime callback policy, and at least one official payment channel before opening the operations console.",
          checksTitle: "Readiness",
          ok: "Ready",
          missing: "Pending",
          checks: {
            admin: "Admin account",
            bridgeMerchant: "Internal bridge merchant",
            alipay: "Alipay channel",
            wxpay: "WeChat channel",
            publicBaseUrl: "Public base URL",
            dataKey: "Data encryption key",
            instanceId: "Instance ID",
            callbackTimeout: "Callback timeout",
            callbackRetry: "Callback retry interval",
            callbackAttempts: "Callback max attempts",
          },
          adminSection: "Administrator",
          callbackSection: "Callback policy",
          alipaySection: "Alipay Web Payment",
          wxpaySection: "WeChat Native QR",
          atLeastOne: "At least one payment channel must be enabled.",
          submit: "Complete main-site setup",
          success: "Main-site setup completed.",
          enterConsole: "Open admin console",
          labels: {
            adminName: "Administrator name",
            adminEmail: "Administrator email",
            adminPassword: "Administrator password",
            callbackTimeoutMs: "Callback timeout (ms)",
            callbackRetryIntervalSeconds: "Retry interval (seconds)",
            callbackMaxAttempts: "Max attempts",
            enableAlipay: "Enable Alipay Web Payment",
            enableWxpay: "Enable WeChat Native QR",
            alipayAppId: "App ID",
            alipayPrivateKey: "Application private key",
            alipayPublicKey: "Alipay public key",
            wxpayAppId: "App ID",
            wxpayMchId: "Merchant ID",
            wxpayMchSerialNo: "Merchant certificate serial number",
            wxpayPrivateKey: "Merchant private key",
            wxpayApiV3Key: "API v3 key",
            wxpayPlatformPublicKey: "WeChat platform public key",
            wxpayPlatformSerial: "WeChat platform public key ID",
          },
        }
      : {
          eyebrow: "首次安装",
          title: "初始化 NovaPay 主站",
          lead:
            "在开放后台之前，请先完成管理员账号、回调运行策略，以及至少一个官方支付通道的配置。",
          checksTitle: "就绪状态",
          ok: "已就绪",
          missing: "待配置",
          checks: {
            admin: "管理员账号",
            bridgeMerchant: "内部桥接商户",
            alipay: "支付宝通道",
            wxpay: "微信通道",
            publicBaseUrl: "公网访问地址",
            dataKey: "数据加密密钥",
            instanceId: "实例 ID",
            callbackTimeout: "回调超时",
            callbackRetry: "回调重试间隔",
            callbackAttempts: "回调最大次数",
          },
          adminSection: "管理员账号",
          callbackSection: "回调策略",
          alipaySection: "支付宝网页支付",
          wxpaySection: "微信 Native 扫码",
          atLeastOne: "至少启用一个支付通道。",
          submit: "完成主站安装",
          success: "主站初始化已完成。",
          enterConsole: "进入管理后台",
          labels: {
            adminName: "管理员名称",
            adminEmail: "管理员邮箱",
            adminPassword: "管理员密码",
            callbackTimeoutMs: "回调超时（毫秒）",
            callbackRetryIntervalSeconds: "重试间隔（秒）",
            callbackMaxAttempts: "最大重试次数",
            enableAlipay: "启用支付宝网页支付",
            enableWxpay: "启用微信 Native 扫码",
            alipayAppId: "App ID",
            alipayPrivateKey: "应用私钥",
            alipayPublicKey: "支付宝公钥",
            wxpayAppId: "App ID",
            wxpayMchId: "商户号",
            wxpayMchSerialNo: "商户证书序列号",
            wxpayPrivateKey: "商户私钥",
            wxpayApiV3Key: "API v3 密钥",
            wxpayPlatformPublicKey: "微信平台公钥",
            wxpayPlatformSerial: "微信支付公钥 ID",
          },
        };

  const checks = [
    { label: content.checks.admin, ok: status.bootstrap.adminConfigured },
    { label: content.checks.bridgeMerchant, ok: status.bootstrap.bridgeMerchantReady },
    { label: content.checks.alipay, ok: status.bootstrap.alipayConfigured },
    { label: content.checks.wxpay, ok: status.bootstrap.wxpayConfigured },
    { label: content.checks.publicBaseUrl, ok: status.systemConfig.publicBaseUrlConfigured },
    { label: content.checks.dataKey, ok: status.systemConfig.dataEncryptionKeyConfigured },
    { label: content.checks.instanceId, ok: status.systemConfig.instanceIdConfigured },
    { label: content.checks.callbackTimeout, ok: status.systemConfig.callbackTimeoutConfigured },
    { label: content.checks.callbackRetry, ok: status.systemConfig.callbackRetryIntervalConfigured },
    { label: content.checks.callbackAttempts, ok: status.systemConfig.callbackMaxAttemptsConfigured },
  ];

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-6 py-8 sm:px-10 lg:px-12">
      <section className="rounded-[2rem] border border-line bg-panel-strong p-8 shadow-[var(--shadow)] sm:p-12">
        <div className="space-y-4">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-muted">
            {content.eyebrow}
          </p>
          <h1 className="text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
            {content.title}
          </h1>
          <p className="max-w-3xl text-base leading-8 text-muted sm:text-lg">{content.lead}</p>
        </div>
      </section>

      {error ? (
        <section className="mt-6 rounded-[1.5rem] border border-[rgba(184,32,32,0.16)] bg-[rgba(184,32,32,0.06)] p-5 text-sm text-[#7f1d1d]">
          {error}
        </section>
      ) : null}

      {success === "setup_completed" ? (
        <section className="mt-6 rounded-[1.5rem] border border-[rgba(13,122,98,0.16)] bg-[rgba(13,122,98,0.06)] p-6">
          <p className="text-base font-medium text-foreground">{content.success}</p>
          <div className="mt-4">
            <Link
              href="/admin/login"
              className="rounded-full bg-[linear-gradient(135deg,#b66a1d,#d4872f)] px-6 py-3 text-sm font-semibold text-white shadow-[0_16px_40px_rgba(180,104,28,0.28)]"
            >
              {content.enterConsole}
            </Link>
          </div>
        </section>
      ) : null}

      <section className="mt-6 rounded-[2rem] border border-line bg-panel-strong p-8 shadow-[var(--shadow)]">
        <div className="space-y-5">
          <h2 className="text-2xl font-semibold text-foreground">{content.checksTitle}</h2>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {checks.map((item) => (
              <article key={item.label} className="rounded-[1.25rem] border border-line bg-white/75 p-4">
                <p className="text-sm font-medium text-foreground">{item.label}</p>
                <p className="mt-2 text-sm text-muted">{item.ok ? content.ok : content.missing}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {success === "setup_completed" ? null : (
        <form action={completeMainSiteSetupAction} className="mt-6 space-y-6">
          <section className="rounded-[2rem] border border-line bg-panel-strong p-8 shadow-[var(--shadow)]">
            <h2 className="text-2xl font-semibold text-foreground">{content.adminSection}</h2>
            <div className="mt-6 grid gap-4 md:grid-cols-3">
              <label className="flex flex-col gap-2">
                <span className="text-sm font-medium text-foreground">{content.labels.adminName}</span>
                <input name="adminName" className="rounded-2xl border border-line bg-white/85 px-4 py-3" />
              </label>
              <label className="flex flex-col gap-2">
                <span className="text-sm font-medium text-foreground">{content.labels.adminEmail}</span>
                <input name="adminEmail" type="email" className="rounded-2xl border border-line bg-white/85 px-4 py-3" />
              </label>
              <label className="flex flex-col gap-2">
                <span className="text-sm font-medium text-foreground">{content.labels.adminPassword}</span>
                <input name="adminPassword" type="password" className="rounded-2xl border border-line bg-white/85 px-4 py-3" />
              </label>
            </div>
          </section>

          <section className="rounded-[2rem] border border-line bg-panel-strong p-8 shadow-[var(--shadow)]">
            <h2 className="text-2xl font-semibold text-foreground">{content.callbackSection}</h2>
            <div className="mt-6 grid gap-4 md:grid-cols-3">
              <label className="flex flex-col gap-2">
                <span className="text-sm font-medium text-foreground">{content.labels.callbackTimeoutMs}</span>
                <input name="callbackTimeoutMs" defaultValue="10000" className="rounded-2xl border border-line bg-white/85 px-4 py-3" />
              </label>
              <label className="flex flex-col gap-2">
                <span className="text-sm font-medium text-foreground">{content.labels.callbackRetryIntervalSeconds}</span>
                <input name="callbackRetryIntervalSeconds" defaultValue="60" className="rounded-2xl border border-line bg-white/85 px-4 py-3" />
              </label>
              <label className="flex flex-col gap-2">
                <span className="text-sm font-medium text-foreground">{content.labels.callbackMaxAttempts}</span>
                <input name="callbackMaxAttempts" defaultValue="6" className="rounded-2xl border border-line bg-white/85 px-4 py-3" />
              </label>
            </div>
          </section>

          <section className="rounded-[2rem] border border-line bg-panel-strong p-8 shadow-[var(--shadow)]">
            <div className="space-y-2">
              <h2 className="text-2xl font-semibold text-foreground">{content.alipaySection}</h2>
              <p className="text-sm text-muted">{content.atLeastOne}</p>
            </div>
            <div className="mt-6 grid gap-4 md:grid-cols-3">
              <label className="flex flex-col gap-2 md:col-span-3">
                <span className="text-sm font-medium text-foreground">
                  <input name="enableAlipay" type="checkbox" defaultChecked style={{ marginRight: 8 }} />
                  {content.labels.enableAlipay}
                </span>
              </label>
              <label className="flex flex-col gap-2">
                <span className="text-sm font-medium text-foreground">{content.labels.alipayAppId}</span>
                <input name="alipayAppId" className="rounded-2xl border border-line bg-white/85 px-4 py-3" />
              </label>
              <label className="flex flex-col gap-2 md:col-span-3">
                <span className="text-sm font-medium text-foreground">{content.labels.alipayPrivateKey}</span>
                <textarea name="alipayPrivateKey" rows={6} className="rounded-2xl border border-line bg-white/85 px-4 py-3" />
              </label>
              <label className="flex flex-col gap-2 md:col-span-3">
                <span className="text-sm font-medium text-foreground">{content.labels.alipayPublicKey}</span>
                <textarea name="alipayPublicKey" rows={6} className="rounded-2xl border border-line bg-white/85 px-4 py-3" />
              </label>
            </div>
          </section>

          <section className="rounded-[2rem] border border-line bg-panel-strong p-8 shadow-[var(--shadow)]">
            <h2 className="text-2xl font-semibold text-foreground">{content.wxpaySection}</h2>
            <div className="mt-6 grid gap-4 md:grid-cols-3">
              <label className="flex flex-col gap-2 md:col-span-3">
                <span className="text-sm font-medium text-foreground">
                  <input name="enableWxpay" type="checkbox" style={{ marginRight: 8 }} />
                  {content.labels.enableWxpay}
                </span>
              </label>
              <label className="flex flex-col gap-2">
                <span className="text-sm font-medium text-foreground">{content.labels.wxpayAppId}</span>
                <input name="wxpayAppId" className="rounded-2xl border border-line bg-white/85 px-4 py-3" />
              </label>
              <label className="flex flex-col gap-2">
                <span className="text-sm font-medium text-foreground">{content.labels.wxpayMchId}</span>
                <input name="wxpayMchId" className="rounded-2xl border border-line bg-white/85 px-4 py-3" />
              </label>
              <label className="flex flex-col gap-2">
                <span className="text-sm font-medium text-foreground">{content.labels.wxpayMchSerialNo}</span>
                <input name="wxpayMchSerialNo" className="rounded-2xl border border-line bg-white/85 px-4 py-3" />
              </label>
              <label className="flex flex-col gap-2">
                <span className="text-sm font-medium text-foreground">{content.labels.wxpayApiV3Key}</span>
                <input name="wxpayApiV3Key" className="rounded-2xl border border-line bg-white/85 px-4 py-3" />
              </label>
              <label className="flex flex-col gap-2 md:col-span-3">
                <span className="text-sm font-medium text-foreground">{content.labels.wxpayPrivateKey}</span>
                <textarea name="wxpayPrivateKey" rows={6} className="rounded-2xl border border-line bg-white/85 px-4 py-3" />
              </label>
              <label className="flex flex-col gap-2 md:col-span-3">
                <span className="text-sm font-medium text-foreground">{content.labels.wxpayPlatformPublicKey}</span>
                <textarea name="wxpayPlatformPublicKey" rows={6} className="rounded-2xl border border-line bg-white/85 px-4 py-3" />
              </label>
              <label className="flex flex-col gap-2">
                <span className="text-sm font-medium text-foreground">{content.labels.wxpayPlatformSerial}</span>
                <input name="wxpayPlatformSerial" className="rounded-2xl border border-line bg-white/85 px-4 py-3" />
              </label>
            </div>
          </section>

          <div className="flex justify-end">
            <button
              type="submit"
              className="rounded-full bg-[linear-gradient(135deg,#b66a1d,#d4872f)] px-6 py-3 text-sm font-semibold text-white shadow-[0_16px_40px_rgba(180,104,28,0.28)]"
            >
              {content.submit}
            </button>
          </div>
        </form>
      )}
    </main>
  );
}
