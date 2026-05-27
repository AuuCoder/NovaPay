/**
 * Process-wide runtime state for the Registry server.
 *
 * Phase 1-3 keeps everything in memory so the API surface can be exercised
 * without provisioning Postgres/object storage. This module owns the single
 * keyStore / signer / revocations / orders / ledger / bundles instances so
 * routes that need to share state (catalog ↔ packages ↔ /licenses/verify)
 * resolve to the same maps.
 *
 * On first import we:
 *   - generate one ACTIVE Ed25519 signing key
 *   - load published plugin bundles with real sha256 + Ed25519 signatures
 *     so consumers can perform a full install round-trip
 *
 * Production deployments will replace this with Prisma-backed singletons.
 */

import { sign as cryptoSignRaw, type KeyObject } from "node:crypto";
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
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
import {
  loadLocalSigningMaterialByKeyId,
  persistLocalSigningKeyPair,
} from "../signing/local-material-store";
import { createSigner, type Ed25519Signer } from "../signing/signer";
import {
  createInMemoryRevocationStore,
  createPrismaRevocationStore,
  type RevocationStore,
} from "../licensing/revocation";
import {
  createInMemoryLicenseStore,
  createPrismaLicenseStore,
  type LicenseStore,
} from "../licensing/store";
import {
  createInMemoryOrderStore,
  createPrismaOrderStore,
  type OrderStore,
} from "../payments/order-service";
import {
  createInMemoryBalanceLedger,
  createPrismaBalanceLedger,
  type BalanceLedger,
} from "../payouts/balance-ledger";
import {
  createInMemoryAuditLogger,
  AUDIT_ACTIONS,
  type AuditLogger,
} from "../audit/log";
import type { ConsumerLookup, ConsumerRecord } from "../auth/consumer-app-key";
import { runBundlePipeline, type BundlePipelineResult } from "../bundle/pipeline";
import {
  createObjectStoreClient,
  type ObjectStoreClient,
} from "../storage/object-store";
import { isOfficialPluginSlug, OFFICIAL_DEVELOPER_ID } from "../plugins/official";
import { getSettlementSettings } from "../settlement/settings";
import type {
  VerificationProfile,
  VerificationRequiredCheck,
} from "../manifest/parse";
import type { ReviewState } from "../review/state-machine";
import type { ScanResult } from "../static-scan/ast-scan";

interface BundleSeed {
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

export type RegistryPaidPricingPlanKind =
  | "PER_INSTANCE_ONE_TIME"
  | "PER_MERCHANT_SUBSCRIPTION"
  | "PER_USAGE";

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
  pricingPlanKind: RegistryPaidPricingPlanKind | null;
  priceAmountCents: number | null;
  priceCurrency: string | null;
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
  activateSigningKeyPair(keyPair: RotationKeyPair): void;
  revocations: RevocationStore;
  licenseStore: LicenseStore;
  orderStore: OrderStore;
  ledger: BalanceLedger;
  auditLogger: AuditLogger;
  objectStore: ObjectStoreClient;
  /** Published plugin bundles keyed by `${slug}@${version}` */
  demoBundles: Map<string, BundleSeed>;
  /** Version state keyed by `${slug}@${version}` */
  pluginVersions: Map<string, PluginVersionRecord>;
  /** Catalog in the order it should appear in `/api/registry/plugins` */
  catalog: CatalogEntry[];
  /** In-memory verification sessions keyed by session id */
  verificationSessions: Map<string, PluginVersionTestSession>;
  /** Consumer lookup for `x-novapay-registry-app-id/key` authentication */
  consumers: ConsumerLookup & {
    register(input: { instanceId: string; appId: string; appKey: string; displayName: string }): void;
  };
}

export interface UploadedCatalogRegistrationInput {
  rawBytes: Buffer;
  pipelineResult: BundlePipelineResult;
  pricingMode: "FREE" | "PAID";
  pricingPlanKind: RegistryPaidPricingPlanKind | null;
  priceAmountCents: number | null;
  priceCurrency: string | null;
  priceLabel: string | null;
  purchaseUrl: string | null;
  reviewState?: ReviewState;
}

