/**
 * Process-wide runtime state for the Registry dev/demo server.
 *
 * Phase 1-3 keeps everything in memory so the API surface can be exercised
 * without provisioning Postgres/object storage. This module owns the single
 * keyStore / signer / revocations / orders / ledger / bundles instances so
 * routes that need to share state (catalog ↔ packages ↔ /licenses/verify)
 * resolve to the same maps.
 *
 * On first import we:
 *   - generate one ACTIVE Ed25519 signing key
 *   - build a couple of demo plugin packages with real sha256 + Ed25519
 *     signatures so consumers can perform a full install round-trip
 *
 * Production deployments will replace this with Prisma-backed singletons.
 */

import { sign as cryptoSignRaw, type KeyObject } from "node:crypto";
import { createHash } from "node:crypto";
import {
  createInMemorySigningKeyStore,
  type SigningKeyRecord,
  type SigningKeyStore,
} from "../signing/key-store";
import {
  createLocalKeyPairAdapter,
  rotateSigningKey,
  type RotationKeyPair,
} from "../signing/rotation";
import { createSigner, type Ed25519Signer } from "../signing/signer";
import {
  createInMemoryRevocationStore,
  type RevocationStore,
} from "../licensing/revocation";
import {
  createInMemoryOrderStore,
  type OrderStore,
} from "../payments/order-service";
import {
  createInMemoryBalanceLedger,
  type BalanceLedger,
} from "../payouts/balance-ledger";
import {
  createInMemoryAuditLogger,
  type AuditLogger,
} from "../audit/log";
import type { ConsumerLookup, ConsumerRecord } from "../auth/consumer-app-key";
import { runBundlePipeline, type BundlePipelineResult } from "../bundle/pipeline";
import {
  createInMemoryObjectStore,
  type ObjectStoreClient,
} from "../storage/object-store";

interface DemoBundleSeed {
  slug: string;
  /**
   * Stored bundle pipeline output: includes manifest, sha256, signature,
   * signatureKeyId, etc. Available for `/api/registry/packages/:slug/:version`.
   */
  pipelineResult: BundlePipelineResult;
  /** Original raw bytes of the bundle for download/streaming. */
  rawBytes: Buffer;
  /** Catalog metadata (re-emitted by /api/registry/plugins). */
  catalogEntry: CatalogEntry;
}

export interface CatalogEntry {
  remotePluginId: string;
  slug: string;
  kind: "PAYMENT_CHANNEL";
  channelCode: string;
  providerKey: string;
  packageName: string;
  displayName: string;
  vendor: string;
  description: string;
  version: string;
  latestVersion: string;
  runtimeMode: "RUNNABLE" | "MANIFEST_ONLY";
  pricingMode: "FREE" | "PAID";
  priceLabel: string | null;
  purchaseUrl: string | null;
  capabilities: string[];
  metadata: Record<string, unknown>;
}

export interface RegistryRuntimeState {
  keyStore: SigningKeyStore;
  signer: Ed25519Signer;
  signingPrivateKey: KeyObject;
  signingKeyPair: RotationKeyPair;
  revocations: RevocationStore;
  orderStore: OrderStore;
  ledger: BalanceLedger;
  auditLogger: AuditLogger;
  objectStore: ObjectStoreClient;
  /** Demo plugin bundles keyed by `${slug}@${version}` */
  demoBundles: Map<string, DemoBundleSeed>;
  /** Catalog in the order it should appear in `/api/registry/plugins` */
  catalog: CatalogEntry[];
  /** Consumer lookup for `x-novapay-registry-app-id/key` authentication */
  consumers: ConsumerLookup & {
    register(input: { instanceId: string; appId: string; appKey: string; displayName: string }): void;
  };
}

let state: RegistryRuntimeState | null = null;
let initPromise: Promise<RegistryRuntimeState> | null = null;

/**
 * When `REGISTRY_STORE_DRIVER=prisma`, the runtime uses Prisma-backed stores
 * connected to the Registry Postgres database. Otherwise falls back to the
 * in-memory stores (suitable for dev/test).
 */
function shouldUsePrisma(): boolean {
  return process.env.REGISTRY_STORE_DRIVER === "prisma";
}

