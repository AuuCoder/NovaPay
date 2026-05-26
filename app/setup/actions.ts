"use server";

import { redirect } from "next/navigation";
import { ensureInstanceId, setSystemConfigs } from "@/lib/system-config";
import { runPlatformBootstrap } from "@/lib/platform-bootstrap";

function getString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function withMessage(path: string, key: "error" | "success", message: string) {
  const url = new URL(path, "http://localhost");
  url.searchParams.set(key, message);
  return `${url.pathname}?${url.searchParams.toString()}`;
}

function parsePositiveInteger(value: string, label: string, fallback: number) {
  if (!value) {
    return fallback;
  }

  const numeric = Number(value);
  if (!Number.isInteger(numeric) || numeric <= 0) {
    throw new Error(`${label} must be a positive integer.`);
  }
  return numeric;
}

export async function completeMainSiteSetupAction(formData: FormData) {
  const enableAlipay = formData.get("enableAlipay") === "on";
  const enableWxpay = formData.get("enableWxpay") === "on";

  try {
    const callbackTimeoutMs = parsePositiveInteger(
      getString(formData, "callbackTimeoutMs"),
      "Callback timeout",
      10000,
    );
    const callbackRetryIntervalSeconds = parsePositiveInteger(
      getString(formData, "callbackRetryIntervalSeconds"),
      "Callback retry interval",
      60,
    );
    const callbackMaxAttempts = parsePositiveInteger(
      getString(formData, "callbackMaxAttempts"),
      "Callback max attempts",
      6,
    );

    await runPlatformBootstrap({
      adminEmail: getString(formData, "adminEmail"),
      adminPassword: getString(formData, "adminPassword"),
      adminName: getString(formData, "adminName"),
      enableAlipay,
      enableWxpay,
      alipay: enableAlipay
        ? {
            appId: getString(formData, "alipayAppId"),
            privateKey: getString(formData, "alipayPrivateKey"),
            publicKey: getString(formData, "alipayPublicKey"),
          }
        : null,
      wxpay: enableWxpay
        ? {
            appId: getString(formData, "wxpayAppId"),
            mchId: getString(formData, "wxpayMchId"),
            mchSerialNo: getString(formData, "wxpayMchSerialNo"),
            privateKey: getString(formData, "wxpayPrivateKey"),
            apiV3Key: getString(formData, "wxpayApiV3Key"),
            platformPublicKey: getString(formData, "wxpayPlatformPublicKey"),
            platformSerial: getString(formData, "wxpayPlatformSerial"),
          }
        : null,
    });

    await setSystemConfigs([
      {
        key: "CALLBACK_TIMEOUT_MS",
        value: String(callbackTimeoutMs),
        group: "callbacks",
        label: "Callback Timeout (ms)",
      },
      {
        key: "CALLBACK_RETRY_INTERVAL_SECONDS",
        value: String(callbackRetryIntervalSeconds),
        group: "callbacks",
        label: "Callback Retry Interval (seconds)",
      },
      {
        key: "CALLBACK_MAX_ATTEMPTS",
        value: String(callbackMaxAttempts),
        group: "callbacks",
        label: "Callback Max Attempts",
      },
    ]);

    await ensureInstanceId();
  } catch (error) {
    redirect(
      withMessage(
        "/setup",
        "error",
        error instanceof Error ? error.message : "Setup failed.",
      ),
    );
  }

  redirect(withMessage("/setup", "success", "setup_completed"));
}
