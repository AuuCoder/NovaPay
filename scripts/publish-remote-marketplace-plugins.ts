import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { build } from "esbuild";
import { pickByLocale } from "@/lib/i18n";
import { alipayPagePlugin } from "@/lib/payments/plugins/alipay-page";
import {
  usdtBasePlugin,
  usdtBscPlugin,
  usdtSolPlugin,
} from "@/lib/payments/plugins/usdt-onchain";
import { wxpayNativePlugin } from "@/lib/payments/plugins/wxpay-native";
import type { PaymentPluginDefinition } from "@/lib/payments/plugins/types";

interface PublishablePluginConfig {
  plugin: PaymentPluginDefinition;
  modulePath: string;
  exportName: string;
  pricingMode: "FREE" | "PAID";
  pricingPlanKind?:
    | "PER_INSTANCE_ONE_TIME"
    | "PER_MERCHANT_SUBSCRIPTION"
    | "PER_USAGE"
    | null;
  priceAmountCents?: number | null;
  priceCurrency?: string | null;
  priceLabel?: string | null;
  purchaseUrl?: string | null;
  customRuntimeSource?: string;
}

const ROOT = process.cwd();
const REGISTRY_BASE_URL = process.env.REGISTRY_BASE_URL?.trim() || "http://localhost:3100";
const OUTPUT_DIR = path.join(ROOT, "artifacts", "remote-plugin-bundles");
const TEMP_BUILD_ROOT = path.join(ROOT, ".tmp");
const VERSION_OVERRIDE = process.env.REMOTE_PLUGIN_VERSION_OVERRIDE?.trim() || null;

const publishablePlugins: PublishablePluginConfig[] = [
  {
    plugin: alipayPagePlugin,
    modulePath: path.join(ROOT, "lib", "payments", "plugins", "alipay-page.ts"),
    exportName: "alipayPagePlugin",
    pricingMode: "PAID",
    pricingPlanKind: "PER_INSTANCE_ONE_TIME",
    priceAmountCents: 100,
    priceCurrency: "CNY",
    priceLabel: "CNY 1.00 / instance",
  },
  {
    plugin: wxpayNativePlugin,
    modulePath: path.join(ROOT, "lib", "payments", "plugins", "wxpay-native.ts"),
    exportName: "wxpayNativePlugin",
    pricingMode: "FREE",
  },
  {
    plugin: usdtBscPlugin,
    modulePath: path.join(ROOT, "lib", "payments", "plugins", "usdt-onchain.ts"),
    exportName: "usdtBscPlugin",
    pricingMode: "FREE",
    customRuntimeSource: createUsdtRuntimeSource(usdtBscPlugin, "BSC"),
  },
  {
    plugin: usdtBasePlugin,
    modulePath: path.join(ROOT, "lib", "payments", "plugins", "usdt-onchain.ts"),
    exportName: "usdtBasePlugin",
    pricingMode: "FREE",
    customRuntimeSource: createUsdtRuntimeSource(usdtBasePlugin, "Base"),
  },
  {
    plugin: usdtSolPlugin,
    modulePath: path.join(ROOT, "lib", "payments", "plugins", "usdt-onchain.ts"),
    exportName: "usdtSolPlugin",
    pricingMode: "FREE",
    customRuntimeSource: createUsdtRuntimeSource(usdtSolPlugin, "Solana"),
  },
];

function toRelativeImport(fromDir: string, targetPath: string) {
  const relative = path.relative(fromDir, targetPath).replace(/\\/g, "/");
  return relative.startsWith(".") ? relative : `./${relative}`;
}

function buildManifest(plugin: PaymentPluginDefinition) {
  const summary = plugin.provider.getSummary();
  const requiredChecks: Array<"create_payment"> = ["create_payment"];
  const expectedMode = summary.capabilities.includes("page_redirect")
    ? ["redirect"]
    : summary.capabilities.includes("native_qr")
      ? ["qr_code"]
      : undefined;
  return {
    manifestVersion: 1,
    slug: plugin.marketplace.slug,
    kind: "PAYMENT_CHANNEL" as const,
    channelCode: plugin.channelCode,
    providerKey: plugin.providerKey,
    packageName: plugin.marketplace.packageName,
    displayName: pickByLocale("en", plugin.adminOption.title),
    vendor: plugin.marketplace.vendor,
    description: pickByLocale("en", plugin.marketplace.description),
    version: VERSION_OVERRIDE ?? plugin.marketplace.version,
    capabilities: plugin.provider.getSummary().capabilities,
    category: plugin.marketplace.category,
    summary: plugin.marketplace.summary,
    detail: plugin.marketplace.description,
    supportsCallbackRoute: Boolean(plugin.callbacks),
    requiresMerchantProfileCompletion:
      plugin.merchantTemplate.requiresMerchantProfileCompletion,
    runtimeEntrypoint: "./runtime.js",
    verificationProfile: {
      version: 1,
      pluginType: "PAYMENT_CHANNEL",
      executionMode: "AUTO_ONLY",
      requiredConfigKeys: plugin.merchantTemplate.fields
        .filter((field) => field.required)
        .map((field) => field.key),
      requiredChecks,
      expectedCreatePayment: {
        status: ["requires_action", "processing"],
        mode: expectedMode,
        checkoutUrl: "required",
      },
    },
  };
}