function buildDemoBundle(opts: {
  slug: string;
  channelCode: string;
  packageName: string;
  displayName: string;
  vendor: string;
  description: string;
  version: string;
  pricingMode: "FREE" | "PAID";
  priceLabel: string | null;
  purchaseUrl: string | null;
  category: { zh: string; en: string };
  summary: { zh: string; en: string };
  detail: { zh: string; en: string };
  runtimeJs: string;
}): { rawBytes: Buffer; catalogEntry: CatalogEntry } {
  const manifest = {
    manifestVersion: 1,
    slug: opts.slug,
    kind: "PAYMENT_CHANNEL",
    channelCode: opts.channelCode,
    providerKey: "crypto",
    packageName: opts.packageName,
    displayName: opts.displayName,
    vendor: opts.vendor,
    description: opts.description,
    version: opts.version,
    capabilities: ["native_qr", "return_url", "order_close"],
    category: opts.category,
    summary: opts.summary,
    detail: opts.detail,
    supportsCallbackRoute: false,
    requiresMerchantProfileCompletion: false,
    runtimeEntrypoint: "./runtime.js",
  };

  const bundleJson = JSON.stringify({
    manifest,
    files: [{ path: "runtime.js", content: opts.runtimeJs }],
  });

  const rawBytes = Buffer.from(bundleJson, "utf8");

  const catalogEntry: CatalogEntry = {
    remotePluginId: opts.slug,
    slug: opts.slug,
    kind: "PAYMENT_CHANNEL",
    channelCode: opts.channelCode,
    providerKey: "crypto",
    packageName: opts.packageName,
    displayName: opts.displayName,
    vendor: opts.vendor,
    description: opts.description,
    version: opts.version,
    latestVersion: opts.version,
    runtimeMode: "RUNNABLE",
    pricingMode: opts.pricingMode,
    priceLabel: opts.priceLabel,
    purchaseUrl: opts.purchaseUrl,
    capabilities: ["native_qr", "return_url", "order_close"],
    metadata: {
      category: opts.category,
      summary: opts.summary,
      description: opts.detail,
    },
  };

  return { rawBytes, catalogEntry };
}

