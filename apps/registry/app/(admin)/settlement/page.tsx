import { getCurrentLocale } from "@/lib/i18n-server";
import { requireRegistryAdminSession } from "../../../lib/auth/session";
import { getSettlementSettingsForAdminView } from "../../../lib/settlement/settings";
import { SettlementSettingsForm } from "./settings-form";
import { getPrismaClient } from "../../../lib/runtime/prisma-client";

export default async function AdminSettlementPage() {
  await requireRegistryAdminSession();
  const locale = await getCurrentLocale();
  const settings = await getSettlementSettingsForAdminView();
  const prisma = (await getPrismaClient()) as {
    merchant?: {
      findUnique(args: unknown): Promise<{
        id: string;
        code: string;
        status: string;
        callbackEnabled: boolean;
      } | null>;
    };
    merchantApiCredential?: {
      findFirst(args: unknown): Promise<{ id: string; keyId: string } | null>;
    };
    merchantChannelAccount?: {
      findFirst(args: unknown): Promise<{ id: string; displayName: string; channelCode: string } | null>;
    };
  } | null;
  const merchant = settings.registryNovaPayMerchantCode
    ? await prisma?.merchant?.findUnique({
        where: { code: settings.registryNovaPayMerchantCode },
        select: { id: true, code: true, status: true, callbackEnabled: true },
      })
    : null;
  const credential =
    merchant && settings.registryNovaPayApiKeyId
      ? await prisma?.merchantApiCredential?.findFirst({
          where: {
            merchantId: merchant.id,
            keyId: settings.registryNovaPayApiKeyId,
            enabled: true,
          },
          select: { id: true, keyId: true },
        })
      : null;
  const channel =
    merchant && settings.registryNovaPayChannelCode
      ? await prisma?.merchantChannelAccount?.findFirst({
          where: {
            merchantId: merchant.id,
            channelCode: settings.registryNovaPayChannelCode,
            enabled: true,
          },
          select: { id: true, displayName: true, channelCode: true },
        })
      : null;
  const bridgeReady = Boolean(
    merchant &&
      merchant.status === "APPROVED" &&
      merchant.callbackEnabled &&
      credential &&
      channel &&
      settings.registryNovaPayNotifySecretMasked,
  );

  return (
    <section className="admin-shell">
      <div className="container admin-page">
        <div className="admin-header">
          <div className="admin-header-copy">
            <p className="text-eyebrow">{locale === "en" ? "Settlement Policy" : "结算策略"}</p>
            <h1 className="admin-title">{locale === "en" ? "Revenue share configuration" : "分成配置"}</h1>
            <p className="admin-subtitle">
              {locale === "en"
                ? "Control the default marketplace revenue split and payout hold period used when plugin sales are recognized and settled."
                : "统一配置插件市场默认分成比例和打款冻结周期，决定平台代收后作者收益的默认结算规则。"}
            </p>
          </div>
        </div>

        <div className="grid-3">
          <div className="stat-card feature">
            <p className="stat-label">{locale === "en" ? "Developer share" : "开发者分成"}</p>
            <p className="stat-value">{settings.developerRevenueSharePercent}%</p>
          </div>
          <div className="stat-card">
            <p className="stat-label">{locale === "en" ? "Platform share" : "平台分成"}</p>
            <p className="stat-value">{settings.platformRevenueSharePercent}%</p>
          </div>
          <div className="stat-card">
            <p className="stat-label">{locale === "en" ? "Payout hold" : "打款冻结期"}</p>
            <p className="stat-value">{settings.payoutHoldDays}d</p>
          </div>
        </div>

        <div className="enterprise-panel">
          <div className="detail-surface-head">
            <h2 className="detail-surface-title">
              {locale === "en" ? "Registry payment bridge health" : "Registry 支付桥接状态"}
            </h2>
            <p className="detail-surface-note">
              {locale === "en"
                ? "Check whether the bridge merchant, API credential, callback secret, and channel account are ready for real paid plugin checkout."
                : "检查桥接商户、API 凭证、回调签名密钥和支付通道是否已经满足真实收费插件购买联调条件。"}
            </p>
          </div>
          <div className="detail-kpi-grid">
            <div className="risk-kpi">
              <p className="risk-kpi-label">{locale === "en" ? "Merchant" : "商户"}</p>
              <p className="risk-kpi-value">{merchant?.code ?? "—"}</p>
            </div>
            <div className="risk-kpi">
              <p className="risk-kpi-label">{locale === "en" ? "Credential" : "凭证"}</p>
              <p className="risk-kpi-value">{credential?.keyId ?? "—"}</p>
            </div>
            <div className="risk-kpi">
              <p className="risk-kpi-label">{locale === "en" ? "Channel" : "通道"}</p>
              <p className="risk-kpi-value">{channel?.channelCode ?? "—"}</p>
            </div>
            <div className="risk-kpi">
              <p className="risk-kpi-label">{locale === "en" ? "Bridge ready" : "桥接状态"}</p>
              <p className="risk-kpi-value">
                <span className={bridgeReady ? "badge badge-positive" : "badge badge-warning"}>
                  {bridgeReady
                    ? locale === "en"
                      ? "Ready"
                      : "已就绪"
                    : locale === "en"
                      ? "Pending"
                      : "待完成"}
                </span>
              </p>
            </div>
          </div>
        </div>

        <SettlementSettingsForm
          locale={locale}
          initialSettings={settings}
        />
      </div>
    </section>
  );
}