function createUsdtRuntimeSource(
  plugin: PaymentPluginDefinition,
  networkLabel: string,
) {
  const summary = plugin.provider.getSummary();

  return `
const CHAIN_CODE = ${JSON.stringify(plugin.channelCode)};
const NETWORK_LABEL = ${JSON.stringify(networkLabel)};
const DISPLAY_NAME = ${JSON.stringify(summary.displayName)};
const DESCRIPTION = ${JSON.stringify(summary.description)};
const CAPABILITIES = ${JSON.stringify(summary.capabilities)};
const DEFAULT_FIXED_RATE = 7.2;
const DEFAULT_MIN_RATE = 6.0;
const DEFAULT_MAX_RATE = 8.5;
const DEFAULT_QUOTE_TTL_SECONDS = 900;
const DEFAULT_SPREAD_BPS = 150;
const DEFAULT_REQUEST_TIMEOUT_MS = 8000;

function isSolanaChannel(channelCode) {
  return String(channelCode || "").trim() === "usdt.sol";
}

function isEvmChannel(channelCode) {
  const normalized = String(channelCode || "").trim();
  return normalized === "usdt.bsc" || normalized === "usdt.base";
}

function normalizeRawAddress(value) {
  return String(value ?? "").trim();
}

function normalizeEvmAddress(value) {
  const normalized = normalizeRawAddress(value);
  if (!/^0x[a-fA-F0-9]{40}$/.test(normalized)) throw new Error("Invalid EVM wallet address.");
  return normalized.toLowerCase();
}

function normalizeSolanaAddress(value) {
  const normalized = normalizeRawAddress(value);
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(normalized)) throw new Error("Invalid Solana wallet address.");
  return normalized;
}

function normalizeUsdtReceivingAddress(channelCode, value) {
  const normalized = normalizeRawAddress(value);
  if (!normalized) throw new Error("USDT receiving address is required.");
  if (isEvmChannel(channelCode)) return normalizeEvmAddress(normalized);
  if (isSolanaChannel(channelCode)) return normalizeSolanaAddress(normalized);
  return normalized;
}

function getAccountValue(account, keys) {
  if (!account) return undefined;
  for (const key of keys) {
    const value = account.config[key];
    if (value) return value;
  }
  return undefined;
}

function getReceivingAddress(account) {
  const value = getAccountValue(account, ["walletAddress", "address", "receivingAddress"]);
  if (!value) throw new Error("Receiving address is not configured in the merchant channel instance.");
  return value;
}

function getAddressLabel(account) {
  return getAccountValue(account, ["addressLabel", "walletLabel", "remark"]) ?? null;
}

function parsePositiveNumber(value, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : fallback;
}

function parseNonNegativeInteger(value, fallback) {
  const numeric = Number(value);
  return Number.isInteger(numeric) && numeric >= 0 ? numeric : fallback;
}

function assertReasonableRate(rate, minRate, maxRate, source) {
  if (!Number.isFinite(rate) || rate <= 0) throw new Error(\`Invalid USDT/CNY rate from \${source}.\`);
  if (rate < minRate || rate > maxRate) throw new Error(\`USDT/CNY rate from \${source} is out of range: \${rate}.\`);
}

async function fetchJson(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, { cache: "no-store", signal: controller.signal });
    if (!response.ok) throw new Error(\`HTTP \${response.status}\`);
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchCoinGeckoRate() {
  const payload = await fetchJson("https://api.coingecko.com/api/v3/simple/price?ids=tether&vs_currencies=cny&include_last_updated_at=true");
  const rate = Number(payload?.tether?.cny);
  if (!Number.isFinite(rate) || rate <= 0) throw new Error("CoinGecko returned an invalid tether.cny value.");
  return rate;
}

async function fetchCoinPaprikaRate() {
  const payload = await fetchJson("https://api.coinpaprika.com/v1/tickers/usdt-tether?quotes=CNY");
  const rate = Number(payload?.quotes?.CNY?.price);
  if (!Number.isFinite(rate) || rate <= 0) throw new Error("CoinPaprika returned an invalid quotes.CNY.price value.");
  return rate;
}

async function getUsdtCnyQuote() {
  const primarySource = process.env.USDT_RATE_PRIMARY_SOURCE === "coinpaprika" ? "coinpaprika" : "coingecko";
  const secondarySource = process.env.USDT_RATE_SECONDARY_SOURCE === "coingecko" ? "coingecko" : "coinpaprika";
  const fixedRate = parsePositiveNumber(process.env.USDT_RATE_FIXED_CNY, DEFAULT_FIXED_RATE);
  const minRate = parsePositiveNumber(process.env.USDT_RATE_MIN_CNY, DEFAULT_MIN_RATE);
  const maxRate = parsePositiveNumber(process.env.USDT_RATE_MAX_CNY, DEFAULT_MAX_RATE);
  const quoteTtlSeconds = parsePositiveNumber(process.env.USDT_QUOTE_TTL_SECONDS, DEFAULT_QUOTE_TTL_SECONDS);
  const spreadBps = parseNonNegativeInteger(process.env.USDT_QUOTE_SPREAD_BPS, DEFAULT_SPREAD_BPS);
  const quotedAt = new Date();
  const expiresAt = new Date(quotedAt.getTime() + quoteTtlSeconds * 1000);
  for (const source of [...new Set([primarySource, secondarySource])]) {
    try {
      const rate = source === "coinpaprika" ? await fetchCoinPaprikaRate() : await fetchCoinGeckoRate();
      assertReasonableRate(rate, minRate, maxRate, source);
      return { rate, source, quotedAt, expiresAt, spreadBps };
    } catch {
      continue;
    }
  }
  assertReasonableRate(fixedRate, minRate, maxRate, "fallback_fixed");
  return { rate: fixedRate, source: "fallback_fixed", quotedAt, expiresAt, spreadBps };
}

function quoteUsdtAmountFromCny(input) {
  const cnyAmount = Number(input.cnyAmount);
  if (!Number.isFinite(cnyAmount) || cnyAmount <= 0) throw new Error("CNY amount must be a positive number.");
  if (!Number.isFinite(input.rate) || input.rate <= 0) throw new Error("USDT/CNY rate must be a positive number.");
  const rawUsdtAmount = (cnyAmount / input.rate) * (1 + input.spreadBps / 10000);
  return (Math.floor((rawUsdtAmount + Number.EPSILON) * 10000) / 10000).toFixed(4);
}

export const pluginRuntime = {
  provider: {
    getSummary() {
      return {
        code: CHAIN_CODE,
        provider: "crypto",
        displayName: DISPLAY_NAME,
        description: DESCRIPTION,
        configured: false,
        implementationStatus: "ready",
        capabilities: CAPABILITIES,
      };
    },
    isConfigured(account) {
      try {
        return Boolean(normalizeUsdtReceivingAddress(CHAIN_CODE, getAccountValue(account, ["walletAddress", "address", "receivingAddress"])));
      } catch {
        return false;
      }
    },
    async createPayment(input) {
      const receivingAddress = normalizeUsdtReceivingAddress(CHAIN_CODE, getReceivingAddress(input.account));
      const addressLabel = getAddressLabel(input.account);
      const quote = await getUsdtCnyQuote();
      const effectiveExpireAt = input.expireAt && !Number.isNaN(input.expireAt.getTime()) ? input.expireAt : quote.expiresAt;
      const quotedUsdtAmount = quoteUsdtAmountFromCny({ cnyAmount: input.amount, rate: quote.rate, spreadBps: quote.spreadBps });
      return {
        status: "requires_action",
        mode: "qr_code",
        checkoutUrl: receivingAddress,
        providerStatus: "AWAITING_TRANSFER",
        providerPayload: {
          chainCode: CHAIN_CODE,
          chainType: isSolanaChannel(CHAIN_CODE) ? "solana" : "evm",
          networkLabel: NETWORK_LABEL,
          displayName: DISPLAY_NAME,
          tokenSymbol: "USDT",
          receivingAddress,
          addressLabel,
          qrPayload: receivingAddress,
          baseQuotedUsdtAmount: quotedUsdtAmount,
          quotedUsdtAmount,
          tailOffsetUsdt: "0.0000",
          tailSlot: 0,
          tailStepUsdt: "0.0000",
          tailMaxUsdt: "0.0000",
          quotedCnyAmount: input.amount,
          quoteRate: quote.rate.toFixed(6),
          quoteSource: quote.source,
          quoteSpreadBps: quote.spreadBps,
          quotedAt: quote.quotedAt.toISOString(),
          quoteExpiresAt: effectiveExpireAt.toISOString(),
          merchantName: input.merchant.name,
          orderSubject: input.subject,
          qrHint: \`Scan or copy the address, then transfer the exact USDT amount on \${NETWORK_LABEL}.\`,
        },
      };
    },
    async closePayment(input) {
      return {
        orderId: input.orderId,
        gatewayOrderId: input.gatewayOrderId ?? null,
        providerStatus: "CLOSED",
        amount: input.amount,
        paidAt: null,
        succeeds: false,
        rawPayload: {},
      };
    },
  },
  adminOption: ${JSON.stringify(plugin.adminOption, null, 2)},
  merchantTemplate: ${JSON.stringify(plugin.merchantTemplate, null, 2)},
};
`.trim();
}

