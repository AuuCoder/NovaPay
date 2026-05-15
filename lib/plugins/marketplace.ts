import { createHash } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Prisma } from "@/generated/prisma/client";
import type {
  MarketplacePlugin,
  MarketplacePluginKind,
  MarketplacePluginSource,
  PluginPricingMode,
  PluginPackageInstallStatus,
} from "@/generated/prisma/client";
import type { Locale } from "@/lib/i18n";
import { pickByLocale } from "@/lib/i18n";
import {
  discoverLocalPluginPackageManifests,
  type LocalPluginPackageManifest,
} from "@/lib/plugins/local-package-manifests";
import { loadLocalPaymentPluginRuntimeInspection } from "@/lib/plugins/local-package-runtimes";
import { loadPaymentPluginRuntimeInspectionFromManifestPath } from "@/lib/plugins/local-package-runtimes";
import { fetchRemoteRegistrySnapshots } from "@/lib/plugins/remote-registry";
import { getPaymentPlugin, listPaymentPlugins } from "@/lib/payments/plugins";
import {
  resolveMerchantChannelTemplate,
  resolvePaymentChannelOption,
  type MerchantChannelTemplate,
  type PaymentChannelOption,
  type PaymentPluginDefinition,
} from "@/lib/payments/plugins/types";
import type { PaymentChannelSummary, PaymentProvider } from "@/lib/payments/types";
import { getPrismaClient } from "@/lib/prisma";

const PAYMENT_PLUGIN_KIND: MarketplacePluginKind = "PAYMENT_CHANNEL";
const BUILTIN_PLUGIN_SOURCE: MarketplacePluginSource = "BUILTIN";
const MARKETPLACE_SYNC_INTERVAL_MS = 60_000;

let lastMarketplaceSyncAt = 0;
let marketplaceSyncPromise: Promise<void> | null = null;

function getRuntimePluginInstallRoot() {
  return path.join(process.cwd(), "runtime", "plugins");
}

function normalizeBundleRelativePath(value: string) {
  const normalized = value.replace(/\\/g, "/").replace(/^\/+/, "");

  if (!normalized || normalized.includes("..")) {
    throw new Error(`Invalid package file path: ${value}`);
  }

  return normalized;
}

