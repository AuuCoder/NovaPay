import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentLocale } from "@/lib/i18n-server";
import { LanguageSwitcher } from "../language-switcher";
import { getRegistrySetupStatus } from "../../lib/setup";
import { RegistryAutoConnect } from "./auto-connect";
import { governancePath } from "../../lib/governance-paths";

function resolveMessage(
  value: string | string[] | undefined,
): string | null {
  return typeof value === "string" ? value : Array.isArray(value) ? value[0] : null;
}

export default async function RegistrySetupPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const locale = await getCurrentLocale();
  const status = await getRegistrySetupStatus();
  const params = (await searchParams) ?? {};
  const error = resolveMessage(params.error);
  const success = resolveMessage(params.success);

  if (status.setupComplete && success !== "setup_completed") {
    redirect("/");
  }

  const content =
    locale === "en"
      ? {
          brand: "NovaPay Plugin",
          eyebrow: "First-time Setup",
          title: "Initialize the NovaPay plugin platform",
          lead:
            "The registry now reuses the main-site payment stack. Complete the main-site setup on port 3000 first, then connect the registry to that bridge in one step.",
          statusTitle: "Environment checks",
          envOk: "Ready",
          envMissing: "Missing",
          mainReachable: "Main site reachable",
          registryUrl: "Registry app URL configured",
          adminConfigured: "Main-site admin ready",
          merchantConfigured: "Internal bridge merchant ready",
          alipayConfigured: "Alipay channel ready",
          wxpayConfigured: "WeChat channel ready",
          bridgeConfigured: "Registry bridge ready",
          mainSiteStepTitle: "Complete main-site setup first",
          mainSiteStepBody:
            "The registry no longer asks for duplicate administrator or payment-channel configuration. Finish the main-site setup first, then return here to bind the registry bridge.",
          bridgeStepTitle: "Connect registry to main site",
          bridgeStepBody:
            "The registry will automatically request a fresh bridge credential from the main site and store the bridge settings locally.",
          openMainSite: "Open main-site setup",
          submit: "Retry connection",
          success: "Setup completed. Continue to the access center to sign in through NovaPay SSO or a developer account.",
          successAction: "Open access center",
        }
      : {
          brand: "NovaPay Plugin",
          eyebrow: "首次安装",
          title: "初始化 NovaPay 插件平台",
          lead:
            "插件市场现在直接复用主站支付能力。请先完成 3000 端口主站安装，再回到这里一键绑定桥接关系。",
          statusTitle: "环境检查",
          envOk: "已就绪",
          envMissing: "未配置",
          mainReachable: "主站可访问",
          registryUrl: "Registry 地址已配置",
          adminConfigured: "主站管理员已就绪",
          merchantConfigured: "内部桥接商户已就绪",
          alipayConfigured: "支付宝通道已就绪",
          wxpayConfigured: "微信通道已就绪",
          bridgeConfigured: "Registry 桥接已就绪",
          mainSiteStepTitle: "先完成主站安装",
          mainSiteStepBody:
            "插件市场不再重复要求你填写管理员和支付通道参数。请先完成 3000 端口主站安装，然后回到这里完成桥接绑定。",
          bridgeStepTitle: "连接主站桥接",
          bridgeStepBody:
            "插件市场会自动向主站申请新的桥接凭证，并把桥接配置写入 Registry 本地设置。",
          openMainSite: "打开主站安装向导",
          submit: "重试连接",
          success: "初始化已完成。请先进入访问中心，通过 NovaPay SSO 或开发者账号登录后再继续。",
          successAction: "进入访问中心",
        };

  const checks = [
    {
      label: content.mainReachable,
      ok: status.environment.mainAppReachable,
    },
    {
      label: content.registryUrl,
      ok: status.environment.registryAppUrlConfigured,
    },
    {
      label: content.adminConfigured,
      ok: status.mainApp.adminConfigured,
    },
    {
      label: content.merchantConfigured,
      ok: status.mainApp.bridgeMerchantReady,
    },
    {
      label: content.alipayConfigured,
      ok: status.mainApp.alipayConfigured,
    },
    {
      label: content.wxpayConfigured,
      ok: status.mainApp.wxpayConfigured,
    },
    {
      label: content.bridgeConfigured,
      ok: status.registryBridgeConfigured,
    },
  ];

  return (
    <main>
      <nav className="nav">
        <div className="nav-inner">
          <div className="nav-brand">
            <span className="nav-brand-mark">N</span>
            <span>{content.brand}</span>
          </div>
          <div className="nav-actions">
            <LanguageSwitcher locale={locale} inline />
          </div>
        </div>
      </nav>

      <section className="admin-shell">
        <div className="container admin-page">
          <div className="admin-header">
            <div className="admin-header-copy">
              <p className="text-eyebrow">{content.eyebrow}</p>
              <h1 className="admin-title" style={{ maxWidth: 880 }}>{content.title}</h1>
              <p className="admin-subtitle" style={{ maxWidth: 860 }}>{content.lead}</p>
            </div>
          </div>

          {error ? (
            <div className="risk-card" style={{ borderColor: "rgba(240,68,56,0.18)", background: "rgba(240,68,56,0.05)" }}>
              <div className="risk-meta">
                <p className="risk-title">{error}</p>
              </div>
            </div>
          ) : null}

          {success === "setup_completed" ? (
            <div className="risk-card" style={{ borderColor: "rgba(18,183,106,0.18)", background: "rgba(18,183,106,0.06)" }}>
              <div className="risk-meta">
                <p className="risk-title">{content.success}</p>
              </div>
              <div style={{ marginTop: 16 }}>
                <a href="/developer/auth" className="btn btn-primary">{content.successAction}</a>
              </div>
            </div>
          ) : null}

          <div className="enterprise-panel">
            <div className="admin-header-copy" style={{ marginBottom: 20 }}>
              <h2 className="text-display-xs">{content.statusTitle}</h2>
              <p className="text-body-sm text-body-color">{status.environment.mainAppUrl}</p>
            </div>
            <div className="grid-3">
              {checks.map((item) => (
                <article key={item.label} className="risk-card">
                  <div className="risk-meta">
                    <p className="risk-title">{item.label}</p>
                    <p className="risk-subtitle">{item.ok ? content.envOk : content.envMissing}</p>
                  </div>
                </article>
              ))}
            </div>
          </div>

          {success === "setup_completed" ? null : (
            <div className="enterprise-panel">
              {!status.mainApp.setupComplete ? (
                <section className="risk-card">
                  <div className="risk-meta">
                    <p className="risk-title">{content.mainSiteStepTitle}</p>
                    <p className="risk-subtitle">{content.mainSiteStepBody}</p>
                  </div>
                  <div style={{ marginTop: 16 }}>
                    <Link
                      href={`${status.environment.mainAppUrl}/setup`}
                      className="btn btn-primary"
                    >
                      {content.openMainSite}
                    </Link>
                  </div>
                </section>
              ) : (
                <RegistryAutoConnect
                  locale={locale}
                  title={content.bridgeStepTitle}
                  body={content.bridgeStepBody}
                  retryLabel={content.submit}
                  successUrl="/setup?success=setup_completed"
                />
              )}
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