async function bundleRuntime(config: PublishablePluginConfig, tempDir: string) {
  const entryPath = path.join(tempDir, `${config.plugin.marketplace.slug}.entry.ts`);
  const source = config.customRuntimeSource
    ? config.customRuntimeSource
    : (() => {
        const importPath = toRelativeImport(tempDir, config.modulePath);
        return [
          `import { ${config.exportName} } from ${JSON.stringify(importPath)};`,
          `export const pluginRuntime = {`,
          `  provider: ${config.exportName}.provider,`,
          `  adminOption: ${config.exportName}.adminOption,`,
          `  merchantTemplate: ${config.exportName}.merchantTemplate,`,
          `  callbacks: ${config.exportName}.callbacks,`,
          `};`,
        ].join("\n");
      })();

  await writeFile(entryPath, source, "utf8");

  const result = await build({
    entryPoints: [entryPath],
    bundle: true,
    format: "esm",
    platform: "node",
    target: "node20",
    write: false,
    tsconfig: path.join(ROOT, "tsconfig.json"),
    sourcemap: false,
    minify: false,
  });

  const output = result.outputFiles[0];
  if (!output) {
    throw new Error(`Failed to build runtime bundle for ${config.plugin.marketplace.slug}.`);
  }

  return output.text;
}

async function uploadBundle(config: PublishablePluginConfig, rawBundle: string) {
  const formData = new FormData();
  formData.append(
    "package",
    new Blob([rawBundle], { type: "application/json" }),
    `${config.plugin.marketplace.slug}.json`,
  );
  formData.append("pricingMode", config.pricingMode);
  if (config.pricingMode === "PAID") {
    if (config.pricingPlanKind) {
      formData.append("pricingPlanKind", config.pricingPlanKind);
    }
    if (typeof config.priceAmountCents === "number") {
      formData.append("priceAmount", (config.priceAmountCents / 100).toFixed(2));
    }
    if (config.priceCurrency) {
      formData.append("priceCurrency", config.priceCurrency);
    }
  }
  if (config.priceLabel) {
    formData.append("priceLabel", config.priceLabel);
  }
  if (config.purchaseUrl) {
    formData.append("purchaseUrl", config.purchaseUrl);
  }

  const response = await fetch(
    `${REGISTRY_BASE_URL}/api/developer/plugins/${config.plugin.marketplace.slug}/versions`,
    {
      method: "POST",
      body: formData,
    },
  );

  const payload = (await response.json()) as Record<string, unknown>;
  if (!response.ok) {
    throw new Error(
      `Upload failed for ${config.plugin.marketplace.slug}: ${String(payload.message ?? payload.error ?? response.status)}`,
    );
  }

  return payload;
}