async function initState(): Promise<RegistryRuntimeState> {
  const usePrisma = shouldUsePrisma();

  // When Prisma driver is selected, swap stores below for Prisma-backed
  // implementations. The signing key + demo bundles still seed in-process
  // for now (catalog + demo bundles will move to PluginRecord/PluginVersion
  // tables in a follow-up). The data-only stores (revocations, orders,
  // ledger, audit, consumers) switch over fully.
  let prismaStores: ReturnType<typeof import("./prisma-stores").createPrismaStores> | null = null;
  if (usePrisma) {
    try {
      const { getPrismaClient } = await import("./prisma-client");
      const { createPrismaStores } = await import("./prisma-stores");
      const prisma = await getPrismaClient();
      if (prisma) {
        prismaStores = createPrismaStores(prisma as Parameters<typeof createPrismaStores>[0]);
      } else {
        console.warn(
          "[registry] REGISTRY_STORE_DRIVER=prisma but Prisma client could not be loaded — falling back to in-memory stores. Run `prisma generate` first.",
        );
      }
    } catch (err) {
      console.warn(
        "[registry] Failed to initialise Prisma stores — falling back to in-memory:",
        err instanceof Error ? err.message : err,
      );
    }
  }

  const keyStore = createInMemorySigningKeyStore();
  const adapter = createLocalKeyPairAdapter();
  const rotation = await rotateSigningKey(
    {
      keyId: `key-runtime-${Date.now().toString(36)}`,
    },
    keyStore,
    adapter,
  );

  if (!rotation.keyPair.privateKey) {
    throw new Error("Local key adapter did not expose a private key.");
  }
  const signingPrivateKey = rotation.keyPair.privateKey;

  const signer = createSigner({
    adapter: {
      async signRaw({ rawBytes }) {
        return cryptoSignRaw(null, rawBytes, signingPrivateKey);
      },
    },
  });

  const objectStore = createInMemoryObjectStore();
  const revocations = createInMemoryRevocationStore();
  const orderStore = createInMemoryOrderStore();
  const ledger = createInMemoryBalanceLedger();
  const auditLogger = createInMemoryAuditLogger();

  const seeds: Array<Parameters<typeof buildDemoBundle>[0]> = [
    {
      slug: "remote.demo-runnable-crypto",
      channelCode: "crypto.remote-runnable",
      packageName: "@novapay/remote-demo-runnable",
      displayName: "Remote Demo Runnable Plugin",
      vendor: "NovaPay Demo Team",
      description:
        "A signed remote registry plugin used to validate registry sync, install, and runtime loading.",
      version: "0.1.0",
      pricingMode: "FREE",
      priceLabel: "Free",
      purchaseUrl: null,
      category: { zh: "远程插件", en: "Remote Plugin" },
      summary: {
        zh: "用于验证远程插件商店同步与安装流程的示例插件。",
        en: "Example plugin used to validate remote registry sync and install flows.",
      },
      detail: {
        zh: "通过远程商店暴露，用于验证目录同步、插件包下载和平台安装。",
        en: "Exposed through the remote registry to validate directory sync, package download, and platform installation.",
      },
      runtimeJs: `export const pluginRuntime = {
  provider: {
    getSummary() { return { code: "crypto.remote-runnable", provider: "crypto", displayName: "Remote Demo Runnable Plugin", description: "Remote demo runnable provider.", configured: false, implementationStatus: "ready", capabilities: ["native_qr", "return_url", "order_close"] }; },
    isConfigured(account) { return Boolean(account?.config?.walletAddress); },
    async createPayment(input) { return { status: "requires_action", mode: "qr_code", checkoutUrl: input.account?.config?.walletAddress ?? "remote-demo-address", providerStatus: "AWAITING_TRANSFER", providerPayload: {} }; },
    async closePayment(input) { return { orderId: input.orderId, gatewayOrderId: input.gatewayOrderId ?? null, providerStatus: "CLOSED", amount: input.amount, paidAt: null, succeeds: false, rawPayload: {} }; }
  },
  adminOption: { title: { zh: "远程示例可运行插件", en: "Remote Demo Runnable Plugin" }, detail: { zh: "通过远程商店安装的可运行示例插件。", en: "Runnable example plugin installed via the remote registry." } },
  merchantTemplate: { title: { zh: "远程示例可运行插件", en: "Remote Demo Runnable Plugin" }, description: { zh: "填写示例收款地址即可完成最小配置。", en: "Provide a demo receiving address." }, fields: [{ key: "walletAddress", label: { zh: "示例收款地址", en: "Demo Receiving Address" }, required: true, placeholder: { zh: "remote-demo-address", en: "remote-demo-address" } }] }
};`,
    },
    {
      slug: "remote.demo-paid-crypto",
      channelCode: "crypto.remote-paid",
      packageName: "@novapay/remote-demo-paid",
      displayName: "Remote Demo Paid Plugin",
      vendor: "NovaPay Demo Team",
      description:
        "A paid signed remote plugin example demonstrating license-issued install flow.",
      version: "0.2.0",
      pricingMode: "PAID",
      priceLabel: "¥99 / instance",
      purchaseUrl: "https://example.com/checkout/remote-demo-paid",
      category: { zh: "远程插件", en: "Remote Plugin" },
      summary: {
        zh: "用于验证收费插件购买与安装流程的示例插件。",
        en: "Example plugin used to validate paid-plugin purchase and install flows.",
      },
      detail: {
        zh: "通过远程商店暴露，用于验证收费插件许可证发放与校验流程。",
        en: "Exposed through the remote registry to validate paid license issuance and verification.",
      },
      runtimeJs: `export const pluginRuntime = {
  provider: {
    getSummary() { return { code: "crypto.remote-paid", provider: "crypto", displayName: "Remote Demo Paid Plugin", description: "Remote paid runnable provider.", configured: false, implementationStatus: "ready", capabilities: ["native_qr", "return_url", "order_close"] }; },
    isConfigured(account) { return Boolean(account?.config?.walletAddress); },
    async createPayment(input) { return { status: "requires_action", mode: "qr_code", checkoutUrl: input.account?.config?.walletAddress ?? "remote-paid-address", providerStatus: "AWAITING_TRANSFER", providerPayload: {} }; },
    async closePayment(input) { return { orderId: input.orderId, gatewayOrderId: input.gatewayOrderId ?? null, providerStatus: "CLOSED", amount: input.amount, paidAt: null, succeeds: false, rawPayload: {} }; }
  },
  adminOption: { title: { zh: "远程收费示例插件", en: "Remote Demo Paid Plugin" }, detail: { zh: "通过远程商店安装的收费示例插件。", en: "Paid example plugin installed via the remote registry." } },
  merchantTemplate: { title: { zh: "远程收费示例插件", en: "Remote Demo Paid Plugin" }, description: { zh: "填写示例收款地址即可完成最小配置。", en: "Provide a demo receiving address." }, fields: [{ key: "walletAddress", label: { zh: "示例收款地址", en: "Demo Receiving Address" }, required: true, placeholder: { zh: "remote-paid-address", en: "remote-paid-address" } }] }
};`,
    },
  ];

  const demoBundles = new Map<string, DemoBundleSeed>();
  const catalog: CatalogEntry[] = [];

  // Consumer store — seed a default consumer for local dev so the main
  // NovaPay app can authenticate against the Registry out of the box.
  const consumerRecords = new Map<string, ConsumerRecord>();
  const defaultAppKey = process.env.REGISTRY_DEFAULT_APP_KEY ?? "novapay-dev-secret";
  const defaultAppKeyHash = createHash("sha256").update(defaultAppKey).digest("hex");
  consumerRecords.set("novapay-admin", {
    instanceId: "inst_local-dev",
    appId: "novapay-admin",
    appKeyHash: defaultAppKeyHash,
    enabled: true,
    rateLimitPerMin: 600,
  });

  const consumers = {
    async findByAppId(appId: string): Promise<ConsumerRecord | null> {
      return consumerRecords.get(appId) ?? null;
    },
    register(input: { instanceId: string; appId: string; appKey: string; displayName: string }) {
      const hash = createHash("sha256").update(input.appKey).digest("hex");
      consumerRecords.set(input.appId, {
        instanceId: input.instanceId,
        appId: input.appId,
        appKeyHash: hash,
        enabled: true,
        rateLimitPerMin: 600,
      });
    },
  };

  for (const seed of seeds) {
    const built = buildDemoBundle(seed);
    const pipelineResult = await runBundlePipeline(
      { rawBytes: built.rawBytes, contentType: "application/json" },
      { objectStore, signer, keyStore },
    );

    // Backfill catalog entry with the real checksum / signature so consumers
    // can verify the bundle without a separate package-detail request.
    const catalogEntry: CatalogEntry = {
      ...built.catalogEntry,
      metadata: {
        ...built.catalogEntry.metadata,
      },
    };

    demoBundles.set(`${seed.slug}@${seed.version}`, {
      slug: seed.slug,
      pipelineResult,
      rawBytes: built.rawBytes,
      catalogEntry,
    });
    catalog.push(catalogEntry);
  }

  return {
    keyStore,
    signer,
    signingPrivateKey,
    signingKeyPair: rotation.keyPair,
    revocations: prismaStores?.revocationStore ?? revocations,
    orderStore: prismaStores?.orderStore ?? orderStore,
    ledger: prismaStores?.ledger ?? ledger,
    auditLogger: prismaStores?.auditLogger ?? auditLogger,
    objectStore,
    demoBundles,
    catalog,
    consumers: prismaStores?.consumerLookup
      ? Object.assign({}, prismaStores.consumerLookup, {
          register: consumers.register, // keep in-memory register for dev
        })
      : consumers,
  };
}

