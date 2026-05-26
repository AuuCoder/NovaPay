import { getSettlementSettings } from "../settlement/settings";
import { revealStoredSecret } from "../security/secret-box";

export interface RegistryNovaPayBridgeConfig {
  baseUrl: string;
  publicBaseUrl: string;
  merchantCode: string;
  apiKeyId: string;
  apiKeySecret: string;
  notifySecret: string;
  channelCode: string;
  callbackUrl: string;
}

function requireText(value: string | null | undefined, fallbackEnv?: string) {
  const resolved = value?.trim() || process.env[fallbackEnv ?? ""]?.trim();
  if (!resolved) {
    throw new Error(`${fallbackEnv ?? "value"} is required for real NovaPay checkout.`);
  }
  return resolved;
}

function requireEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required for real NovaPay checkout.`);
  }
  return value;
}

function getRegistryAppUrl() {
  return process.env.REGISTRY_APP_URL?.trim() || "http://localhost:3100";
}

export async function getRegistryNovaPayBridgeConfig(): Promise<RegistryNovaPayBridgeConfig> {
  const publicBaseUrl =
    process.env.NOVAPAY_PUBLIC_BASE_URL?.trim() || "http://localhost:3000";
  const baseUrl =
    process.env.REGISTRY_NOVAPAY_BASE_URL?.trim() ||
    process.env.NOVAPAY_INTERNAL_BASE_URL?.trim() ||
    "http://localhost:3000";
  const settings = await getSettlementSettings();

  return {
    baseUrl,
    publicBaseUrl,
    merchantCode: requireText(
      settings.registryNovaPayMerchantCode,
      "REGISTRY_NOVAPAY_MERCHANT_CODE",
    ),
    apiKeyId: requireText(
      settings.registryNovaPayApiKeyId,
      "REGISTRY_NOVAPAY_API_KEY_ID",
    ),
    apiKeySecret: requireText(
      revealStoredSecret(settings.registryNovaPayApiKeySecret),
      "REGISTRY_NOVAPAY_API_KEY_SECRET",
    ),
    notifySecret: requireText(
      revealStoredSecret(settings.registryNovaPayNotifySecret),
      "REGISTRY_NOVAPAY_NOTIFY_SECRET",
    ),
    channelCode:
      settings.registryNovaPayChannelCode?.trim() ||
      process.env.REGISTRY_NOVAPAY_CHANNEL_CODE?.trim() ||
      "alipay.page",
    callbackUrl: new URL("/api/payments/callback/registry", getRegistryAppUrl()).toString(),
  };
}

export async function isRegistryNovaPayBridgeConfigured() {
  const settings = await getSettlementSettings();
  return Boolean(
    (settings.registryNovaPayMerchantCode?.trim() || process.env.REGISTRY_NOVAPAY_MERCHANT_CODE?.trim()) &&
      (settings.registryNovaPayApiKeyId?.trim() || process.env.REGISTRY_NOVAPAY_API_KEY_ID?.trim()) &&
      (settings.registryNovaPayApiKeySecret?.trim() || process.env.REGISTRY_NOVAPAY_API_KEY_SECRET?.trim()) &&
      (settings.registryNovaPayNotifySecret?.trim() || process.env.REGISTRY_NOVAPAY_NOTIFY_SECRET?.trim()),
  );
}