async function main() {
  await mkdir(OUTPUT_DIR, { recursive: true });
  await mkdir(TEMP_BUILD_ROOT, { recursive: true });
  const tempDir = await mkdtemp(path.join(TEMP_BUILD_ROOT, "novapay-remote-plugin-build-"));

  try {
    const results: Array<Record<string, unknown>> = [];

    for (const config of publishablePlugins) {
      const runtimeJs = await bundleRuntime(config, tempDir);
      const manifest = buildManifest(config.plugin);
      const bundle = {
        manifest,
        files: [
          {
            path: "runtime.js",
            content: runtimeJs,
          },
        ],
        registryMeta: {
          pricingMode: config.pricingMode,
          pricingPlanKind: config.pricingPlanKind ?? null,
          priceAmountCents: config.priceAmountCents ?? null,
          priceCurrency: config.priceCurrency ?? null,
          priceLabel: config.priceLabel ?? null,
          purchaseUrl: config.purchaseUrl ?? null,
        },
      };
      const rawBundle = JSON.stringify(bundle, null, 2);

      await writeFile(
        path.join(OUTPUT_DIR, `${config.plugin.marketplace.slug}.json`),
        rawBundle,
        "utf8",
      );

      const uploadResult = await uploadBundle(config, rawBundle);
      results.push({
        slug: config.plugin.marketplace.slug,
        channelCode: config.plugin.channelCode,
        version: config.plugin.marketplace.version,
        uploadResult,
      });
    }

    console.log(JSON.stringify({ uploaded: results }, null, 2));
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

await main();
