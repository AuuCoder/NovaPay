import { requireRegistryAdminSession } from "../../../lib/auth/session";
import { getCurrentLocale } from "@/lib/i18n-server";
import { getRegistryRuntime } from "../../../lib/runtime/state";

function getRegistryBaseUrl() {
  return process.env.REGISTRY_APP_URL?.trim() || "http://localhost:3100";
}

function getDefaultConsumerAppId() {
  return "novapay-admin";
}

function getDefaultConsumerAppKey() {
  return process.env.REGISTRY_DEFAULT_APP_KEY?.trim() || "novapay-dev-secret";
}

export default async function RegistryIntegrationPage() {
  await requireRegistryAdminSession();
  const locale = (await getCurrentLocale()) as "zh" | "en";
  const state = await getRegistryRuntime();
  const [activeKey, trustAnchors] = await Promise.all([
    state.keyStore.getActive(),
    state.keyStore.listTrustAnchors(),
  ]);

  const activeTrustAnchor = trustAnchors.find((item) => item.keyId === activeKey.keyId) ?? activeKey;
  const content =
    locale === "en"
      ? {
          eyebrow: "Registry Integration",
          title: "Registry connection details",
          subtitle:
            "Use these values when connecting NovaPay main-site plugin registry sources to this registry. Local development defaults are shown explicitly; production values should be copied from the active trust anchor and consumer configuration.",
          sections: {
            source: "Remote source minimum fields",
            sourceNote:
              "These are the exact values the main site needs when adding this registry as a remote plugin source.",
            trust: "Trust and signing material",
            trustNote:
              "Use the active signing key as the trust public key if you want the main site to verify the registry trust anchor before syncing remote plugins.",
            production: "Production guidance",
            productionNote:
              "For production, create a dedicated registry consumer and avoid relying on the local development default app key.",
          },
          labels: {
            baseUrl: "Base URL",
            appId: "App ID",
            appKey: "App Key",
            trustKeyId: "Trust Key ID",
            trustPublicKey: "Trust Public Key",
            licensePublicKey: "License Public Key",
            activeKeyId: "Active signing key",
            activeKeyValidity: "Signing validity",
            consumerHint: "Consumer authentication",
            sourceHint: "Remote source setup",
            localDefault: "Local development default",
            optional: "Optional",
            productionHint:
              "Keep App ID / App Key / Trust Public Key in sync with the main-site registry source configuration page.",
            noLicenseKey:
              "No dedicated license public key is published separately right now. Leave this empty unless a future dedicated license verification key is introduced.",
          },
        }
      : {
          eyebrow: "Registry 接入",
          title: "Registry 接入信息",
          subtitle:
            "当主站需要把当前插件市场配置为远程插件商店源时，请直接使用这里展示的参数。本地开发默认值会明确展示；生产环境应从当前信任锚和消费端配置中复制。",
          sections: {
            source: "远程商店源最小参数",
            sourceNote:
              "这是主站在新增远程插件商店源时真正需要填写的字段。",
            trust: "信任与签名材料",
            trustNote:
              "如果希望主站在同步插件前校验当前 Registry 信任锚，请把活跃签名 key 作为信任公钥填写到主站。",
            production: "生产环境建议",
            productionNote:
              "生产环境请为主站创建专用 Registry consumer，不要继续依赖本地开发默认 App Key。",
          },
          labels: {
            baseUrl: "Base URL",
            appId: "App ID",
            appKey: "App Key",
            trustKeyId: "信任 Key ID",
            trustPublicKey: "信任公钥",
            licensePublicKey: "许可证公钥",
            activeKeyId: "当前活跃签名 key",
            activeKeyValidity: "签名有效期",
            consumerHint: "消费端鉴权",
            sourceHint: "远程商店源配置",
            localDefault: "本地开发默认值",
            optional: "可选",
            productionHint:
              "请确保主站远程插件商店源页面中的 App ID / App Key / 信任公钥与这里保持一致。",
            noLicenseKey:
              "当前没有单独发布一把专用许可证公钥。除非未来引入独立许可证验签 key，否则这里可以保持留空。",
          },
        };

  return (
    <section className="admin-shell">
      <div className="container admin-page">
        <div className="governance-hero">
          <div className="governance-hero-head">
            <div className="admin-header-copy">
              <p className="text-eyebrow">{content.eyebrow}</p>
              <h1 className="admin-title">{content.title}</h1>
              <p className="admin-subtitle">{content.subtitle}</p>
            </div>
          </div>

          <div className="governance-strip">
            <div className="governance-metric">
              <span className="governance-metric-label">{content.labels.baseUrl}</span>
              <span className="governance-metric-value">{getRegistryBaseUrl()}</span>
              <span className="governance-metric-note">{content.labels.sourceHint}</span>
            </div>
            <div className="governance-metric">
              <span className="governance-metric-label">{content.labels.appId}</span>
              <span className="governance-metric-value">{getDefaultConsumerAppId()}</span>
              <span className="governance-metric-note">{content.labels.localDefault}</span>
            </div>
            <div className="governance-metric">
              <span className="governance-metric-label">{content.labels.activeKeyId}</span>
              <span className="governance-metric-value">{activeTrustAnchor.keyId}</span>
              <span className="governance-metric-note">{content.labels.consumerHint}</span>
            </div>
          </div>
        </div>

        <div className="detail-grid">
          <section className="detail-section">
            <div className="detail-surface">
              <div className="detail-surface-head">
                <h2 className="detail-surface-title">{content.sections.source}</h2>
                <p className="detail-surface-note">{content.sections.sourceNote}</p>
              </div>

              <div className="detail-kpi-grid">
                <div className="risk-kpi">
                  <p className="risk-kpi-label">{content.labels.baseUrl}</p>
                  <p className="risk-kpi-value" style={{ fontSize: 14 }}>{getRegistryBaseUrl()}</p>
                </div>
                <div className="risk-kpi">
                  <p className="risk-kpi-label">{content.labels.appId}</p>
                  <p className="risk-kpi-value">{getDefaultConsumerAppId()}</p>
                </div>
                <div className="risk-kpi">
                  <p className="risk-kpi-label">{content.labels.appKey}</p>
                  <p className="risk-kpi-value" style={{ fontSize: 14 }}>{getDefaultConsumerAppKey()}</p>
                </div>
              </div>

              <div className="detail-surface-head">
                <h3 className="detail-surface-title" style={{ fontSize: 16 }}>{content.labels.baseUrl}</h3>
                <div className="detail-code-block">{getRegistryBaseUrl()}</div>
              </div>
              <div className="detail-surface-head">
                <h3 className="detail-surface-title" style={{ fontSize: 16 }}>{content.labels.appId}</h3>
                <div className="detail-code-block">{getDefaultConsumerAppId()}</div>
              </div>
              <div className="detail-surface-head">
                <h3 className="detail-surface-title" style={{ fontSize: 16 }}>{content.labels.appKey}</h3>
                <div className="detail-code-block">{getDefaultConsumerAppKey()}</div>
              </div>
            </div>

            <div className="detail-surface">
              <div className="detail-surface-head">
                <h2 className="detail-surface-title">{content.sections.trust}</h2>
                <p className="detail-surface-note">{content.sections.trustNote}</p>
              </div>

              <div className="detail-kpi-grid">
                <div className="risk-kpi">
                  <p className="risk-kpi-label">{content.labels.activeKeyId}</p>
                  <p className="risk-kpi-value" style={{ fontSize: 14 }}>{activeTrustAnchor.keyId}</p>
                </div>
                <div className="risk-kpi">
                  <p className="risk-kpi-label">{content.labels.activeKeyValidity}</p>
                  <p className="risk-kpi-value" style={{ fontSize: 14 }}>
                    {activeTrustAnchor.notBefore.toISOString()} → {activeTrustAnchor.notAfter.toISOString()}
                  </p>
                </div>
                <div className="risk-kpi">
                  <p className="risk-kpi-label">{content.labels.licensePublicKey}</p>
                  <p className="risk-kpi-value">{content.labels.optional}</p>
                </div>
              </div>

              <div className="detail-surface-head">
                <h3 className="detail-surface-title" style={{ fontSize: 16 }}>{content.labels.trustKeyId}</h3>
                <div className="detail-code-block">{activeTrustAnchor.keyId}</div>
              </div>
              <div className="detail-surface-head">
                <h3 className="detail-surface-title" style={{ fontSize: 16 }}>{content.labels.trustPublicKey}</h3>
                <div className="detail-code-block">{activeTrustAnchor.publicKey}</div>
              </div>
              <div className="detail-surface-head">
                <h3 className="detail-surface-title" style={{ fontSize: 16 }}>{content.labels.licensePublicKey}</h3>
                <div className="detail-code-block">{content.labels.noLicenseKey}</div>
              </div>
            </div>
          </section>

          <aside className="detail-section sticky-side">
            <div className="detail-surface">
              <div className="detail-surface-head">
                <h2 className="detail-surface-title">{content.sections.production}</h2>
                <p className="detail-surface-note">{content.sections.productionNote}</p>
              </div>

              <div className="activity-list">
                <div className="activity-item">
                  <p className="activity-item-title">{content.labels.sourceHint}</p>
                  <p className="activity-item-note">{content.labels.productionHint}</p>
                </div>
                <div className="activity-item activity-item-warning">
                  <p className="activity-item-title">{content.labels.appKey}</p>
                  <p className="activity-item-note">
                    {locale === "en"
                      ? "The displayed app key is the local development default. Replace it with a dedicated production consumer key before going live."
                      : "这里展示的是本地开发默认 App Key。正式上线前请替换成独立的生产 consumer 密钥。"}
                  </p>
                </div>
                <div className="activity-item activity-item-positive">
                  <p className="activity-item-title">{content.labels.trustPublicKey}</p>
                  <p className="activity-item-note">
                    {locale === "en"
                      ? "If configured on the main site, remote sync will verify that the registry current signing key matches this trust anchor before importing plugins."
                      : "如果主站填入了这里的信任公钥，远程同步前会先核验当前 Registry 活跃签名 key 是否与该信任锚一致。"}
                  </p>
                </div>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </section>
  );
}