export async function getRegistryRuntime(): Promise<RegistryRuntimeState> {
  if (state) return state;
  if (!initPromise) {
    initPromise = initState().then((value) => {
      state = value;
      return value;
    });
  }
  return initPromise;
}

/**
 * Synchronously returns the runtime if it's already initialised. Most route
 * handlers should prefer `getRegistryRuntime()`; this helper exists for
 * places that cannot `await` (none in phase 3 yet).
 */
export function peekRegistryRuntime(): RegistryRuntimeState | null {
  return state;
}

export interface DemoBundleResolution {
  slug: string;
  version: string;
  sha256: string;
  signature: string;
  signatureKeyId: string;
  storageKey: string;
  sizeBytes: number;
}

export function describeDemoBundle(
  state: RegistryRuntimeState,
  slug: string,
  version: string,
): DemoBundleResolution | null {
  const bundle = state.demoBundles.get(`${slug}@${version}`);
  if (!bundle) return null;
  return {
    slug,
    version,
    sha256: bundle.pipelineResult.sha256,
    signature: bundle.pipelineResult.signature,
    signatureKeyId: bundle.pipelineResult.signatureKeyId,
    storageKey: bundle.pipelineResult.storageKey,
    sizeBytes: bundle.pipelineResult.sizeBytes,
  };
}

export function getDemoBundleRawBytes(
  state: RegistryRuntimeState,
  slug: string,
  version: string,
): Buffer | null {
  return state.demoBundles.get(`${slug}@${version}`)?.rawBytes ?? null;
}

/**
 * Reset the runtime state. Tests use this to start each test with a clean
 * keyStore / orderStore / ledger; production never calls it.
 */
export function __resetRegistryRuntimeForTests() {
  state = null;
  initPromise = null;
}

/** Reference to the SigningKeyRecord type re-exported for convenience. */
export type { SigningKeyRecord };