interface PersistedRemoteBundleFile {
  registryMeta?: {
    pricingMode?: "FREE" | "PAID";
    pricingPlanKind?: RegistryPaidPricingPlanKind | null;
    priceAmountCents?: number | null;
    priceCurrency?: string | null;
    priceLabel?: string | null;
    purchaseUrl?: string | null;
  };
}

const REGISTRY_PROJECT_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
);
const OFFICIAL_DEVELOPER_EMAIL = "official@plugin.novapay.local";

interface RuntimePersistenceSnapshot {
  pluginVersions: Array<{
    slug: string;
    version: string;
    reviewState: ReviewState;
    pricingMode: "FREE" | "PAID";
    pricingPlanKind: RegistryPaidPricingPlanKind | null;
    priceAmountCents: number | null;
    priceCurrency: string | null;
    priceLabel: string | null;
    purchaseUrl: string | null;
    scanResult: ScanResult | null;
    publishedAt: string | null;
    createdAt: string;
    updatedAt: string;
  }>;
  verificationSessions: Array<{
    id: string;
    pluginSlug: string;
    version: string;
    status: PluginVersionTestSessionStatus;
    verificationProfile: VerificationProfile;
    submittedConfig: Record<string, string>;
    steps: Array<{
      id: string;
      sessionId: string;
      stepKey: VerificationRequiredCheck;
      status: PluginVersionTestStepStatus;
      startedAt: string | null;
      completedAt: string | null;
      errorMessage: string | null;
      resultSnapshot: Record<string, unknown> | null;
    }>;
    startedAt: string | null;
    completedAt: string | null;
    expiresAt: string | null;
    failureReason: string | null;
    resultSnapshot: Record<string, unknown> | null;
    createdAt: string;
    updatedAt: string;
  }>;
}

export type PluginVersionTestSessionStatus =
  | "DRAFT"
  | "RUNNING"
  | "WAITING_MANUAL_PAYMENT"
  | "PASSED"
  | "FAILED"
  | "EXPIRED";

export type PluginVersionTestStepStatus =
  | "PENDING"
  | "RUNNING"
  | "PASSED"
  | "FAILED"
  | "SKIPPED";

export interface PluginVersionTestStep {
  id: string;
  sessionId: string;
  stepKey: VerificationRequiredCheck;
  status: PluginVersionTestStepStatus;
  startedAt: Date | null;
  completedAt: Date | null;
  errorMessage: string | null;
  resultSnapshot: Record<string, unknown> | null;
}

