import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import type { MarketplacePluginSource } from "@/generated/prisma/client";
import type { PaymentCapability } from "@/lib/payments/types";
import { isRecord } from "@/lib/payments/utils";

const DEFAULT_LOCAL_PLUGIN_DIR = "local-plugins";
const LOCAL_PLUGIN_SOURCE: MarketplacePluginSource = "LOCAL_PACKAGE";
const ALLOWED_KINDS = new Set(["PAYMENT_CHANNEL"]);
const ALLOWED_CAPABILITIES = new Set<PaymentCapability>([
  "page_redirect",
  "native_qr",
  "notify_callback",
  "return_url",
  "quote_lock",
  "rsa2_signature",
  "order_query",
  "order_close",
  "refund",
  "refund_query",
]);

interface LocalizedText {
  zh: string;
  en: string;
}

export interface LocalPluginPackageManifest {
  slug: string;
  kind: "PAYMENT_CHANNEL";
  source: MarketplacePluginSource;
  channelCode: string;
  providerKey: string;
  packageName: string;
  displayName: string;
  vendor: string;
  description: string;
  version: string;
  capabilities: PaymentCapability[];
  category: LocalizedText;
  summary: LocalizedText;
  detail: LocalizedText;
  supportsCallbackRoute: boolean;
  requiresMerchantProfileCompletion: boolean;
  manifestVersion: number;
  localPath: string;
  runtimeEntrypoint: string | null;
  runtimePath: string | null;
  runnable: boolean;
}

function getLocalPluginRoot() {
  const configured = process.env.NOVAPAY_LOCAL_PLUGIN_DIR?.trim();

  if (!configured) {
    return path.join(process.cwd(), DEFAULT_LOCAL_PLUGIN_DIR);
  }

  return path.isAbsolute(configured)
    ? configured
    : path.join(process.cwd(), configured);
}

function asNonEmptyString(value: unknown, label: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${label} must be a non-empty string.`);
  }

  return value.trim();
}

function asBoolean(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

function asOptionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asLocalizedText(value: unknown, label: string): LocalizedText {
  if (!isRecord(value)) {
    throw new Error(`${label} must contain zh and en fields.`);
  }

  return {
    zh: asNonEmptyString(value.zh, `${label}.zh`),
    en: asNonEmptyString(value.en, `${label}.en`),
  };
}

function asCapabilities(value: unknown) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error("capabilities must be a non-empty array.");
  }

  const capabilities = value.map((item) =>
    asNonEmptyString(item, "capability"),
  ) as PaymentCapability[];

  for (const capability of capabilities) {
    if (!ALLOWED_CAPABILITIES.has(capability)) {
      throw new Error(`Unsupported capability: ${capability}`);
    }
  }

  return capabilities;
}

export function parsePluginPackageManifest(
  raw: unknown,
  manifestPath: string,
  source: MarketplacePluginSource = LOCAL_PLUGIN_SOURCE,
): LocalPluginPackageManifest {
  if (!isRecord(raw)) {
    throw new Error("Manifest root must be an object.");
  }

  const kind = asNonEmptyString(raw.kind, "kind");

  if (!ALLOWED_KINDS.has(kind)) {
    throw new Error(`Unsupported kind: ${kind}`);
  }

  const providerKey = asNonEmptyString(raw.providerKey, "providerKey");

  const manifestVersion =
    typeof raw.manifestVersion === "number" && Number.isInteger(raw.manifestVersion)
      ? raw.manifestVersion
      : 1;
  const runtimeEntrypoint = asOptionalString(raw.runtimeEntrypoint);
  const manifestDir = path.dirname(manifestPath);
  const runtimePath = runtimeEntrypoint
    ? path.resolve(manifestDir, runtimeEntrypoint)
    : null;

  // The runtime entrypoint is later imported and executed, so it must stay
  // inside the plugin package directory. Reject absolute paths or `..` escapes.
  if (runtimePath) {
    const resolvedDir = path.resolve(manifestDir);
    if (runtimePath !== resolvedDir && !runtimePath.startsWith(resolvedDir + path.sep)) {
      throw new Error(
        `runtimeEntrypoint must stay within the plugin package directory: ${runtimeEntrypoint}`,
      );
    }
  }

  return {
    slug: asNonEmptyString(raw.slug, "slug"),
    kind: "PAYMENT_CHANNEL",
    source,
    channelCode: asNonEmptyString(raw.channelCode, "channelCode"),
    providerKey,
    packageName: asNonEmptyString(raw.packageName, "packageName"),
    displayName: asNonEmptyString(raw.displayName, "displayName"),
    vendor: asNonEmptyString(raw.vendor, "vendor"),
    description: asNonEmptyString(raw.description, "description"),
    version: asNonEmptyString(raw.version, "version"),
    capabilities: asCapabilities(raw.capabilities),
    category: asLocalizedText(raw.category, "category"),
    summary: asLocalizedText(raw.summary, "summary"),
    detail: asLocalizedText(raw.detail, "detail"),
    supportsCallbackRoute: asBoolean(raw.supportsCallbackRoute, false),
    requiresMerchantProfileCompletion: asBoolean(
      raw.requiresMerchantProfileCompletion,
      false,
    ),
    manifestVersion,
    localPath: manifestPath,
    runtimeEntrypoint,
    runtimePath,
    runnable: false,
  };
}

export async function readPluginPackageManifestFile(
  manifestPath: string,
  source: MarketplacePluginSource = LOCAL_PLUGIN_SOURCE,
) {
  const rawText = await readFile(manifestPath, "utf8");
  const rawManifest = JSON.parse(rawText) as unknown;
  return parsePluginPackageManifest(rawManifest, manifestPath, source);
}

export async function discoverLocalPluginPackageManifests() {
  const root = getLocalPluginRoot();

  let entries;

  try {
    entries = await readdir(root, {
      withFileTypes: true,
    });
  } catch {
    return [];
  }

  const manifests = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map(async (entry) => {
        const manifestPath = path.join(root, entry.name, "plugin.json");

        try {
          return await readPluginPackageManifestFile(manifestPath);
        } catch (error) {
          if (
            error &&
            typeof error === "object" &&
            "code" in error &&
            error.code === "ENOENT"
          ) {
            return null;
          }

          throw new Error(
            `[local-plugin] ${entry.name}: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }
      }),
  );

  const filteredManifests = manifests.filter(
    (manifest): manifest is LocalPluginPackageManifest => Boolean(manifest),
  );

  const seenSlugs = new Set<string>();
  const seenChannelCodes = new Set<string>();

  for (const manifest of filteredManifests) {
    if (seenSlugs.has(manifest.slug)) {
      throw new Error(`[local-plugin] duplicate slug detected: ${manifest.slug}`);
    }

    if (seenChannelCodes.has(manifest.channelCode)) {
      throw new Error(
        `[local-plugin] duplicate channelCode detected: ${manifest.channelCode}`,
      );
    }

    seenSlugs.add(manifest.slug);
    seenChannelCodes.add(manifest.channelCode);
  }

  return filteredManifests;
}
