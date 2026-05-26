import { getNovaPayMainAppUrl } from "./auth/novapay-admin-sso";
import { getSettlementSettings } from "./settlement/settings";

export interface RegistrySetupStatus {
  environment: {
    mainAppReachable: boolean;
    mainAppUrl: string;
    registryAppUrlConfigured: boolean;
  };
  mainApp: {
    adminConfigured: boolean;
    bridgeMerchantReady: boolean;
    alipayConfigured: boolean;
    wxpayConfigured: boolean;
    setupComplete: boolean;
  };
  registryBridgeConfigured: boolean;
  setupComplete: boolean;
}

interface MainAppBootstrapStatusResponse {
  adminConfigured?: boolean;
  bridgeMerchantReady?: boolean;
  alipayConfigured?: boolean;
  wxpayConfigured?: boolean;
  setupComplete?: boolean;
}

export async function getRegistrySetupStatus(): Promise<RegistrySetupStatus> {
  const mainAppUrl = getNovaPayMainAppUrl();
  const registryAppUrlConfigured = Boolean(process.env.REGISTRY_APP_URL?.trim());
  const settlement = await getSettlementSettings();

  let mainAppReachable = false;
  let mainApp: RegistrySetupStatus["mainApp"] = {
    adminConfigured: false,
    bridgeMerchantReady: false,
    alipayConfigured: false,
    wxpayConfigured: false,
    setupComplete: false,
  };

  const response = await fetch(`${mainAppUrl}/api/internal/bootstrap/status`, {
    method: "GET",
    cache: "no-store",
  }).catch(() => null);

  if (response?.ok) {
    mainAppReachable = true;
    const payload = (await response.json()) as MainAppBootstrapStatusResponse;
    mainApp = {
      adminConfigured: Boolean(payload.adminConfigured),
      bridgeMerchantReady: Boolean(payload.bridgeMerchantReady),
      alipayConfigured: Boolean(payload.alipayConfigured),
      wxpayConfigured: Boolean(payload.wxpayConfigured),
      setupComplete: Boolean(payload.setupComplete),
    };
  }

  const registryBridgeConfigured = Boolean(
    settlement.registryNovaPayMerchantCode?.trim() &&
      settlement.registryNovaPayApiKeyId?.trim() &&
      settlement.registryNovaPayApiKeySecret?.trim() &&
      settlement.registryNovaPayNotifySecret?.trim() &&
      settlement.registryNovaPayChannelCode?.trim(),
  );

  return {
    environment: {
      mainAppReachable,
      mainAppUrl,
      registryAppUrlConfigured,
    },
    mainApp,
    registryBridgeConfigured,
    setupComplete: mainApp.setupComplete && registryBridgeConfigured,
  };
}