export interface PluginVersionTestSession {
  id: string;
  pluginSlug: string;
  version: string;
  status: PluginVersionTestSessionStatus;
  verificationProfile: VerificationProfile;
  submittedConfig: Record<string, string>;
  steps: PluginVersionTestStep[];
  startedAt: Date | null;
  completedAt: Date | null;
  expiresAt: Date | null;
  failureReason: string | null;
  resultSnapshot: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface PluginVersionRecord {
  slug: string;
  version: string;
  reviewState: ReviewState;
  pricingMode: "FREE" | "PAID";
  pricingPlanKind: RegistryPaidPricingPlanKind | null;
  priceAmountCents: number | null;
  priceCurrency: string | null;
  priceLabel: string | null;
  purchaseUrl: string | null;
  scanResult: ScanResult | null;
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

let state: RegistryRuntimeState | null = null;
let initPromise: Promise<RegistryRuntimeState> | null = null;

/**
 * Registry runtime no longer reads/writes any `.tmp/*.json` files. Plugin
 * versions, verification sessions, ledger entries, license records, etc. all
 * live in Postgres via Prisma. The helpers below remain as no-ops so existing
 * call sites compile until they migrate to Prisma-backed persistence.
 */
function loadRuntimePersistence(): RuntimePersistenceSnapshot {
  return { pluginVersions: [], verificationSessions: [] };
}

function saveRuntimePersistence(_state: RegistryRuntimeState) {
  // Plugin versions and verification sessions persist via Prisma in the
  // Registry database. The in-process Maps are reseeded from Prisma on
  // every cold start by `seedFromPrisma()` inside `initState()`.
}

function isRegistryPaidPricingPlanKind(
  value: unknown,
): value is RegistryPaidPricingPlanKind {
  return (
    value === "PER_INSTANCE_ONE_TIME" ||
    value === "PER_MERCHANT_SUBSCRIPTION" ||
    value === "PER_USAGE"
  );
}

function normalizePriceCurrency(value: string | null | undefined) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toUpperCase();
  return /^[A-Z]{3}$/.test(normalized) ? normalized : null;
}

function formatCurrencyAmount(
  priceAmountCents: number,
  priceCurrency: string,
  locale: "zh" | "en",
) {
  try {
    return new Intl.NumberFormat(locale === "zh" ? "zh-CN" : "en-US", {
      style: "currency",
      currency: priceCurrency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(priceAmountCents / 100);
  } catch {
    return `${priceCurrency} ${(priceAmountCents / 100).toFixed(2)}`;
  }
}

function getPricingPlanSuffix(
  pricingPlanKind: RegistryPaidPricingPlanKind,
  locale: "zh" | "en",
) {
  switch (pricingPlanKind) {
    case "PER_INSTANCE_ONE_TIME":
      return locale === "zh" ? "/实例" : "/ instance";
    case "PER_MERCHANT_SUBSCRIPTION":
      return locale === "zh" ? "/商户/月" : "/ merchant / month";
    case "PER_USAGE":
      return locale === "zh" ? "/次" : "/ usage unit";
  }
}

export function resolveCatalogPaidPricing(
  input: Pick<
    CatalogEntry,
    "pricingMode" | "pricingPlanKind" | "priceAmountCents" | "priceCurrency"
  >,
): {
  pricingPlanKind: RegistryPaidPricingPlanKind;
  priceAmountCents: number;
  priceCurrency: string;
} | null {
  if (input.pricingMode !== "PAID") {
    return null;
  }

  const priceAmountCents = input.priceAmountCents;
  const priceCurrency = input.priceCurrency;

  if (
    !input.pricingPlanKind ||
    typeof priceAmountCents !== "number" ||
    !Number.isInteger(priceAmountCents) ||
    priceAmountCents <= 0 ||
    !priceCurrency
  ) {
    return null;
  }

  return {
    pricingPlanKind: input.pricingPlanKind,
    priceAmountCents,
    priceCurrency,
  };
}

export function formatRegistryPluginPricing(
  input: Pick<
    CatalogEntry,
    | "pricingMode"
    | "pricingPlanKind"
    | "priceAmountCents"
    | "priceCurrency"
    | "priceLabel"
  >,
  locale: "zh" | "en",
) {
  if (input.pricingMode === "FREE") {
    return locale === "zh" ? "免费" : "Free";
  }

  const resolved = resolveCatalogPaidPricing(input);
  if (resolved) {
    return `${formatCurrencyAmount(
      resolved.priceAmountCents,
      resolved.priceCurrency,
      locale,
    )} ${getPricingPlanSuffix(resolved.pricingPlanKind, locale)}`;
  }

  if (input.priceLabel?.trim()) {
    return input.priceLabel.trim();
  }

  return locale === "zh" ? "收费插件" : "Paid plugin";
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
  pricingPlanKind?: RegistryPaidPricingPlanKind | null;
  priceAmountCents?: number | null;
  priceCurrency?: string | null;
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
    pricingPlanKind: opts.pricingPlanKind ?? null,
    priceAmountCents: opts.priceAmountCents ?? null,
    priceCurrency: opts.priceCurrency ?? null,
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

async function loadPersistedRemoteBundles(input: {
  rootDir: string;
  objectStore: ObjectStoreClient;
  signer: Ed25519Signer;
  keyStore: SigningKeyStore;
}) {
  const artifactsDir = path.join(
    path.resolve(input.rootDir, "..", ".."),
    "artifacts",
    "remote-plugin-bundles",
  );

  let fileNames: string[] = [];
  try {
    fileNames = (await readdir(artifactsDir)).filter((fileName) => fileName.endsWith(".json"));
  } catch {
    return [];
  }

  const bundles: UploadedCatalogRegistrationInput[] = [];

  for (const fileName of fileNames) {
    const absolutePath = path.join(artifactsDir, fileName);
    const rawText = await readFile(absolutePath, "utf8");
    const parsed = JSON.parse(rawText) as PersistedRemoteBundleFile;
    const rawBytes = Buffer.from(rawText, "utf8");
    const pipelineResult = await runBundlePipeline(
      { rawBytes, contentType: "application/json" },
      {
        objectStore: input.objectStore,
        signer: input.signer,
        keyStore: input.keyStore,
      },
    );

    bundles.push({
      rawBytes,
      pipelineResult,
      pricingMode: parsed.registryMeta?.pricingMode ?? "FREE",
      pricingPlanKind: isRegistryPaidPricingPlanKind(parsed.registryMeta?.pricingPlanKind)
        ? parsed.registryMeta?.pricingPlanKind
        : null,
      priceAmountCents:
        typeof parsed.registryMeta?.priceAmountCents === "number" &&
        Number.isInteger(parsed.registryMeta.priceAmountCents)
          ? parsed.registryMeta.priceAmountCents
          : null,
      priceCurrency: normalizePriceCurrency(parsed.registryMeta?.priceCurrency),
      priceLabel: parsed.registryMeta?.priceLabel ?? null,
      purchaseUrl: parsed.registryMeta?.purchaseUrl ?? null,
    });
  }

  return bundles;
}

async function initState(): Promise<RegistryRuntimeState> {
  // Registry runtime now requires Postgres for persistence. The in-memory
  // stores are only used as graceful fallback when the Prisma client cannot
  // be loaded (e.g. unit tests) — production must always have a database.
  let prismaStores: ReturnType<typeof import("./prisma-stores").createPrismaStores> | null = null;
  let prismaForStores: unknown = null;
  try {
    const { getPrismaClient } = await import("./prisma-client");
    const { createPrismaStores } = await import("./prisma-stores");
    const prisma = await getPrismaClient();
    if (prisma) {
      prismaForStores = prisma;
      const prismaLike = prisma as {
        developer?: {
          upsert(args: unknown): Promise<unknown>;
        };
      };
      if (prismaLike.developer) {
        await prismaLike.developer.upsert({
          where: { id: OFFICIAL_DEVELOPER_ID },
          update: {
            email: OFFICIAL_DEVELOPER_EMAIL,
            displayName: "NovaPay Official",
            contact: { source: "system" },
            status: "ACTIVE",
          },
          create: {
            id: OFFICIAL_DEVELOPER_ID,
            email: OFFICIAL_DEVELOPER_EMAIL,
            displayName: "NovaPay Official",
            contact: { source: "system" },
            status: "ACTIVE",
            passwordHash: "official-system-account",
          },
        });
      }
      prismaStores = createPrismaStores(prisma as Parameters<typeof createPrismaStores>[0]);
    } else {
      console.warn(
        "[registry] Prisma client could not be loaded — falling back to in-memory stores. Set REGISTRY_DATABASE_URL or DATABASE_URL and run `prisma migrate deploy`.",
      );
    }
  } catch (err) {
    console.warn(
      "[registry] Failed to initialise Prisma stores — falling back to in-memory:",
      err instanceof Error ? err.message : err,
    );
  }

  const keyStore = prismaStores?.signingKeyStore ?? createInMemorySigningKeyStore();
  const adapter = createLocalKeyPairAdapter();
  let rotation: Awaited<ReturnType<typeof rotateSigningKey>> | null = null;
  let currentKeyPair: RotationKeyPair | null = null;

  try {
    const activeKey = await keyStore.getActive();
    const material = await loadLocalSigningMaterialByKeyId(activeKey.keyId);
    if (material?.privateKey) {
      currentKeyPair = {
        keyId: material.keyId,
        publicKey: material.publicKey,
        kmsKeyArn: material.kmsKeyArn,
        privateKey: material.privateKey,
      };
    }
  } catch {
    // No active key yet; bootstrap below.
  }

  if (!currentKeyPair) {
    rotation = await rotateSigningKey(
      {
        keyId: `key-runtime-${Date.now().toString(36)}`,
      },
      keyStore,
      adapter,
    );
    await persistLocalSigningKeyPair(rotation.keyPair);
    currentKeyPair = rotation.keyPair;
  }

  if (!currentKeyPair?.privateKey) {
    throw new Error("No local signing private key material is available for the active key.");
  }

  let currentSigningPrivateKey = currentKeyPair.privateKey;

  const signer = createSigner({
    adapter: {
      async signRaw({ rawBytes }) {
        return cryptoSignRaw(null, rawBytes, currentSigningPrivateKey);
      },
    },
  });

  const objectStore = createObjectStoreClient({
    bucket: process.env.S3_BUCKET ?? "novapay-registry-packages",
    region: process.env.S3_REGION ?? "us-east-1",
    accessKeyId: process.env.S3_ACCESS_KEY_ID ?? "",
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? "",
    endpoint: process.env.S3_ENDPOINT_URL,
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
    publicBaseUrl: process.env.REGISTRY_OBJECT_PUBLIC_BASE_URL,
  });

  const revocations: RevocationStore = prismaForStores
    ? createPrismaRevocationStore(
        prismaForStores as Parameters<typeof createPrismaRevocationStore>[0],
      )
    : createInMemoryRevocationStore();
  const licenseStore: LicenseStore = prismaForStores
    ? createPrismaLicenseStore(
        prismaForStores as Parameters<typeof createPrismaLicenseStore>[0],
      )
    : createInMemoryLicenseStore();
  const orderStore: OrderStore = prismaForStores
    ? createPrismaOrderStore(
        prismaForStores as Parameters<typeof createPrismaOrderStore>[0],
      )
    : createInMemoryOrderStore();
  const ledger: BalanceLedger = prismaForStores
    ? createPrismaBalanceLedger(
        prismaForStores as Parameters<typeof createPrismaBalanceLedger>[0],
        {
          holdDaysResolver: async () => (await getSettlementSettings()).payoutHoldDays,
        },
      )
    : createInMemoryBalanceLedger({
        holdDaysResolver: async () => (await getSettlementSettings()).payoutHoldDays,
      });
  const auditLogger = createInMemoryAuditLogger();
  const runtimePersistence = loadRuntimePersistence();

  const seeds: Array<Parameters<typeof buildDemoBundle>[0]> = [];

  const demoBundles = new Map<string, BundleSeed>();
  const pluginVersions = new Map<string, PluginVersionRecord>();
  const catalog: CatalogEntry[] = [];
  const verificationSessions = new Map<string, PluginVersionTestSession>();

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

  const draftState: RegistryRuntimeState = {
    keyStore,
    signer,
    signingPrivateKey: currentSigningPrivateKey,
    signingKeyPair: currentKeyPair,
    activateSigningKeyPair(keyPair) {
      if (!keyPair.privateKey) {
        throw new Error("Active signing key pair must include a private key.");
      }
      // Fire-and-forget; the in-memory `currentSigningPrivateKey` switch is
      // what callers need synchronously. The DB write only matters for cold
      // restarts, where it's safe to lag a few hundred ms behind.
      void persistLocalSigningKeyPair(keyPair).catch((err) => {
        console.error("[registry] Failed to persist rotated signing key:", err);
      });
      currentSigningPrivateKey = keyPair.privateKey;
      draftState.signingPrivateKey = keyPair.privateKey;
      draftState.signingKeyPair = keyPair;
    },
    revocations,
    licenseStore,
    orderStore,
    ledger,
    auditLogger: prismaStores?.auditLogger ?? auditLogger,
    objectStore,
    demoBundles,
    pluginVersions,
    catalog,
    verificationSessions,
    consumers: prismaStores?.consumerLookup
      ? {
          async findByAppId(appId: string) {
            const prismaConsumer = await prismaStores.consumerLookup.findByAppId(appId);
            return prismaConsumer ?? consumers.findByAppId(appId);
          },
          register: consumers.register,
        }
      : consumers,
  };

  const persistedBundles = await loadPersistedRemoteBundles({
    rootDir: REGISTRY_PROJECT_ROOT,
    objectStore,
    signer,
    keyStore,
  });

  for (const bundle of persistedBundles) {
    const persistedRecord = runtimePersistence.pluginVersions.find(
      (record) =>
        record.slug === bundle.pipelineResult.manifest.slug &&
        record.version === bundle.pipelineResult.manifest.version,
    );
    const reviewState = isOfficialPluginSlug(bundle.pipelineResult.manifest.slug)
      ? "PUBLISHED"
      : persistedRecord?.reviewState ?? "PUBLISHED";
    registerUploadedCatalogBundle(draftState, {
      ...bundle,
      reviewState,
    });
  }

  for (const persistedSession of runtimePersistence.verificationSessions) {
    draftState.verificationSessions.set(persistedSession.id, {
      ...persistedSession,
      startedAt: persistedSession.startedAt ? new Date(persistedSession.startedAt) : null,
      completedAt: persistedSession.completedAt ? new Date(persistedSession.completedAt) : null,
      expiresAt: persistedSession.expiresAt ? new Date(persistedSession.expiresAt) : null,
      createdAt: new Date(persistedSession.createdAt),
      updatedAt: new Date(persistedSession.updatedAt),
      steps: persistedSession.steps.map((step) => ({
        ...step,
        startedAt: step.startedAt ? new Date(step.startedAt) : null,
        completedAt: step.completedAt ? new Date(step.completedAt) : null,
      })),
    });
  }

  return draftState;
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

export function registerUploadedCatalogBundle(
  state: RegistryRuntimeState,
  input: UploadedCatalogRegistrationInput,
) {
  const {
    rawBytes,
    pipelineResult,
    pricingMode,
    pricingPlanKind,
    priceAmountCents,
    priceCurrency,
    priceLabel,
    purchaseUrl,
  } = input;
  const { manifest } = pipelineResult;
  const reviewState = input.reviewState ?? "DRAFT";
  const now = new Date();
  const normalizedCurrency = normalizePriceCurrency(priceCurrency);
  const paidPricing =
    pricingMode === "PAID" &&
    pricingPlanKind &&
    Number.isInteger(priceAmountCents) &&
    (priceAmountCents ?? 0) > 0 &&
    normalizedCurrency
      ? {
          pricingPlanKind,
          priceAmountCents,
          priceCurrency: normalizedCurrency,
        }
      : null;
  const resolvedPriceLabel =
    priceLabel?.trim() ||
    (paidPricing
      ? formatRegistryPluginPricing(
          {
            pricingMode,
            pricingPlanKind: paidPricing.pricingPlanKind,
            priceAmountCents: paidPricing.priceAmountCents,
            priceCurrency: paidPricing.priceCurrency,
            priceLabel: null,
          },
          "en",
        )
      : null);

  const catalogEntry: CatalogEntry = {
    remotePluginId: manifest.slug,
    slug: manifest.slug,
    kind: manifest.kind,
    channelCode: manifest.channelCode,
    providerKey: manifest.providerKey,
    packageName: manifest.packageName,
    displayName: manifest.displayName,
    vendor: manifest.vendor,
    description: manifest.description,
    version: manifest.version,
    latestVersion: manifest.version,
    runtimeMode: manifest.runtimeEntrypoint ? "RUNNABLE" : "MANIFEST_ONLY",
    pricingMode,
    pricingPlanKind: paidPricing?.pricingPlanKind ?? null,
    priceAmountCents: paidPricing?.priceAmountCents ?? null,
    priceCurrency: paidPricing?.priceCurrency ?? null,
    priceLabel: resolvedPriceLabel,
    purchaseUrl,
    capabilities: [...manifest.capabilities],
    metadata: {
      category: manifest.category,
      summary: manifest.summary,
      description: manifest.detail,
    },
  };

  const bundleKey = `${manifest.slug}@${manifest.version}`;
  state.demoBundles.set(bundleKey, {
    slug: manifest.slug,
    pipelineResult,
    rawBytes,
    catalogEntry,
  });

  state.pluginVersions.set(bundleKey, {
    slug: manifest.slug,
    version: manifest.version,
    reviewState,
    pricingMode,
    pricingPlanKind: paidPricing?.pricingPlanKind ?? null,
    priceAmountCents: paidPricing?.priceAmountCents ?? null,
    priceCurrency: paidPricing?.priceCurrency ?? null,
    priceLabel: resolvedPriceLabel,
    purchaseUrl,
    scanResult: null,
    publishedAt: reviewState === "PUBLISHED" ? now : null,
    createdAt: now,
    updatedAt: now,
  });

  if (reviewState === "PUBLISHED") {
    const existingIndex = state.catalog.findIndex((entry) => entry.slug === manifest.slug);
    if (existingIndex >= 0) {
      state.catalog[existingIndex] = catalogEntry;
    } else {
      state.catalog.push(catalogEntry);
    }
  }

  saveRuntimePersistence(state);
}

export function createPluginVersionTestSession(input: {
  state: RegistryRuntimeState;
  pluginSlug: string;
  version: string;
  verificationProfile: VerificationProfile;
  submittedConfig: Record<string, string>;
}) {
  const now = new Date();
  const session: PluginVersionTestSession = {
    id: `pts_${randomUUID()}`,
    pluginSlug: input.pluginSlug,
    version: input.version,
    status: "DRAFT",
    verificationProfile: input.verificationProfile,
    submittedConfig: input.submittedConfig,
    steps: input.verificationProfile.requiredChecks.map((stepKey) => ({
      id: `ptstep_${randomUUID()}`,
      sessionId: "",
      stepKey,
      status: "PENDING",
      startedAt: null,
      completedAt: null,
      errorMessage: null,
      resultSnapshot: null,
    })),
    startedAt: null,
    completedAt: null,
    expiresAt: null,
    failureReason: null,
    resultSnapshot: null,
    createdAt: now,
    updatedAt: now,
  };

  session.steps = session.steps.map((step) => ({
    ...step,
    sessionId: session.id,
  }));
  input.state.verificationSessions.set(session.id, session);
  saveRuntimePersistence(input.state);
  return session;
}

export function updatePluginVersionTestSession(
  state: RegistryRuntimeState,
  session: PluginVersionTestSession,
) {
  state.verificationSessions.set(session.id, {
    ...session,
    updatedAt: new Date(),
  });
  saveRuntimePersistence(state);
}

export function listPluginVersionTestSessions(input: {
  state: RegistryRuntimeState;
  pluginSlug: string;
  version?: string;
}) {
  return [...input.state.verificationSessions.values()]
    .filter((session) => {
      if (session.pluginSlug !== input.pluginSlug) {
        return false;
      }

      if (input.version && session.version !== input.version) {
        return false;
      }

      return true;
    })
    .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime());
}

export function getPluginVersionRecord(
  state: RegistryRuntimeState,
  slug: string,
  version: string,
) {
  return state.pluginVersions.get(`${slug}@${version}`) ?? null;
}

export function listPluginVersionRecords(
  state: RegistryRuntimeState,
  slug: string,
) {
  return [...state.pluginVersions.values()]
    .filter((record) => record.slug === slug)
    .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime());
}

export function listAllPluginVersionRecords(state: RegistryRuntimeState) {
  return [...state.pluginVersions.values()].sort(
    (left, right) => right.updatedAt.getTime() - left.updatedAt.getTime(),
  );
}

export function updatePluginVersionReviewState(input: {
  state: RegistryRuntimeState;
  slug: string;
  version: string;
  reviewState: ReviewState;
}) {
  const key = `${input.slug}@${input.version}`;
  const record = input.state.pluginVersions.get(key);

  if (!record) {
    throw new Error(`Plugin version not found: ${key}`);
  }

  const nextRecord: PluginVersionRecord = {
    ...record,
    reviewState: input.reviewState,
    publishedAt:
      input.reviewState === "PUBLISHED"
        ? record.publishedAt ?? new Date()
        : record.publishedAt,
    updatedAt: new Date(),
  };
  input.state.pluginVersions.set(key, nextRecord);

  const bundle = input.state.demoBundles.get(key);
  if (bundle) {
    if (input.reviewState === "PUBLISHED") {
      const existingIndex = input.state.catalog.findIndex(
        (entry) => entry.slug === input.slug,
      );
      if (existingIndex >= 0) {
        input.state.catalog[existingIndex] = bundle.catalogEntry;
      } else {
        input.state.catalog.push(bundle.catalogEntry);
      }
    } else if (
      input.reviewState === "DRAFT" ||
      input.reviewState === "SUBMITTED" ||
      input.reviewState === "APPROVED" ||
      input.reviewState === "REJECTED" ||
      input.reviewState === "DEPRECATED" ||
      input.reviewState === "TAKEN_DOWN"
    ) {
      const publishedVersions = [...input.state.pluginVersions.values()]
        .filter(
          (record) =>
            record.slug === input.slug &&
            record.reviewState === "PUBLISHED" &&
            record.version !== input.version,
        )
        .sort((left, right) => right.version.localeCompare(left.version));
      const latestPublished = publishedVersions[0];
      if (latestPublished) {
        const latestBundle = input.state.demoBundles.get(
          `${latestPublished.slug}@${latestPublished.version}`,
        );
        if (latestBundle) {
          const existingIndex = input.state.catalog.findIndex(
            (entry) => entry.slug === input.slug,
          );
          if (existingIndex >= 0) {
            input.state.catalog[existingIndex] = latestBundle.catalogEntry;
          } else {
            input.state.catalog.push(latestBundle.catalogEntry);
          }
        }
      } else {
        input.state.catalog = input.state.catalog.filter(
          (entry) => entry.slug !== input.slug,
        );
      }
    }
  }

  saveRuntimePersistence(input.state);
  return nextRecord;
}

export function updatePluginVersionScanResult(input: {
  state: RegistryRuntimeState;
  slug: string;
  version: string;
  scanResult: ScanResult;
}) {
  const key = `${input.slug}@${input.version}`;
  const record = input.state.pluginVersions.get(key);

  if (!record) {
    throw new Error(`Plugin version not found: ${key}`);
  }

  const nextRecord: PluginVersionRecord = {
    ...record,
    scanResult: input.scanResult,
    updatedAt: new Date(),
  };

  input.state.pluginVersions.set(key, nextRecord);
  saveRuntimePersistence(input.state);
  return nextRecord;
}

export async function takeDownPlugin(input: {
  state: RegistryRuntimeState;
  slug: string;
  actorId: string;
  reason?: string | null;
  ip?: string | null;
}) {
  const candidates = listPluginVersionRecords(input.state, input.slug).filter((record) =>
    record.reviewState === "APPROVED" ||
    record.reviewState === "PUBLISHED" ||
    record.reviewState === "DEPRECATED",
  );

  if (candidates.length === 0) {
    return {
      success: false as const,
      updatedVersions: [] as PluginVersionRecord[],
    };
  }

  const updatedVersions = candidates.map((record) =>
    updatePluginVersionReviewState({
      state: input.state,
      slug: record.slug,
      version: record.version,
      reviewState: "TAKEN_DOWN",
    }),
  );

  await input.state.auditLogger.write({
    actorType: "ADMIN",
    actorId: input.actorId,
    action: AUDIT_ACTIONS.PLUGIN_TAKEN_DOWN,
    targetKind: "PLUGIN",
    targetId: input.slug,
    payload: {
      reason: input.reason ?? null,
      affectedVersions: updatedVersions.map((record) => record.version),
      affectedStatesBefore: candidates.map((record) => ({
        version: record.version,
        reviewState: record.reviewState,
      })),
      nextState: "TAKEN_DOWN",
    },
    ip: input.ip ?? null,
  });

  return {
    success: true as const,
    updatedVersions,
  };
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