function computeSha256Hex(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function assertChecksumMatches(rawPayload: string, checksum: string | null | undefined) {
  if (!checksum) {
    return;
  }

  const expected = checksum.startsWith("sha256:") ? checksum.slice(7) : checksum;
  const actual = computeSha256Hex(rawPayload);

  if (actual !== expected) {
    throw new Error("Remote plugin package checksum verification failed.");
  }
}

function parseRemotePluginPackageBundle(rawPayload: string): RemotePluginPackageBundle {
  const parsed = JSON.parse(rawPayload) as unknown;

  if (!parsed || typeof parsed !== "object" || !("manifest" in parsed)) {
    throw new Error("Remote plugin package must contain a manifest field.");
  }

  return parsed as RemotePluginPackageBundle;
}

export interface MarketplacePaymentPluginRecord {
  id: string;
  slug: string;
  channelCode: string;
  providerKey: string;
  displayName: string;
  vendor: string;
  packageName: string;
  version: string;
  source: MarketplacePluginSource;
  pricingMode: PluginPricingMode | null;
  priceLabel: string | null;
  purchaseUrl: string | null;
  purchasedAt: Date | null;
  trusted: boolean;
  installed: boolean;
  enabled: boolean;
  runnable: boolean;
  installedAt: Date | null;
  lastSyncedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  category: string;
  summary: string;
  description: string;
  supportsCallbackRoute: boolean;
  requiresMerchantProfileCompletion: boolean;
  capabilities: PaymentChannelSummary["capabilities"];
  channelSummary: PaymentChannelSummary;
  usage: {
    merchantAccountCount: number;
    enabledMerchantAccountCount: number;
    bindingCount: number;
    enabledBindingCount: number;
    orderCount: number;
    refundCount: number;
  };
  localPath: string | null;
  manifestVersion: number | null;
  runtimeEntrypoint: string | null;
  runtimePath: string | null;
  loadError: string | null;
}

export interface MerchantMarketplacePaymentPluginRecord
  extends MarketplacePaymentPluginRecord {
  merchantInstalled: boolean;
  merchantInstalledAt: Date | null;
}

export interface MarketplacePluginMerchantInstallRecord {
  merchantId: string;
  merchantCode: string;
  merchantName: string;
  installedAt: Date;
  channelAccountCount: number;
  bindingCount: number;
}

export interface MarketplacePluginPurchaseRecord {
  id: string;
  orderReference: string | null;
  licenseKey: string | null;
  priceLabel: string | null;
  purchaseUrl: string | null;
  notes: string | null;
  purchasedBy: string | null;
  purchasedAt: Date;
}

export interface MarketplacePaymentPluginDetailRecord
  extends MarketplacePaymentPluginRecord {
  merchantInstalls: MarketplacePluginMerchantInstallRecord[];
  purchaseRecords: MarketplacePluginPurchaseRecord[];
}

export interface MarketplacePluginSafetyState {
  id: string;
  slug: string;
  source: MarketplacePluginSource;
  channelCode: string | null;
  installed: boolean;
  enabled: boolean;
  version: string;
  runnable: boolean;
  pricingMode: PluginPricingMode | null;
  purchasedAt: Date | null;
}

interface RemotePluginPackageBundleFile {
  path: string;
  content: string;
  encoding?: "utf8" | "base64";
}

interface RemotePluginPackageBundle {
  manifest: unknown;
  files?: RemotePluginPackageBundleFile[];
}

function listBuiltinPaymentPlugins() {
  return listPaymentPlugins();
}

async function loadLocalPaymentPluginDefinitionsMap() {
  const manifests = await discoverLocalPluginPackageManifests();
  const inspections = await Promise.all(
    manifests.map(async (manifest) => ({
      manifest,
      inspection: await loadLocalPaymentPluginRuntimeInspection(manifest),
    })),
  );

  return new Map(
    inspections
      .filter(
        (item): item is {
          manifest: LocalPluginPackageManifest;
          inspection: {
            definition: PaymentPluginDefinition;
            runnable: boolean;
            loadError: string | null;
          };
        } => Boolean(item.inspection.definition),
      )
      .map((item) => [item.manifest.channelCode, item.inspection]),
  );
}

async function loadRemoteInstalledPaymentPluginDefinitionsMap() {
  const installs = await getPrismaClient().pluginPackageInstall.findMany({
    where: {
      plugin: {
        source: "REMOTE_SIGNED",
      },
      status: {
        in: ["DOWNLOADED", "VALIDATED", "LOAD_ERROR"] satisfies PluginPackageInstallStatus[],
      },
    },
    include: {
      plugin: {
        select: {
          channelCode: true,
        },
      },
    },
    orderBy: [{ installedAt: "desc" }],
  });

  const seenChannelCodes = new Set<string>();
  const results = new Map<
    string,
    Awaited<ReturnType<typeof loadPaymentPluginRuntimeInspectionFromManifestPath>>
  >();

  for (const install of installs) {
    const channelCode = install.plugin.channelCode;

    if (!channelCode || seenChannelCodes.has(channelCode)) {
      continue;
    }

    seenChannelCodes.add(channelCode);

    try {
      const manifestPath = path.join(install.installPath, "plugin.json");
      const result = await loadPaymentPluginRuntimeInspectionFromManifestPath(
        manifestPath,
        "REMOTE_SIGNED",
      );
      results.set(channelCode, result);
    } catch {
      continue;
    }
  }

  return results;
}

function toMarketplaceMetadata(plugin: PaymentPluginDefinition) {
  const category = plugin.marketplace.category as unknown as Prisma.InputJsonObject;
  const summary = plugin.marketplace.summary as unknown as Prisma.InputJsonObject;
  const description =
    plugin.marketplace.description as unknown as Prisma.InputJsonObject;

  return {
    category,
    summary,
    description,
    callbackPathSegment: plugin.callbacks?.pathSegment ?? null,
    merchantProfileRequired:
      plugin.merchantTemplate.requiresMerchantProfileCompletion,
  } satisfies Prisma.InputJsonObject;
}

function toLocalPluginMetadata(manifest: LocalPluginPackageManifest) {
  return {
    category: manifest.category as unknown as Prisma.InputJsonObject,
    summary: manifest.summary as unknown as Prisma.InputJsonObject,
    description: manifest.detail as unknown as Prisma.InputJsonObject,
    callbackPathSegment: null,
    merchantProfileRequired: manifest.requiresMerchantProfileCompletion,
    localPath: manifest.localPath,
    manifestVersion: manifest.manifestVersion,
    runtimeEntrypoint: manifest.runtimeEntrypoint,
    runtimePath: manifest.runtimePath,
    runnable: manifest.runnable,
  } satisfies Prisma.InputJsonObject;
}

async function upsertBuiltinMarketplacePlugin(plugin: PaymentPluginDefinition) {
  const prisma = getPrismaClient();
  const summary = plugin.provider.getSummary();

  await prisma.marketplacePlugin.upsert({
    where: {
      slug: plugin.marketplace.slug,
    },
    update: {
      kind: PAYMENT_PLUGIN_KIND,
      source: BUILTIN_PLUGIN_SOURCE,
      channelCode: plugin.channelCode,
      providerKey: plugin.providerKey,
      packageName: plugin.marketplace.packageName,
      displayName: pickByLocale("en", plugin.adminOption.title),
      vendor: plugin.marketplace.vendor,
      description: pickByLocale("en", plugin.marketplace.description),
      version: plugin.marketplace.version,
      capabilities: summary.capabilities,
      metadata: toMarketplaceMetadata(plugin),
      trusted: true,
      lastSyncedAt: new Date(),
    },
    create: {
      slug: plugin.marketplace.slug,
      kind: PAYMENT_PLUGIN_KIND,
      source: BUILTIN_PLUGIN_SOURCE,
      channelCode: plugin.channelCode,
      providerKey: plugin.providerKey,
      packageName: plugin.marketplace.packageName,
      displayName: pickByLocale("en", plugin.adminOption.title),
      vendor: plugin.marketplace.vendor,
      description: pickByLocale("en", plugin.marketplace.description),
      version: plugin.marketplace.version,
      capabilities: summary.capabilities,
      metadata: toMarketplaceMetadata(plugin),
      trusted: true,
      installed: true,
      enabled: true,
      installedAt: new Date(),
      lastSyncedAt: new Date(),
    },
  });
}

async function runBuiltinMarketplaceSync() {
  const plugins = listBuiltinPaymentPlugins();
  await Promise.all(plugins.map((plugin) => upsertBuiltinMarketplacePlugin(plugin)));
}

async function syncLocalMarketplacePackages() {
  const prisma = getPrismaClient();
  const manifests = await discoverLocalPluginPackageManifests();
  const inspections = await Promise.all(
    manifests.map(async (manifest) => ({
      manifest,
      inspection: await loadLocalPaymentPluginRuntimeInspection(manifest),
    })),
  );

  await Promise.all(
    inspections.map(({ manifest, inspection }) =>
      prisma.marketplacePlugin.upsert({
        where: {
          slug: manifest.slug,
        },
        update: {
          kind: PAYMENT_PLUGIN_KIND,
          source: manifest.source,
          channelCode: manifest.channelCode,
          providerKey: manifest.providerKey,
          packageName: manifest.packageName,
          displayName: manifest.displayName,
          vendor: manifest.vendor,
          description: manifest.description,
          version: manifest.version,
          capabilities: manifest.capabilities,
          metadata: {
            ...toLocalPluginMetadata(manifest),
            runnable: inspection.runnable,
            loadError: inspection.loadError,
          } as Prisma.InputJsonObject,
          trusted: false,
          ...(inspection.runnable
            ? {}
            : {
                enabled: false,
              }),
          lastSyncedAt: new Date(),
        },
        create: {
          slug: manifest.slug,
          kind: PAYMENT_PLUGIN_KIND,
          source: manifest.source,
          channelCode: manifest.channelCode,
          providerKey: manifest.providerKey,
          packageName: manifest.packageName,
          displayName: manifest.displayName,
          vendor: manifest.vendor,
          description: manifest.description,
          version: manifest.version,
          capabilities: manifest.capabilities,
          metadata: {
            ...toLocalPluginMetadata(manifest),
            runnable: inspection.runnable,
            loadError: inspection.loadError,
          } as Prisma.InputJsonObject,
          trusted: false,
          installed: false,
          enabled: false,
          lastSyncedAt: new Date(),
        },
      }),
    ),
  );
}

async function syncRemoteMarketplaceRegistry() {
  const prisma = getPrismaClient();
  const snapshots = await fetchRemoteRegistrySnapshots();

  await Promise.all(
    snapshots.flatMap((snapshot) => [
      prisma.pluginRegistrySource.update({
        where: {
          id: snapshot.sourceId,
        },
        data: {
          lastSyncAt: new Date(),
        },
      }),
      ...snapshot.plugins.map((plugin) =>
        prisma.marketplacePlugin.upsert({
          where: {
            slug: plugin.slug,
          },
          update: {
            kind: PAYMENT_PLUGIN_KIND,
            source: plugin.source,
            registrySourceId: snapshot.sourceId,
            remotePluginId: plugin.remotePluginId,
            channelCode: plugin.channelCode,
            providerKey: plugin.providerKey,
            packageName: plugin.packageName,
            displayName: plugin.displayName,
            vendor: plugin.vendor,
            description: plugin.description,
            version: plugin.version,
            latestVersion: plugin.latestVersion,
            runtimeMode: plugin.runtimeMode,
            pricingMode: plugin.pricingMode,
            priceLabel: plugin.priceLabel,
            purchaseUrl: plugin.purchaseUrl,
            downloadUrl: plugin.downloadUrl,
            checksum: plugin.checksum,
            signature: plugin.signature,
            capabilities: plugin.capabilities,
            metadata: (plugin.metadata ?? {}) as Prisma.InputJsonObject,
            trusted: true,
            lastSyncedAt: new Date(),
          },
          create: {
            slug: plugin.slug,
            kind: PAYMENT_PLUGIN_KIND,
            source: plugin.source,
            registrySourceId: snapshot.sourceId,
            remotePluginId: plugin.remotePluginId,
            channelCode: plugin.channelCode,
            providerKey: plugin.providerKey,
            packageName: plugin.packageName,
            displayName: plugin.displayName,
            vendor: plugin.vendor,
            description: plugin.description,
            version: plugin.version,
            latestVersion: plugin.latestVersion,
            runtimeMode: plugin.runtimeMode,
            pricingMode: plugin.pricingMode,
            priceLabel: plugin.priceLabel,
            purchaseUrl: plugin.purchaseUrl,
            downloadUrl: plugin.downloadUrl,
            checksum: plugin.checksum,
            signature: plugin.signature,
            capabilities: plugin.capabilities,
            metadata: (plugin.metadata ?? {}) as Prisma.InputJsonObject,
            trusted: true,
            installed: false,
            enabled: false,
            lastSyncedAt: new Date(),
          },
        }),
      ),
    ]),
  );
}

export async function syncBuiltinMarketplacePlugins(force = false) {
  const now = Date.now();

  if (!force && lastMarketplaceSyncAt && now - lastMarketplaceSyncAt < MARKETPLACE_SYNC_INTERVAL_MS) {
    return;
  }

  if (marketplaceSyncPromise) {
    return marketplaceSyncPromise;
  }

  marketplaceSyncPromise = Promise.all([
    runBuiltinMarketplaceSync(),
    syncLocalMarketplacePackages(),
    syncRemoteMarketplaceRegistry(),
  ])
    .then(() => {
      lastMarketplaceSyncAt = Date.now();
    })
    .finally(() => {
      marketplaceSyncPromise = null;
    });

  return marketplaceSyncPromise;
}

function getLocalizedMetadataField(
  record: MarketplacePlugin,
  locale: Locale,
  key: "category" | "summary" | "description",
) {
  const value =
    record.metadata &&
    typeof record.metadata === "object" &&
    !Array.isArray(record.metadata) &&
    key in record.metadata
      ? (record.metadata[key] as unknown)
      : null;

  if (
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    "zh" in value &&
    "en" in value
  ) {
    return pickByLocale(locale, value as { zh: string; en: string });
  }

  return record.description;
}

function toMarketplacePaymentRecord(
  plugin: PaymentPluginDefinition,
  record: MarketplacePlugin,
  locale: Locale,
  usage: MarketplacePaymentPluginRecord["usage"],
): MarketplacePaymentPluginRecord {
  return {
    id: record.id,
    slug: record.slug,
    channelCode: plugin.channelCode,
    providerKey: plugin.providerKey,
    displayName: pickByLocale(locale, plugin.adminOption.title),
    vendor: record.vendor ?? plugin.marketplace.vendor,
    packageName: record.packageName ?? plugin.marketplace.packageName,
    version: record.version,
    source: record.source,
    pricingMode: record.pricingMode,
    priceLabel: record.priceLabel,
    purchaseUrl: record.purchaseUrl,
    purchasedAt: record.purchasedAt,
    trusted: record.trusted,
    installed: record.installed,
    enabled: record.enabled,
    runnable: true,
    installedAt: record.installedAt,
    lastSyncedAt: record.lastSyncedAt,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    category: getLocalizedMetadataField(record, locale, "category"),
    summary: getLocalizedMetadataField(record, locale, "summary"),
    description: getLocalizedMetadataField(record, locale, "description"),
    supportsCallbackRoute: Boolean(plugin.callbacks),
    requiresMerchantProfileCompletion:
      plugin.merchantTemplate.requiresMerchantProfileCompletion,
    capabilities: plugin.provider.getSummary().capabilities,
    channelSummary: plugin.provider.getSummary(),
    usage,
    localPath:
      record.metadata &&
      typeof record.metadata === "object" &&
      !Array.isArray(record.metadata) &&
      typeof record.metadata.localPath === "string"
        ? record.metadata.localPath
        : null,
    manifestVersion:
      record.metadata &&
      typeof record.metadata === "object" &&
      !Array.isArray(record.metadata) &&
      typeof record.metadata.manifestVersion === "number"
        ? record.metadata.manifestVersion
        : null,
    runtimeEntrypoint:
      record.metadata &&
      typeof record.metadata === "object" &&
      !Array.isArray(record.metadata) &&
      typeof record.metadata.runtimeEntrypoint === "string"
        ? record.metadata.runtimeEntrypoint
        : null,
    runtimePath:
      record.metadata &&
      typeof record.metadata === "object" &&
      !Array.isArray(record.metadata) &&
      typeof record.metadata.runtimePath === "string"
        ? record.metadata.runtimePath
        : null,
    loadError:
      record.metadata &&
      typeof record.metadata === "object" &&
      !Array.isArray(record.metadata) &&
      typeof record.metadata.loadError === "string"
        ? record.metadata.loadError
        : null,
  };
}

function toLocalMarketplacePaymentRecord(
  record: MarketplacePlugin,
  locale: Locale,
): MarketplacePaymentPluginRecord | null {
  if (!record.channelCode || !record.providerKey) {
    return null;
  }

  const capabilities =
    Array.isArray(record.capabilities) &&
    record.capabilities.every((item) => typeof item === "string")
      ? (record.capabilities as PaymentChannelSummary["capabilities"])
      : [];

  const localPath =
    record.metadata &&
    typeof record.metadata === "object" &&
    !Array.isArray(record.metadata) &&
    typeof record.metadata.localPath === "string"
      ? record.metadata.localPath
      : null;
  const manifestVersion =
    record.metadata &&
    typeof record.metadata === "object" &&
    !Array.isArray(record.metadata) &&
    typeof record.metadata.manifestVersion === "number"
      ? record.metadata.manifestVersion
      : null;
  const requiresMerchantProfileCompletion =
    record.metadata &&
    typeof record.metadata === "object" &&
    !Array.isArray(record.metadata) &&
    typeof record.metadata.merchantProfileRequired === "boolean"
      ? record.metadata.merchantProfileRequired
      : false;
  const runnable =
    record.metadata &&
    typeof record.metadata === "object" &&
    !Array.isArray(record.metadata) &&
    typeof record.metadata.runnable === "boolean"
      ? record.metadata.runnable
      : false;
  const runtimeEntrypoint =
    record.metadata &&
    typeof record.metadata === "object" &&
    !Array.isArray(record.metadata) &&
    typeof record.metadata.runtimeEntrypoint === "string"
      ? record.metadata.runtimeEntrypoint
      : null;
  const runtimePath =
    record.metadata &&
    typeof record.metadata === "object" &&
    !Array.isArray(record.metadata) &&
    typeof record.metadata.runtimePath === "string"
      ? record.metadata.runtimePath
      : null;
  const loadError =
    record.metadata &&
    typeof record.metadata === "object" &&
    !Array.isArray(record.metadata) &&
    typeof record.metadata.loadError === "string"
      ? record.metadata.loadError
      : null;

  return {
    id: record.id,
    slug: record.slug,
    channelCode: record.channelCode,
    providerKey: record.providerKey,
    displayName: record.displayName,
    vendor: record.vendor ?? "Local Package",
    packageName: record.packageName ?? record.slug,
    version: record.version,
    source: record.source,
    pricingMode: record.pricingMode,
    priceLabel: record.priceLabel,
    purchaseUrl: record.purchaseUrl,
    purchasedAt: record.purchasedAt,
    trusted: record.trusted,
    installed: record.installed,
    enabled: record.enabled,
    runnable,
    installedAt: record.installedAt,
    lastSyncedAt: record.lastSyncedAt,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    category: getLocalizedMetadataField(record, locale, "category"),
    summary: getLocalizedMetadataField(record, locale, "summary"),
    description: getLocalizedMetadataField(record, locale, "description"),
    supportsCallbackRoute: false,
    requiresMerchantProfileCompletion,
    capabilities,
    channelSummary: {
      code: record.channelCode as PaymentChannelSummary["code"],
      provider: record.providerKey as PaymentChannelSummary["provider"],
      displayName: record.displayName,
      description: record.description,
      configured: false,
      implementationStatus: runnable ? "ready" : "skeleton",
      capabilities,
    },
    usage: {
      merchantAccountCount: 0,
      enabledMerchantAccountCount: 0,
      bindingCount: 0,
      enabledBindingCount: 0,
      orderCount: 0,
      refundCount: 0,
    },
    localPath,
    manifestVersion,
    runtimeEntrypoint,
    runtimePath,
    loadError,
  };
}

async function getMarketplacePluginUsage(channelCode: string) {
  const prisma = getPrismaClient();
  const [
    merchantAccountCount,
    enabledMerchantAccountCount,
    bindingCount,
    enabledBindingCount,
    orderCount,
    refundCount,
  ] = await Promise.all([
    prisma.merchantChannelAccount.count({
      where: {
        channelCode,
      },
    }),
    prisma.merchantChannelAccount.count({
      where: {
        channelCode,
        enabled: true,
      },
    }),
    prisma.merchantChannelBinding.count({
      where: {
        channelCode,
      },
    }),
    prisma.merchantChannelBinding.count({
      where: {
        channelCode,
        enabled: true,
      },
    }),
    prisma.paymentOrder.count({
      where: {
        channelCode,
      },
    }),
    prisma.paymentRefund.count({
      where: {
        paymentOrder: {
          channelCode,
        },
      },
    }),
  ]);

  return {
    merchantAccountCount,
    enabledMerchantAccountCount,
    bindingCount,
    enabledBindingCount,
    orderCount,
    refundCount,
  };
}

async function getMerchantMarketplacePluginUsage(
  merchantId: string,
  channelCode: string,
) {
  const prisma = getPrismaClient();
  const [merchantAccountCount, bindingCount] = await Promise.all([
    prisma.merchantChannelAccount.count({
      where: {
        merchantId,
        channelCode,
      },
    }),
    prisma.merchantChannelBinding.count({
      where: {
        merchantId,
        channelCode,
      },
    }),
  ]);

  return {
    merchantAccountCount,
    bindingCount,
  };
}

async function syncMerchantInstalledPluginsFromUsage(merchantId: string) {
  await syncBuiltinMarketplacePlugins();
  const prisma = getPrismaClient();
  const [accountRows, bindingRows, pluginRows] = await Promise.all([
    prisma.merchantChannelAccount.findMany({
      where: {
        merchantId,
      },
      select: {
        channelCode: true,
      },
    }),
    prisma.merchantChannelBinding.findMany({
      where: {
        merchantId,
      },
      select: {
        channelCode: true,
      },
    }),
    prisma.marketplacePlugin.findMany({
      where: {
        kind: PAYMENT_PLUGIN_KIND,
      },
      select: {
        slug: true,
        channelCode: true,
      },
    }),
  ]);
  const pluginSlugByChannelCode = new Map(
    pluginRows
      .filter((row) => row.channelCode)
      .map((row) => [row.channelCode as string, row.slug]),
  );

  const pluginSlugs = [
    ...new Set(
      [...accountRows, ...bindingRows]
        .map((row) => pluginSlugByChannelCode.get(row.channelCode) ?? null)
        .filter((slug): slug is string => Boolean(slug)),
    ),
  ];

  if (pluginSlugs.length === 0) {
    return;
  }

  await Promise.all(
    pluginSlugs.map((pluginSlug) =>
      prisma.merchantInstalledPlugin.upsert({
        where: {
          merchantId_pluginSlug: {
            merchantId,
            pluginSlug,
          },
        },
        update: {},
        create: {
          merchantId,
          pluginSlug,
        },
      }),
    ),
  );
}

async function listEnabledPaymentPluginDefinitions() {
  await syncBuiltinMarketplacePlugins();
  const localDefinitions = await loadLocalPaymentPluginDefinitionsMap();
  const remoteDefinitions = await loadRemoteInstalledPaymentPluginDefinitionsMap();
  const rows = await getPrismaClient().marketplacePlugin.findMany({
    where: {
      kind: PAYMENT_PLUGIN_KIND,
      installed: true,
      enabled: true,
    },
    select: {
      channelCode: true,
      source: true,
    },
  });

  return rows
    .map((row) => {
      if (!row.channelCode) {
        return null;
      }

      return (
        getPaymentPlugin(row.channelCode) ??
        remoteDefinitions.get(row.channelCode)?.inspection.definition ??
        localDefinitions.get(row.channelCode)?.definition ??
        null
      );
    })
    .filter((plugin): plugin is PaymentPluginDefinition => Boolean(plugin));
}

async function listMerchantEnabledPaymentPluginDefinitions(merchantId: string) {
  await syncMerchantInstalledPluginsFromUsage(merchantId);
  const localDefinitions = await loadLocalPaymentPluginDefinitionsMap();
  const remoteDefinitions = await loadRemoteInstalledPaymentPluginDefinitionsMap();
  const rows = await getPrismaClient().merchantInstalledPlugin.findMany({
    where: {
      merchantId,
      plugin: {
        kind: PAYMENT_PLUGIN_KIND,
        installed: true,
        enabled: true,
      },
    },
    select: {
      plugin: {
        select: {
          channelCode: true,
        },
      },
    },
  });

  return rows
    .map((row) => {
      if (!row.plugin.channelCode) {
        return null;
      }

      return (
        getPaymentPlugin(row.plugin.channelCode) ??
        remoteDefinitions.get(row.plugin.channelCode)?.inspection.definition ??
        localDefinitions.get(row.plugin.channelCode)?.definition ??
        null
      );
    })
    .filter((plugin): plugin is PaymentPluginDefinition => Boolean(plugin));
}

export async function listMarketplacePaymentPlugins(
  locale: Locale = "zh",
) {
  await syncBuiltinMarketplacePlugins();
  const localDefinitions = await loadLocalPaymentPluginDefinitionsMap();
  const remoteDefinitions = await loadRemoteInstalledPaymentPluginDefinitionsMap();
  const rows = await getPrismaClient().marketplacePlugin.findMany({
    where: {
      kind: PAYMENT_PLUGIN_KIND,
    },
    orderBy: [{ installed: "desc" }, { trusted: "desc" }, { slug: "asc" }],
  });

  const records = await Promise.all(
    rows.map(async (row) => {
      if (!row.channelCode) {
        return null;
      }

      const plugin =
        getPaymentPlugin(row.channelCode) ??
        remoteDefinitions.get(row.channelCode)?.inspection.definition ??
        localDefinitions.get(row.channelCode)?.definition ??
        null;

      if (!plugin) {
        return toLocalMarketplacePaymentRecord(row, locale);
      }

      const usage = await getMarketplacePluginUsage(row.channelCode);
      return toMarketplacePaymentRecord(plugin, row, locale, usage);
    }),
  );

  return records.filter(
    (row): row is MarketplacePaymentPluginRecord => Boolean(row),
  );
}

export async function getMarketplacePaymentPluginDetail(
  slug: string,
  locale: Locale = "zh",
): Promise<MarketplacePaymentPluginDetailRecord | null> {
  await syncBuiltinMarketplacePlugins();
  const localDefinitions = await loadLocalPaymentPluginDefinitionsMap();
  const remoteDefinitions = await loadRemoteInstalledPaymentPluginDefinitionsMap();
  const row = await getPrismaClient().marketplacePlugin.findUnique({
    where: {
      slug,
    },
    include: {
      merchantInstalls: {
        include: {
          merchant: {
            select: {
              id: true,
              code: true,
              name: true,
            },
          },
        },
        orderBy: [{ installedAt: "desc" }],
      },
      purchaseRecords: {
        orderBy: [{ purchasedAt: "desc" }],
        take: 10,
      },
    },
  });

  if (!row?.channelCode) {
    return null;
  }

  const plugin =
    getPaymentPlugin(row.channelCode) ??
    remoteDefinitions.get(row.channelCode)?.inspection.definition ??
    localDefinitions.get(row.channelCode)?.definition ??
    null;

  if (!plugin) {
    const localRecord = toLocalMarketplacePaymentRecord(row, locale);

    if (!localRecord) {
      return null;
    }

    return {
      ...localRecord,
      merchantInstalls: [],
      purchaseRecords: row.purchaseRecords.map((record) => ({
        id: record.id,
        orderReference: record.orderReference,
        licenseKey: record.licenseKey,
        priceLabel: record.priceLabel,
        purchaseUrl: record.purchaseUrl,
        notes: record.notes,
        purchasedBy: record.purchasedBy,
        purchasedAt: record.purchasedAt,
      })),
    };
  }

  const usage = await getMarketplacePluginUsage(row.channelCode);
  const merchantInstalls = await Promise.all(
    row.merchantInstalls.map(async (install) => {
      const [channelAccountCount, bindingCount] = await Promise.all([
        getPrismaClient().merchantChannelAccount.count({
          where: {
            merchantId: install.merchant.id,
            channelCode: row.channelCode ?? undefined,
          },
        }),
        getPrismaClient().merchantChannelBinding.count({
          where: {
            merchantId: install.merchant.id,
            channelCode: row.channelCode ?? undefined,
          },
        }),
      ]);

      return {
        merchantId: install.merchant.id,
        merchantCode: install.merchant.code,
        merchantName: install.merchant.name,
        installedAt: install.installedAt,
        channelAccountCount,
        bindingCount,
      };
    }),
  );

  return {
    ...toMarketplacePaymentRecord(plugin, row, locale, usage),
    merchantInstalls,
    purchaseRecords: row.purchaseRecords.map((record) => ({
      id: record.id,
      orderReference: record.orderReference,
      licenseKey: record.licenseKey,
      priceLabel: record.priceLabel,
      purchaseUrl: record.purchaseUrl,
      notes: record.notes,
      purchasedBy: record.purchasedBy,
      purchasedAt: record.purchasedAt,
    })),
  };
}

export async function getMarketplacePluginUsageBySlug(slug: string) {
  await syncBuiltinMarketplacePlugins();
  const row = await getPrismaClient().marketplacePlugin.findUnique({
    where: {
      slug,
    },
    select: {
      channelCode: true,
    },
  });

  if (!row?.channelCode) {
    throw new Error("插件不存在或未绑定支付通道。");
  }

  return getMarketplacePluginUsage(row.channelCode);
}

export async function getMarketplacePluginSafetyState(
  slug: string,
): Promise<MarketplacePluginSafetyState | null> {
  await syncBuiltinMarketplacePlugins();
  const row = await getPrismaClient().marketplacePlugin.findUnique({
    where: {
      slug,
    },
    select: {
      id: true,
      slug: true,
      source: true,
      channelCode: true,
      installed: true,
      enabled: true,
      version: true,
      pricingMode: true,
      purchasedAt: true,
      metadata: true,
    },
  });

  if (!row) {
    return null;
  }

  const runnable =
    row.metadata &&
    typeof row.metadata === "object" &&
    !Array.isArray(row.metadata) &&
    typeof row.metadata.runnable === "boolean"
      ? row.metadata.runnable
      : row.source !== "LOCAL_PACKAGE";

  return {
    id: row.id,
    slug: row.slug,
    source: row.source,
    channelCode: row.channelCode,
    installed: row.installed,
    enabled: row.enabled,
    version: row.version,
    runnable,
    pricingMode: row.pricingMode,
    purchasedAt: row.purchasedAt,
  };
}

async function recordInstallFailure(
  prisma: ReturnType<typeof getPrismaClient>,
  plugin: { slug: string; downloadUrl: string | null },
  version: string,
  loadError: string,
) {
  const installPath = path.join(getRuntimePluginInstallRoot(), plugin.slug, version);
  await prisma.pluginPackageInstall.create({
    data: {
      pluginSlug: plugin.slug,
      version,
      downloadUrl: plugin.downloadUrl,
      installPath,
      status: "LOAD_ERROR",
      loadError,
    },
  });
  await prisma.marketplacePlugin.update({
    where: { slug: plugin.slug },
    data: { installed: false },
  });
}

export async function installRemoteMarketplacePluginPackage(slug: string) {
  await syncBuiltinMarketplacePlugins();
  const prisma = getPrismaClient();
  const plugin = await prisma.marketplacePlugin.findUnique({
    where: {
      slug,
    },
    select: {
      id: true,
      slug: true,
      source: true,
      channelCode: true,
      packageName: true,
      displayName: true,
      version: true,
      latestVersion: true,
      pricingMode: true,
      priceLabel: true,
      purchaseUrl: true,
      purchasedAt: true,
      downloadUrl: true,
      checksum: true,
      signature: true,
    },
  });

  if (!plugin || plugin.source !== "REMOTE_SIGNED" || !plugin.channelCode) {
    throw new Error("远程插件不存在或当前不支持下载。");
  }

  if (!plugin.downloadUrl) {
    throw new Error("远程插件缺少下载地址。");
  }

  if (plugin.pricingMode === "PAID" && !plugin.purchasedAt) {
    throw new Error("当前远程插件为收费插件，请先记录已购状态后再安装。");
  }

  const response = await fetch(plugin.downloadUrl, {
    method: "GET",
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) {
    throw new Error(`远程插件包下载失败，状态码 ${response.status}。`);
  }

  const rawPayload = await response.text();

  // Req 12.1, 19.4: For REMOTE_SIGNED sources, checksum and signature are
  // mandatory. Reject installs that lack either field.
  if (!plugin.checksum) {
    await recordInstallFailure(prisma, plugin, version, "REMOTE_SIGNED plugin is missing checksum. Refusing to install unsigned package.");
    throw new Error("远程签名插件缺少 checksum，拒绝安装。");
  }

  if (!plugin.signature) {
    await recordInstallFailure(prisma, plugin, version, "REMOTE_SIGNED plugin is missing signature. Refusing to install unsigned package.");
    throw new Error("远程签名插件缺少 signature，拒绝安装。");
  }

  // Req 12.4: sha256 checksum verification
  assertChecksumMatches(rawPayload, plugin.checksum);

  // Req 12.2, 19.5: Ed25519 signature verification
  const registrySource = plugin.checksum
    ? await prisma.pluginRegistrySource.findFirst({
        where: {
          plugins: { some: { slug: plugin.slug } },
        },
        select: { trustPublicKey: true },
      })
    : null;

  if (registrySource?.trustPublicKey) {
    const { verifyEd25519Signature } = await import("@/lib/plugins/signature-verify");
    const verifyResult = verifyEd25519Signature({
      rawBytes: rawPayload,
      signature: plugin.signature,
      publicKey: registrySource.trustPublicKey,
    });

    if (!verifyResult.valid) {
      const errorMsg = `Ed25519 signature verification failed: ${verifyResult.errorCode ?? "unknown"} — ${verifyResult.errorMessage ?? ""}`;
      await recordInstallFailure(prisma, plugin, version, errorMsg);
      throw new Error(`远程插件包签名校验失败：${verifyResult.errorCode}`);
    }
  }

  const bundle = parseRemotePluginPackageBundle(rawPayload);
  const version = plugin.latestVersion ?? plugin.version;
  const installPath = path.join(getRuntimePluginInstallRoot(), plugin.slug, version);

  await rm(installPath, { recursive: true, force: true });
  await mkdir(installPath, { recursive: true });
  await writeFile(
    path.join(installPath, "plugin.json"),
    JSON.stringify(bundle.manifest, null, 2),
    "utf8",
  );

  for (const file of bundle.files ?? []) {
    const relativePath = normalizeBundleRelativePath(file.path);
    const targetPath = path.join(installPath, relativePath);
    await mkdir(path.dirname(targetPath), { recursive: true });
    await writeFile(
      targetPath,
      file.encoding === "base64"
        ? Buffer.from(file.content, "base64")
        : file.content,
      file.encoding === "base64" ? undefined : "utf8",
    );
  }

  const { manifest, inspection } = await loadPaymentPluginRuntimeInspectionFromManifestPath(
    path.join(installPath, "plugin.json"),
    "REMOTE_SIGNED",
  );

  if (manifest.slug !== plugin.slug) {
    throw new Error("远程插件包清单里的 slug 与市场目录记录不一致。");
  }

  if (manifest.channelCode !== plugin.channelCode) {
    throw new Error("远程插件包清单里的 channelCode 与市场目录记录不一致。");
  }

  const status: PluginPackageInstallStatus = inspection.definition
    ? "VALIDATED"
    : "LOAD_ERROR";

  const installRecord = await prisma.pluginPackageInstall.create({
    data: {
      pluginSlug: plugin.slug,
      version,
      downloadUrl: plugin.downloadUrl,
      installPath,
      checksum: plugin.checksum,
      signature: plugin.signature,
      status,
      loadError: inspection.loadError,
    },
  });

  await prisma.marketplacePlugin.update({
    where: {
      slug: plugin.slug,
    },
    data: {
      installed: true,
      enabled: false,
      installedAt: new Date(),
      version,
      metadata: {
        loadError: inspection.loadError,
        runnable: inspection.runnable,
        localPath: path.join(installPath, "plugin.json"),
        runtimeEntrypoint: manifest.runtimeEntrypoint,
        runtimePath: manifest.runtimePath,
        manifestVersion: manifest.manifestVersion,
      } satisfies Prisma.InputJsonObject,
    },
  });

  return {
    plugin,
    installRecord,
    inspection,
  };
}

export async function markMarketplacePluginPurchased(slug: string) {
  await syncBuiltinMarketplacePlugins();
  const plugin = await getPrismaClient().marketplacePlugin.findUnique({
    where: {
      slug,
    },
    select: {
      id: true,
      slug: true,
      source: true,
      pricingMode: true,
      purchaseUrl: true,
    },
  });

  if (!plugin || plugin.source !== "REMOTE_SIGNED") {
    throw new Error("当前插件不是远程商店插件。");
  }

  if (plugin.pricingMode !== "PAID") {
    throw new Error("当前插件不是收费插件，无需记录购买。");
  }

  return getPrismaClient().marketplacePlugin.update({
    where: {
      slug,
    },
    data: {
      purchasedAt: new Date(),
    },
  });
}

export async function recordMarketplacePluginPurchase(input: {
  slug: string;
  purchasedBy?: string | null;
  orderReference?: string | null;
  licenseKey?: string | null;
  notes?: string | null;
}) {
  await syncBuiltinMarketplacePlugins();
  const plugin = await getPrismaClient().marketplacePlugin.findUnique({
    where: {
      slug: input.slug,
    },
    select: {
      id: true,
      slug: true,
      source: true,
      registrySourceId: true,
      pricingMode: true,
      priceLabel: true,
      purchaseUrl: true,
    },
  });

  if (!plugin || plugin.source !== "REMOTE_SIGNED") {
    throw new Error("当前插件不是远程商店插件。");
  }

  if (plugin.pricingMode !== "PAID") {
    throw new Error("当前插件不是收费插件，无需记录购买。");
  }

  const [record, updatedPlugin] = await getPrismaClient().$transaction([
    getPrismaClient().pluginPurchaseRecord.create({
      data: {
        pluginSlug: plugin.slug,
        sourceId: plugin.registrySourceId,
        orderReference: input.orderReference ?? null,
        licenseKey: input.licenseKey ?? null,
        priceLabel: plugin.priceLabel,
        purchaseUrl: plugin.purchaseUrl,
        notes: input.notes ?? null,
        purchasedBy: input.purchasedBy ?? null,
      },
    }),
    getPrismaClient().marketplacePlugin.update({
      where: {
        slug: plugin.slug,
      },
      data: {
        purchasedAt: new Date(),
      },
    }),
  ]);

  return {
    record,
    plugin: updatedPlugin,
  };
}

/**
 * Phase 3 (Req 13.3, 13.4, 13.5, 13.6): purchase a paid plugin via the
 * Registry's license verification flow. The caller passes the `licenseKey`
 * (compact JWS) returned by the Registry after payment; this function
 * validates it through `verifyLicense`, and ONLY when the result is valid
 * does it persist `PluginPurchaseRecord.licenseKey/licenseKeyHash/
 * licenseExpiresAt/verifiedAt` and set `MarketplacePlugin.purchasedAt =
 * license.iat`. Verification failures are recorded in `notes` instead.
 */
export async function purchaseAndIssueLicense(input: {
  slug: string;
  licenseKey: string;
  version: string;
  instanceId: string;
  merchantId?: string | null;
  purchasedBy?: string | null;
  orderReference?: string | null;
}): Promise<{
  success: boolean;
  reason?: string;
  message?: string;
  record?: { id: string };
}> {
  const { verifyLicense } = await import("@/lib/plugins/license-client");
  await syncBuiltinMarketplacePlugins();
  const prisma = getPrismaClient();

  const plugin = await prisma.marketplacePlugin.findUnique({
    where: { slug: input.slug },
    select: {
      id: true,
      slug: true,
      source: true,
      registrySourceId: true,
      pricingMode: true,
      priceLabel: true,
      purchaseUrl: true,
    },
  });

  if (!plugin || plugin.source !== "REMOTE_SIGNED") {
    throw new Error("当前插件不是远程商店插件。");
  }
  if (plugin.pricingMode !== "PAID") {
    throw new Error("当前插件不是收费插件，无需记录购买。");
  }
  if (!plugin.registrySourceId) {
    throw new Error("当前插件未关联远程商店源。");
  }

  const source = await prisma.pluginRegistrySource.findUnique({
    where: { id: plugin.registrySourceId },
  });
  if (!source) {
    throw new Error("远程商店源不存在。");
  }

  const { revealStoredSecret } = await import("@/lib/secret-box");
  const appKey = revealStoredSecret(source.appKeyCiphertext) ?? "";

  const verifyResult = await verifyLicense({
    licenseKey: input.licenseKey,
    pluginSlug: input.slug,
    version: input.version,
    instanceId: input.instanceId,
    merchantId: input.merchantId ?? undefined,
    registryBaseUrl: source.baseUrl,
    appId: source.appId ?? "",
    appKey,
  });

  if (!verifyResult.valid) {
    const failureRecord = await prisma.pluginPurchaseRecord.create({
      data: {
        pluginSlug: plugin.slug,
        sourceId: plugin.registrySourceId,
        orderReference: input.orderReference ?? null,
        licenseKey: null,
        priceLabel: plugin.priceLabel,
        purchaseUrl: plugin.purchaseUrl,
        notes: `license verification failed: ${verifyResult.reason} — ${verifyResult.message}`,
        purchasedBy: input.purchasedBy ?? null,
      },
    });
    return {
      success: false,
      reason: verifyResult.reason,
      message: verifyResult.message,
      record: { id: failureRecord.id },
    };
  }

  const licenseIssuedAt = new Date(verifyResult.claims.iat * 1000);
  const [record] = await prisma.$transaction([
    prisma.pluginPurchaseRecord.create({
      data: {
        pluginSlug: plugin.slug,
        sourceId: plugin.registrySourceId,
        orderReference: input.orderReference ?? null,
        licenseKey: input.licenseKey,
        licenseKeyHash: verifyResult.licenseKeyHash,
        licenseExpiresAt: verifyResult.licenseExpiresAt,
        verifiedAt: new Date(),
        priceLabel: plugin.priceLabel,
        purchaseUrl: plugin.purchaseUrl,
        notes: null,
        purchasedBy: input.purchasedBy ?? null,
      },
    }),
    prisma.marketplacePlugin.update({
      where: { slug: plugin.slug },
      data: {
        purchasedAt: licenseIssuedAt,
      },
    }),
  ]);

  return { success: true, record: { id: record.id } };
}

/**
 * Phase 3 (Req 13.7, 13.8): periodic re-verification of installed paid
 * plugin licenses. Iterates over `PluginPurchaseRecord` rows with a stored
 * `licenseKey`, calls the Registry, and disables `MarketplacePlugin` rows
 * whose licenses are now REVOKED or EXPIRED. The install path is preserved
 * so the admin can appeal and restore.
 */
export async function revalidateInstalledPluginLicenses(input?: {
  instanceId?: string;
}): Promise<{ inspected: number; disabled: number }> {
  const { verifyLicense } = await import("@/lib/plugins/license-client");
  const { revealStoredSecret } = await import("@/lib/secret-box");
  const { getSystemConfig } = await import("@/lib/system-config");

  const prisma = getPrismaClient();
  const records = await prisma.pluginPurchaseRecord.findMany({
    where: {
      licenseKey: { not: null },
    },
    include: {
      plugin: {
        select: { slug: true, version: true, enabled: true, installed: true },
      },
      source: true,
    },
    orderBy: [{ purchasedAt: "desc" }],
  });

  const instanceId = input?.instanceId ?? (await getSystemConfig("INSTANCE_ID"));
  if (!instanceId) {
    return { inspected: 0, disabled: 0 };
  }

  let inspected = 0;
  let disabled = 0;
  // Track which slugs we've already evaluated to avoid double work when a
  // plugin has multiple purchase records.
  const seenSlugs = new Set<string>();

  for (const record of records) {
    if (!record.licenseKey || !record.source || !record.plugin) continue;
    if (seenSlugs.has(record.plugin.slug)) continue;
    seenSlugs.add(record.plugin.slug);
    inspected += 1;

    const appKey = revealStoredSecret(record.source.appKeyCiphertext) ?? "";
    const result = await verifyLicense({
      licenseKey: record.licenseKey,
      pluginSlug: record.plugin.slug,
      version: record.plugin.version,
      instanceId,
      registryBaseUrl: record.source.baseUrl,
      appId: record.source.appId ?? "",
      appKey,
    });

    if (
      !result.valid &&
      (result.reason === "REVOKED" || result.reason === "EXPIRED")
    ) {
      await prisma.marketplacePlugin.update({
        where: { slug: record.plugin.slug },
        data: { enabled: false },
      });
      await prisma.pluginPurchaseRecord.update({
        where: { id: record.id },
        data: {
          notes: `license ${result.reason.toLowerCase()} on revalidation: ${result.message}`,
        },
      });
      disabled += 1;
    }
  }

  return { inspected, disabled };
}

export async function listMerchantMarketplacePaymentPlugins(
  merchantId: string,
  locale: Locale = "zh",
): Promise<MerchantMarketplacePaymentPluginRecord[]> {
  await syncMerchantInstalledPluginsFromUsage(merchantId);
  const [plugins, installedRows] = await Promise.all([
    listMarketplacePaymentPlugins(locale),
    getPrismaClient().merchantInstalledPlugin.findMany({
      where: {
        merchantId,
      },
      select: {
        pluginSlug: true,
        installedAt: true,
      },
    }),
  ]);
  const merchantInstalledBySlug = new Map(
    installedRows.map((row) => [row.pluginSlug, row.installedAt]),
  );

  return plugins
    .filter((plugin) => plugin.installed && plugin.enabled)
    .map((plugin) => ({
      ...plugin,
      merchantInstalled: merchantInstalledBySlug.has(plugin.slug),
      merchantInstalledAt: merchantInstalledBySlug.get(plugin.slug) ?? null,
    }));
}

export class MerchantPluginInstallError extends Error {
  readonly code: "LICENSE_ASSIGNED_TO_OTHER_MERCHANT" | "LICENSE_INVALID";
  readonly statusCode: number;
  readonly reason?: string;

  constructor(
    code: "LICENSE_ASSIGNED_TO_OTHER_MERCHANT" | "LICENSE_INVALID",
    message: string,
    statusCode = 409,
    reason?: string,
  ) {
    super(message);
    this.name = "MerchantPluginInstallError";
    this.code = code;
    this.statusCode = statusCode;
    this.reason = reason;
  }
}

export async function installMerchantMarketplacePlugin(input: {
  merchantId: string;
  slug: string;
}) {
  await syncBuiltinMarketplacePlugins();
  const prisma = getPrismaClient();
  const plugin = await prisma.marketplacePlugin.findUnique({
    where: {
      slug: input.slug,
    },
    select: {
      id: true,
      slug: true,
      channelCode: true,
      installed: true,
      enabled: true,
      displayName: true,
      version: true,
      kind: true,
      pricingMode: true,
      source: true,
      registrySourceId: true,
    },
  });

  if (!plugin || plugin.kind !== PAYMENT_PLUGIN_KIND || !plugin.channelCode) {
    throw new Error("插件不存在或未绑定支付通道。");
  }

  if (!plugin.installed || !plugin.enabled) {
    throw new Error("当前插件尚未在平台侧启用，暂时不能安装到商户工作台。");
  }

  // Req 15.1, 15.3, 15.4: For paid REMOTE_SIGNED plugins, verify the
  // merchant-scoped license before allowing the merchant to install. Look up
  // the most recent verified purchase record for this plugin and call the
  // Registry's verify endpoint with `merchantId`.
  if (plugin.pricingMode === "PAID" && plugin.source === "REMOTE_SIGNED") {
    const purchaseRecord = await prisma.pluginPurchaseRecord.findFirst({
      where: {
        pluginSlug: plugin.slug,
        licenseKey: { not: null },
        verifiedAt: { not: null },
      },
      orderBy: [{ verifiedAt: "desc" }],
      include: { source: true },
    });

    if (!purchaseRecord || !purchaseRecord.licenseKey || !purchaseRecord.source) {
      throw new MerchantPluginInstallError(
        "LICENSE_INVALID",
        "当前付费插件尚未完成平台级许可证验证，无法分配给商户。",
        409,
      );
    }

    const { verifyLicense } = await import("@/lib/plugins/license-client");
    const { revealStoredSecret } = await import("@/lib/secret-box");
    const { getSystemConfig } = await import("@/lib/system-config");
    const instanceId = await getSystemConfig("INSTANCE_ID");
    if (!instanceId) {
      throw new MerchantPluginInstallError(
        "LICENSE_INVALID",
        "实例 ID 未初始化，无法校验许可证。",
        500,
      );
    }

    const appKey = revealStoredSecret(purchaseRecord.source.appKeyCiphertext) ?? "";
    const verifyResult = await verifyLicense({
      licenseKey: purchaseRecord.licenseKey,
      pluginSlug: plugin.slug,
      version: plugin.version,
      instanceId,
      merchantId: input.merchantId,
      registryBaseUrl: purchaseRecord.source.baseUrl,
      appId: purchaseRecord.source.appId ?? "",
      appKey,
    });

    if (!verifyResult.valid) {
      if (verifyResult.reason === "MERCHANT_MISMATCH") {
        throw new MerchantPluginInstallError(
          "LICENSE_ASSIGNED_TO_OTHER_MERCHANT",
          "当前许可证已绑定其他商户，无法分配给该商户。",
          409,
          verifyResult.reason,
        );
      }
      throw new MerchantPluginInstallError(
        "LICENSE_INVALID",
        `许可证校验失败: ${verifyResult.reason} — ${verifyResult.message}`,
        409,
        verifyResult.reason,
      );
    }
  }

  await prisma.merchantInstalledPlugin.upsert({
    where: {
      merchantId_pluginSlug: {
        merchantId: input.merchantId,
        pluginSlug: plugin.slug,
      },
    },
    update: {},
    create: {
      merchantId: input.merchantId,
      pluginSlug: plugin.slug,
    },
  });

  return plugin;
}

export async function uninstallMerchantMarketplacePlugin(input: {
  merchantId: string;
  slug: string;
}) {
  await syncBuiltinMarketplacePlugins();
  const prisma = getPrismaClient();
  const plugin = await prisma.marketplacePlugin.findUnique({
    where: {
      slug: input.slug,
    },
    select: {
      id: true,
      slug: true,
      channelCode: true,
      displayName: true,
      version: true,
    },
  });

  if (!plugin?.channelCode) {
    throw new Error("插件不存在或未绑定支付通道。");
  }

  const usage = await getMerchantMarketplacePluginUsage(
    input.merchantId,
    plugin.channelCode,
  );

  if (usage.merchantAccountCount > 0 || usage.bindingCount > 0) {
    throw new Error(
      `当前商户仍有 ${usage.merchantAccountCount} 个通道实例、${usage.bindingCount} 个路由绑定依赖该插件，暂时不能卸载。请先清理当前商户的相关配置。`,
    );
  }

  await prisma.merchantInstalledPlugin.deleteMany({
    where: {
      merchantId: input.merchantId,
      pluginSlug: plugin.slug,
    },
  });

  return plugin;
}

export async function isMerchantPaymentPluginInstalled(
  merchantId: string,
  channelCode: string,
) {
  await syncMerchantInstalledPluginsFromUsage(merchantId);
  const platformPlugin = await getPrismaClient().marketplacePlugin.findFirst({
    where: {
      channelCode,
      kind: PAYMENT_PLUGIN_KIND,
    },
    select: {
      slug: true,
      installed: true,
      enabled: true,
    },
  });

  if (!platformPlugin) {
    return false;
  }

  const merchantPlugin = await getPrismaClient().merchantInstalledPlugin.findUnique({
    where: {
      merchantId_pluginSlug: {
        merchantId,
        pluginSlug: platformPlugin.slug,
      },
    },
    select: {
      id: true,
    },
  });

  return Boolean(
    platformPlugin.installed && platformPlugin.enabled && merchantPlugin?.id,
  );
}

export async function setMarketplacePluginInstalledState(input: {
  slug: string;
  installed: boolean;
  enabled?: boolean;
}) {
  await syncBuiltinMarketplacePlugins();
  const now = new Date();
  const state = await getMarketplacePluginSafetyState(input.slug);

  if (!state) {
    throw new Error("插件不存在。");
  }

  const shouldEnableWhenInstalled =
    input.installed
      ? state.source === "LOCAL_PACKAGE"
        ? false
        : state.runnable
          ? (input.enabled ?? true)
          : false
      : false;

  return getPrismaClient().marketplacePlugin.update({
    where: {
      slug: input.slug,
    },
    data: {
      installed: input.installed,
      enabled: shouldEnableWhenInstalled,
      installedAt: input.installed ? now : null,
      lastSyncedAt: now,
    },
  });
}

export async function setMarketplacePluginEnabledState(input: {
  slug: string;
  enabled: boolean;
}) {
  await syncBuiltinMarketplacePlugins();
  const state = await getMarketplacePluginSafetyState(input.slug);

  if (!state) {
    throw new Error("插件不存在。");
  }

  if (input.enabled && !state.runnable) {
    throw new Error(
      "当前本地插件包还只是清单接入状态，暂时不能启用为真实运行时实现。",
    );
  }

  return getPrismaClient().marketplacePlugin.update({
    where: {
      slug: input.slug,
    },
    data: {
      enabled: input.enabled,
      installed: input.enabled ? true : undefined,
      installedAt: input.enabled ? new Date() : undefined,
      lastSyncedAt: new Date(),
    },
  });
}

export async function getActivePaymentProvider(
  channelCode: string,
): Promise<PaymentProvider | null> {
  await syncBuiltinMarketplacePlugins();
  const localDefinitions = await loadLocalPaymentPluginDefinitionsMap();
  const plugin =
    getPaymentPlugin(channelCode) ??
    localDefinitions.get(channelCode)?.definition ??
    null;

  if (!plugin) {
    return null;
  }

  const row = await getPrismaClient().marketplacePlugin.findFirst({
    where: {
      channelCode,
      kind: PAYMENT_PLUGIN_KIND,
    },
    select: {
      installed: true,
      enabled: true,
    },
  });

  if (!row?.installed || !row.enabled) {
    return null;
  }

  return plugin.provider;
}

export async function listInstalledPaymentChannels() {
  try {
    const plugins = await listEnabledPaymentPluginDefinitions();
    return plugins.map((plugin) => plugin.provider.getSummary());
  } catch {
    return listBuiltinPaymentPlugins().map((plugin) => plugin.provider.getSummary());
  }
}

export async function listMerchantInstalledPaymentChannels(merchantId: string) {
  try {
    const plugins = await listMerchantEnabledPaymentPluginDefinitions(merchantId);
    return plugins.map((plugin) => plugin.provider.getSummary());
  } catch {
    return [];
  }
}

export async function listInstalledPaymentChannelOptions(
  locale: Locale = "zh",
): Promise<PaymentChannelOption[]> {
  try {
    const plugins = await listEnabledPaymentPluginDefinitions();
    return plugins.map((plugin) => resolvePaymentChannelOption(plugin, locale));
  } catch {
    return listBuiltinPaymentPlugins().map((plugin) =>
      resolvePaymentChannelOption(plugin, locale),
    );
  }
}

export async function listMerchantInstalledPaymentChannelOptions(
  merchantId: string,
  locale: Locale = "zh",
): Promise<PaymentChannelOption[]> {
  try {
    const plugins = await listMerchantEnabledPaymentPluginDefinitions(merchantId);
    return plugins.map((plugin) => resolvePaymentChannelOption(plugin, locale));
  } catch {
    return [];
  }
}

export async function listInstalledMerchantChannelTemplates(
  locale: Locale = "zh",
): Promise<MerchantChannelTemplate[]> {
  try {
    const plugins = await listEnabledPaymentPluginDefinitions();
    return plugins.map((plugin) => resolveMerchantChannelTemplate(plugin, locale));
  } catch {
    return listBuiltinPaymentPlugins().map((plugin) =>
      resolveMerchantChannelTemplate(plugin, locale),
    );
  }
}

export async function listMerchantInstalledMerchantChannelTemplates(
  merchantId: string,
  locale: Locale = "zh",
): Promise<MerchantChannelTemplate[]> {
  try {
    const plugins = await listMerchantEnabledPaymentPluginDefinitions(merchantId);
    return plugins.map((plugin) => resolveMerchantChannelTemplate(plugin, locale));
  } catch {
    return [];
  }
}

export async function getInstalledMerchantChannelTemplate(
  channelCode: string,
  locale: Locale = "zh",
): Promise<MerchantChannelTemplate | null> {
  try {
    await syncBuiltinMarketplacePlugins();
    const localDefinitions = await loadLocalPaymentPluginDefinitionsMap();
    const plugin =
      getPaymentPlugin(channelCode) ??
      localDefinitions.get(channelCode)?.definition ??
      null;

    if (!plugin) {
      return null;
    }

    const row = await getPrismaClient().marketplacePlugin.findFirst({
      where: {
        channelCode,
        kind: PAYMENT_PLUGIN_KIND,
      },
      select: {
        installed: true,
        enabled: true,
      },
    });

    if (!row?.installed || !row.enabled) {
      return null;
    }

    return resolveMerchantChannelTemplate(plugin, locale);
  } catch {
    const plugin = getPaymentPlugin(channelCode);
    return plugin ? resolveMerchantChannelTemplate(plugin, locale) : null;
  }
}

export async function getMerchantInstalledMerchantChannelTemplate(
  merchantId: string,
  channelCode: string,
  locale: Locale = "zh",
): Promise<MerchantChannelTemplate | null> {
  try {
    const installed = await isMerchantPaymentPluginInstalled(merchantId, channelCode);

    if (!installed) {
      return null;
    }

    const localDefinitions = await loadLocalPaymentPluginDefinitionsMap();
    const plugin =
      getPaymentPlugin(channelCode) ??
      localDefinitions.get(channelCode)?.definition ??
      null;
    return plugin ? resolveMerchantChannelTemplate(plugin, locale) : null;
  } catch {
    return null;
  }
}
