import { NextResponse, type NextRequest } from "next/server";
import { requireRegistryPluginAuthorSessionRequest } from "../../../../lib/auth/session";

export const runtime = "nodejs";

type TemplatePreset = "alipay" | "wxpay" | "crypto" | "generic";

function normalizeText(value: string | null, fallback: string) {
  const normalized = value?.trim();
  return normalized || fallback;
}

function inferCapabilities(providerKey: string, preset: TemplatePreset) {
  switch (preset) {
    case "alipay":
      return [
        "page_redirect",
        "notify_callback",
        "return_url",
        "rsa2_signature",
        "order_query",
        "order_close",
      ];
    case "crypto":
      return ["native_qr", "return_url", "order_close", "quote_lock"];
    case "generic":
      return ["native_qr", "notify_callback", "order_query", "order_close"];
    case "wxpay":
    default:
      return ["native_qr", "notify_callback", "order_query", "order_close"];
  }
}

function inferExpectedMode(preset: TemplatePreset) {
  return preset === "alipay" ? ["redirect"] : ["qr_code"];
}

function inferRequiredConfigKeys(preset: TemplatePreset) {
  switch (preset) {
    case "alipay":
      return ["appId", "privateKey", "publicKey"];
    case "crypto":
      return ["walletAddress"];
    case "generic":
      return ["merchantId", "apiKey"];
    case "wxpay":
    default:
      return ["appId", "mchId"];
  }
}

function buildRuntimeSource(input: {
  displayName: string;
  channelCode: string;
  providerKey: string;
  description: string;
  capabilities: string[];
}) {
  return `export const pluginRuntime = {
  provider: {
    getSummary() {
      return {
        code: ${JSON.stringify(input.channelCode)},
        provider: ${JSON.stringify(input.providerKey)},
        displayName: ${JSON.stringify(input.displayName)},
        description: ${JSON.stringify(input.description)},
        configured: true,
        implementationStatus: "ready",
        capabilities: ${JSON.stringify(input.capabilities)}
      };
    }
  }
};`;
}

export async function GET(request: NextRequest) {
  const auth = await requireRegistryPluginAuthorSessionRequest(request);
  if (auth.response) {
    return auth.response;
  }

  const { searchParams } = new URL(request.url);
  const slug = normalizeText(searchParams.get("slug"), "acme.wxpay-native-plus");
  const presetRaw = normalizeText(searchParams.get("preset"), "wxpay");
  const preset = (
    presetRaw === "alipay" ||
    presetRaw === "crypto" ||
    presetRaw === "generic" ||
    presetRaw === "wxpay"
      ? presetRaw
      : "wxpay"
  ) as TemplatePreset;
  const providerKey = normalizeText(
    searchParams.get("providerKey"),
    preset === "generic" ? "thirdparty" : preset,
  );
  const channelCode = normalizeText(
    searchParams.get("channelCode"),
    preset === "alipay"
      ? "alipay.page.custom"
      : preset === "crypto"
        ? "usdt.custom"
        : preset === "generic"
          ? "thirdparty.checkout.custom"
        : "wxpay.native.custom",
  );
  const vendor = normalizeText(searchParams.get("vendor"), "Acme Payments");
  const displayName = normalizeText(
    searchParams.get("displayName"),
    preset === "alipay"
      ? "Acme Alipay Web"
      : preset === "crypto"
        ? "Acme USDT On-chain"
        : preset === "generic"
          ? "Acme Third-Party Checkout"
        : "Acme WeChat Native Plus",
  );
  const packageName = normalizeText(
    searchParams.get("packageName"),
    `@${slug.replace(/\./g, "/plugin-")}`.replace("/plugin-", "/plugin-"),
  );
  const description = normalizeText(
    searchParams.get("description"),
    "Third-party payment plugin for NovaPay Registry.",
  );
  const capabilities = inferCapabilities(providerKey, preset);

  const payload = {
    manifest: {
      manifestVersion: 1,
      slug,
      kind: "PAYMENT_CHANNEL",
      channelCode,
      providerKey,
      packageName,
      displayName,
      vendor,
      description,
      version: "1.0.0",
      capabilities,
      category: {
        zh:
          preset === "crypto"
            ? "链上支付"
            : preset === "generic"
              ? "第三方支付"
              : "官方支付",
        en:
          preset === "crypto"
            ? "On-chain Payment"
            : preset === "generic"
              ? "Third-party Payment"
              : "Official Payment",
      },
      summary: {
        zh: "请按你的插件能力修改这里的摘要。",
        en: "Update this summary to match your plugin capability.",
      },
      detail: {
        zh: "请按你的插件真实链路修改这里的详细描述。",
        en: "Update this detail section to describe the real payment flow.",
      },
      supportsCallbackRoute: preset !== "crypto",
      requiresMerchantProfileCompletion: preset !== "crypto",
      runtimeEntrypoint: "./runtime.js",
      verificationProfile: {
        version: 1,
        pluginType: "PAYMENT_CHANNEL",
        executionMode: "AUTO_ONLY",
        requiredConfigKeys: inferRequiredConfigKeys(preset),
        requiredChecks: ["create_payment"],
        expectedCreatePayment: {
          status: ["requires_action", "processing"],
          mode: inferExpectedMode(preset),
          checkoutUrl: "required",
        },
      },
    },
    files: [
      {
        path: "runtime.js",
        content: buildRuntimeSource({
          displayName,
          channelCode,
          providerKey,
          description,
          capabilities,
        }),
      },
    ],
  };

  return new NextResponse(`${JSON.stringify(payload, null, 2)}\n`, {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${slug}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
