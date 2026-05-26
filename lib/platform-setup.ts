import { getPlatformBootstrapStatus } from "@/lib/platform-bootstrap";
import { getSystemConfig } from "@/lib/system-config";

export interface MainSiteSetupStatus {
  bootstrap: Awaited<ReturnType<typeof getPlatformBootstrapStatus>>;
  systemConfig: {
    publicBaseUrlConfigured: boolean;
    dataEncryptionKeyConfigured: boolean;
    instanceIdConfigured: boolean;
    callbackTimeoutConfigured: boolean;
    callbackRetryIntervalConfigured: boolean;
    callbackMaxAttemptsConfigured: boolean;
  };
  setupComplete: boolean;
}

function hasText(value: string | null | undefined) {
  return Boolean(value?.trim());
}

export async function getMainSiteSetupStatus(): Promise<MainSiteSetupStatus> {
  const bootstrap = await getPlatformBootstrapStatus();
  const [
    instanceId,
    callbackTimeoutMs,
    callbackRetryIntervalSeconds,
    callbackMaxAttempts,
  ] = await Promise.all([
    getSystemConfig("INSTANCE_ID"),
    getSystemConfig("CALLBACK_TIMEOUT_MS"),
    getSystemConfig("CALLBACK_RETRY_INTERVAL_SECONDS"),
    getSystemConfig("CALLBACK_MAX_ATTEMPTS"),
  ]);

  const publicBaseUrlConfigured = hasText(process.env.NOVAPAY_PUBLIC_BASE_URL);
  const dataEncryptionKeyConfigured = hasText(process.env.NOVAPAY_DATA_ENCRYPTION_KEY);

  const systemConfig = {
    publicBaseUrlConfigured,
    dataEncryptionKeyConfigured,
    instanceIdConfigured: hasText(instanceId),
    callbackTimeoutConfigured: hasText(callbackTimeoutMs),
    callbackRetryIntervalConfigured: hasText(callbackRetryIntervalSeconds),
    callbackMaxAttemptsConfigured: hasText(callbackMaxAttempts),
  };

  return {
    bootstrap,
    systemConfig,
    setupComplete:
      bootstrap.setupComplete &&
      systemConfig.publicBaseUrlConfigured &&
      systemConfig.dataEncryptionKeyConfigured &&
      systemConfig.instanceIdConfigured &&
      systemConfig.callbackTimeoutConfigured &&
      systemConfig.callbackRetryIntervalConfigured &&
      systemConfig.callbackMaxAttemptsConfigured,
  };
}
