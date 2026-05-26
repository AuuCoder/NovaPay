import assert from "node:assert/strict";
import { createHash, generateKeyPairSync, sign as cryptoSign } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  installMerchantMarketplacePlugin,
  installRemoteMarketplacePluginPackage,
  MerchantPluginInstallError,
  purchaseAndIssueLicense,
  setMarketplacePluginEnabledState,
} from "../lib/plugins/marketplace";
import { invalidateSystemConfigCache } from "../lib/system-config";

type JsonObject = Record<string, unknown>;

interface MarketplacePluginRow {
  id: string;
  slug: string;
  kind: "PAYMENT_CHANNEL";
  source: "REMOTE_SIGNED";
  channelCode: string;
  providerKey: string;
  packageName: string;
  displayName: string;
  vendor: string;
  description: string;
  version: string;
  latestVersion: string | null;
  pricingMode: "PAID";
  priceLabel: string | null;
  purchaseUrl: string | null;
  purchasedAt: Date | null;
  downloadUrl: string | null;
  checksum: string | null;
  signature: string | null;
  registrySourceId: string | null;
  installed: boolean;
  enabled: boolean;
  installedAt: Date | null;
  metadata: JsonObject | null;
  trusted: boolean;
  lastSyncedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

interface PluginRegistrySourceRow {
  id: string;
  name: string;
  baseUrl: string;
  appId: string | null;
  appKeyCiphertext: string | null;
  enabled: boolean;
  lastSyncAt: Date | null;
  trustPublicKey: string | null;
  trustPublicKeyKeyId: string | null;
  trustPublicKeyExpiresAt: Date | null;
  licensePublicKey: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface PluginPurchaseRecordRow {
  id: string;
  pluginSlug: string;
  merchantId: string | null;
  sourceId: string | null;
  orderReference: string | null;
  licenseKey: string | null;
  licenseKeyHash: string | null;
  licenseExpiresAt: Date | null;
  verifiedAt: Date | null;
  priceLabel: string | null;
  purchaseUrl: string | null;
  notes: string | null;
  purchasedBy: string | null;
  purchasedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

interface PluginPackageInstallRow {
  id: string;
  pluginSlug: string;
  sourceId: string | null;
  version: string;
  downloadUrl: string | null;
  installPath: string;
  checksum: string | null;
  signature: string | null;
  status: "DOWNLOADED" | "VALIDATED" | "LOAD_ERROR" | "ROLLED_BACK";
  loadError: string | null;
  installedBy: string | null;
  installedAt: Date;
  updatedAt: Date;
}

interface MerchantInstalledPluginRow {
  id: string;
  merchantId: string;
  pluginSlug: string;
  installedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

function createSignedBundle(slug: string, channelCode: string, version: string) {
  const bundle = {
    manifest: {
      slug,
      kind: "PAYMENT_CHANNEL",
      channelCode,
      providerKey: "crypto",
      packageName: "@novapay/remote-test-flow",
      displayName: "Remote Test Flow Plugin",
      vendor: "NovaPay Labs",
      description: "Signed remote plugin bundle for service-layer flow tests.",
      version,
      capabilities: ["native_qr"],
      category: { zh: "远程插件", en: "Remote Plugin" },
      summary: { zh: "测试摘要", en: "Test summary" },
      detail: { zh: "测试详情", en: "Test detail" },
      runtimeEntrypoint: "./runtime.js",
      supportsCallbackRoute: false,
      requiresMerchantProfileCompletion: false,
      manifestVersion: 1,
    },
    files: [
      {
        path: "runtime.js",
        content: `export const pluginRuntime = {
  provider: {
    getSummary() {
      return {
        code: "${channelCode}",
        provider: "crypto",
        displayName: "Remote Test Flow Plugin",
        description: "Signed remote plugin bundle for service-layer flow tests.",
        configured: false,
        implementationStatus: "ready",
        capabilities: ["native_qr"],
      };
    },
    isConfigured() { return true; },
    async createPayment() {
      return {
        status: "requires_action",
        mode: "qr_code",
        checkoutUrl: "https://checkout.example.com",
        providerPayload: {},
      };
    },
  },
  adminOption: {
    title: { zh: "远程测试插件", en: "Remote Test Plugin" },
    detail: { zh: "后台说明", en: "Admin detail" },
  },
  merchantTemplate: {
    title: { zh: "商户模板", en: "Merchant template" },
    description: { zh: "商户说明", en: "Merchant description" },
    fields: [],
  },
};`,
      },
    ],
  };

  const rawPayload = JSON.stringify(bundle, null, 2);
  const checksum = `sha256:${createHash("sha256").update(rawPayload).digest("hex")}`;

  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const spkiDer = publicKey.export({ type: "spki", format: "der" });
  const rawPublicKey = spkiDer.subarray(spkiDer.length - 32).toString("base64url");
  const signatureBytes = cryptoSign(null, Buffer.from(rawPayload, "utf8"), privateKey);
  const signature = `ed25519:${signatureBytes.toString("base64url")}`;

  return {
    rawPayload,
    checksum,
    signature,
    trustPublicKey: rawPublicKey,
  };
}

function createFlowPrismaStub(input: {
  plugin: MarketplacePluginRow;
  source: PluginRegistrySourceRow;
}) {
  const marketplacePlugins = new Map<string, MarketplacePluginRow>([
    [input.plugin.slug, { ...input.plugin }],
  ]);
  const registrySources = new Map<string, PluginRegistrySourceRow>([
    [input.source.id, { ...input.source }],
  ]);
  const purchaseRecords = new Map<string, PluginPurchaseRecordRow>();
  const packageInstalls = new Map<string, PluginPackageInstallRow>();
  const merchantInstalls = new Map<string, MerchantInstalledPluginRow>();

  let sequence = 0;

  function nextId(prefix: string) {
    sequence += 1;
    return `${prefix}_${sequence}`;
  }

  function clonePlugin(row: MarketplacePluginRow | undefined | null) {
    return row ? { ...row, metadata: row.metadata ? { ...row.metadata } : null } : row;
  }

  function cloneSource(row: PluginRegistrySourceRow | undefined | null) {
    return row ? { ...row } : row;
  }

  function clonePurchase(row: PluginPurchaseRecordRow | undefined | null) {
    return row ? { ...row } : row;
  }

  function cloneInstall(row: PluginPackageInstallRow | undefined | null) {
    return row ? { ...row } : row;
  }

  function cloneMerchantInstall(row: MerchantInstalledPluginRow | undefined | null) {
    return row ? { ...row } : row;
  }

  const stub = {
    marketplacePlugin: {
      async upsert(args: {
        where: { slug: string };
        update: Partial<MarketplacePluginRow>;
        create: Partial<MarketplacePluginRow>;
      }) {
        const existing = marketplacePlugins.get(args.where.slug);
        const now = new Date();

        if (existing) {
          const next = {
            ...existing,
            ...args.update,
            updatedAt: now,
          } satisfies MarketplacePluginRow;
          marketplacePlugins.set(existing.slug, next);
          return clonePlugin(next);
        }

        const created = {
          id: nextId("plugin"),
          slug: args.where.slug,
          kind: "PAYMENT_CHANNEL",
          source: "REMOTE_SIGNED",
          channelCode: null,
          providerKey: null,
          packageName: null,
          displayName: args.where.slug,
          vendor: null,
          description: "",
          version: "0.0.0",
          latestVersion: null,
          pricingMode: null,
          priceLabel: null,
          purchaseUrl: null,
          purchasedAt: null,
          downloadUrl: null,
          checksum: null,
          signature: null,
          registrySourceId: null,
          installed: false,
          enabled: false,
          installedAt: null,
          metadata: null,
          trusted: true,
          lastSyncedAt: null,
          createdAt: now,
          updatedAt: now,
          ...args.create,
        } as unknown as MarketplacePluginRow;
        marketplacePlugins.set(created.slug, created);
        return clonePlugin(created);
      },
      async findUnique(args: {
        where: { slug: string };
        select?: Record<string, boolean>;
        include?: { purchaseRecords?: true };
      }) {
        const row = marketplacePlugins.get(args.where.slug);
        if (!row) {
          return null;
        }
        if (args.include?.purchaseRecords) {
          return {
            ...clonePlugin(row),
            purchaseRecords: [...purchaseRecords.values()]
              .filter((record) => record.pluginSlug === row.slug)
              .map((record) => clonePurchase(record)),
          };
        }
        return clonePlugin(row);
      },
      async findFirst(args: { where: Partial<MarketplacePluginRow>; select?: Record<string, boolean> }) {
        for (const row of marketplacePlugins.values()) {
          if (
            Object.entries(args.where).every(
              ([key, value]) => ((row as unknown as Record<string, unknown>)[key] === value),
            )
          ) {
            return clonePlugin(row);
          }
        }
        return null;
      },
      async findMany(args?: { where?: Partial<MarketplacePluginRow>; select?: Record<string, boolean> }) {
        const rows = [...marketplacePlugins.values()].filter((row) => {
          if (!args?.where) {
            return true;
          }
          return Object.entries(args.where).every(([key, value]) => {
            if (value === undefined) {
              return true;
            }
            return (row as unknown as Record<string, unknown>)[key] === value;
          });
        });
        return rows.map((row) => clonePlugin(row));
      },
      async update(args: { where: { slug: string }; data: Partial<MarketplacePluginRow> }) {
        const existing = marketplacePlugins.get(args.where.slug);
        if (!existing) {
          throw new Error(`Plugin not found: ${args.where.slug}`);
        }
        const next = {
          ...existing,
          ...args.data,
          updatedAt: new Date(),
        } satisfies MarketplacePluginRow;
        marketplacePlugins.set(existing.slug, next);
        return clonePlugin(next);
      },
    },
    pluginRegistrySource: {
      async findMany() {
        return [];
      },
      async findUnique(args: { where: { id: string }; select?: Record<string, boolean> }) {
        return cloneSource(registrySources.get(args.where.id) ?? null);
      },
      async findFirst(args: { where: { plugins?: { some: { slug: string } } }; select?: Record<string, boolean> }) {
        const pluginSlug = args.where.plugins?.some.slug;
        if (!pluginSlug) {
          return null;
        }
        const plugin = marketplacePlugins.get(pluginSlug);
        if (!plugin?.registrySourceId) {
          return null;
        }
        return cloneSource(registrySources.get(plugin.registrySourceId) ?? null);
      },
      async update(args: { where: { id: string }; data: Partial<PluginRegistrySourceRow> }) {
        const existing = registrySources.get(args.where.id);
        if (!existing) {
          throw new Error(`Source not found: ${args.where.id}`);
        }
        const next = {
          ...existing,
          ...args.data,
          updatedAt: new Date(),
        } satisfies PluginRegistrySourceRow;
        registrySources.set(existing.id, next);
        return cloneSource(next);
      },
    },
    pluginPurchaseRecord: {
      async create(args: { data: Partial<PluginPurchaseRecordRow> }) {
        const now = new Date();
        const record = {
          id: nextId("purchase"),
          pluginSlug: "",
          merchantId: null,
          sourceId: null,
          orderReference: null,
          licenseKey: null,
          licenseKeyHash: null,
          licenseExpiresAt: null,
          verifiedAt: null,
          priceLabel: null,
          purchaseUrl: null,
          notes: null,
          purchasedBy: null,
          purchasedAt: now,
          createdAt: now,
          updatedAt: now,
          ...args.data,
        } satisfies PluginPurchaseRecordRow;
        purchaseRecords.set(record.id, record);
        return clonePurchase(record);
      },
      async findFirst(args: { where: { pluginSlug?: string; licenseKey?: { not: null }; verifiedAt?: { not: null } }; orderBy?: Array<{ verifiedAt?: "desc" }> ; include?: { source: true } }) {
        const candidates = [...purchaseRecords.values()]
          .filter((record) => {
            if (args.where.pluginSlug && record.pluginSlug !== args.where.pluginSlug) {
              return false;
            }
            if (args.where.licenseKey?.not === null && record.licenseKey === null) {
              return false;
            }
            if (args.where.verifiedAt?.not === null && record.verifiedAt === null) {
              return false;
            }
            return true;
          })
          .sort((left, right) => (right.verifiedAt?.getTime() ?? 0) - (left.verifiedAt?.getTime() ?? 0));

        const record = candidates[0];
        if (!record) {
          return null;
        }

        return {
          ...clonePurchase(record),
          source: record.sourceId ? cloneSource(registrySources.get(record.sourceId) ?? null) : null,
        };
      },
      async update(args: { where: { id: string }; data: Partial<PluginPurchaseRecordRow> }) {
        const existing = purchaseRecords.get(args.where.id);
        if (!existing) {
          throw new Error(`Purchase record not found: ${args.where.id}`);
        }
        const next = {
          ...existing,
          ...args.data,
          updatedAt: new Date(),
        } satisfies PluginPurchaseRecordRow;
        purchaseRecords.set(existing.id, next);
        return clonePurchase(next);
      },
      async findMany() {
        return [...purchaseRecords.values()].map((record) => clonePurchase(record));
      },
    },
    pluginPackageInstall: {
      async create(args: { data: Partial<PluginPackageInstallRow> }) {
        const now = new Date();
        const row = {
          id: nextId("install"),
          pluginSlug: "",
          sourceId: null,
          version: "",
          downloadUrl: null,
          installPath: "",
          checksum: null,
          signature: null,
          status: "DOWNLOADED",
          loadError: null,
          installedBy: null,
          installedAt: now,
          updatedAt: now,
          ...args.data,
        } satisfies PluginPackageInstallRow;
        packageInstalls.set(row.id, row);
        return cloneInstall(row);
      },
      async findMany() {
        return [...packageInstalls.values()].map((row) => ({
          ...cloneInstall(row),
          plugin: { channelCode: marketplacePlugins.get(row.pluginSlug)?.channelCode ?? null },
        }));
      },
    },
    merchantInstalledPlugin: {
      async upsert(args: {
        where: { merchantId_pluginSlug: { merchantId: string; pluginSlug: string } };
        update: Record<string, never>;
        create: { merchantId: string; pluginSlug: string };
      }) {
        const key = `${args.where.merchantId_pluginSlug.merchantId}:${args.where.merchantId_pluginSlug.pluginSlug}`;
        const existing = merchantInstalls.get(key);
        if (existing) {
          return cloneMerchantInstall(existing);
        }
        const now = new Date();
        const row = {
          id: nextId("merchant_install"),
          merchantId: args.create.merchantId,
          pluginSlug: args.create.pluginSlug,
          installedAt: now,
          createdAt: now,
          updatedAt: now,
        } satisfies MerchantInstalledPluginRow;
        merchantInstalls.set(key, row);
        return cloneMerchantInstall(row);
      },
      async findUnique(args: { where: { merchantId_pluginSlug: { merchantId: string; pluginSlug: string } } }) {
        const key = `${args.where.merchantId_pluginSlug.merchantId}:${args.where.merchantId_pluginSlug.pluginSlug}`;
        return cloneMerchantInstall(merchantInstalls.get(key) ?? null);
      },
      async findMany(args?: { where?: { merchantId?: string } }) {
        return [...merchantInstalls.values()]
          .filter((row) => !args?.where?.merchantId || row.merchantId === args.where.merchantId)
          .map((row) => cloneMerchantInstall(row));
      },
      async deleteMany(args: { where: { merchantId: string; pluginSlug: string } }) {
        const key = `${args.where.merchantId}:${args.where.pluginSlug}`;
        merchantInstalls.delete(key);
        return { count: 1 };
      },
    },
    merchantChannelAccount: {
      async findMany() {
        return [];
      },
      async count() {
        return 0;
      },
    },
    merchantChannelBinding: {
      async findMany() {
        return [];
      },
      async count() {
        return 0;
      },
    },
    systemConfig: {
      async findUnique(args: { where: { key: string } }) {
        if (args.where.key === "INSTANCE_ID" && process.env.INSTANCE_ID) {
          return { key: "INSTANCE_ID", value: process.env.INSTANCE_ID };
        }
        return null;
      },
      async create() {
        throw new Error("systemConfig.create not expected in this test");
      },
    },
    paymentOrder: { async count() { return 0; } },
    paymentRefund: { async count() { return 0; } },
    merchant: {},
    merchantUser: {},
    merchantSession: {},
    adminUser: {},
    adminSession: {},
    merchantLedgerEntry: {},
    merchantSettlement: {},
    merchantBalanceSnapshot: {},
    merchantRequestNonce: {},
    $transaction: async (operations: Array<Promise<unknown>>) => Promise.all(operations),
  };

  return {
    stub,
    getPlugin: (slug: string) => clonePlugin(marketplacePlugins.get(slug) ?? null),
    listPurchaseRecords: () => [...purchaseRecords.values()].map((row) => clonePurchase(row)),
    listPackageInstalls: () => [...packageInstalls.values()].map((row) => cloneInstall(row)),
    listMerchantInstalls: () => [...merchantInstalls.values()].map((row) => cloneMerchantInstall(row)),
  };
}

async function withMarketplaceFlowContext<T>(
  run: (context: {
    stubState: ReturnType<typeof createFlowPrismaStub>;
    plugin: MarketplacePluginRow;
    source: PluginRegistrySourceRow;
    bundle: ReturnType<typeof createSignedBundle>;
  }) => Promise<T>,
) {
  const slug = "remote.test-flow";
  const channelCode = "crypto.remote-test-flow";
  const version = "0.2.0";
  const bundle = createSignedBundle(slug, channelCode, version);
  const now = new Date("2026-05-17T08:00:00.000Z");

  const plugin: MarketplacePluginRow = {
    id: "plugin_remote_test_flow",
    slug,
    kind: "PAYMENT_CHANNEL",
    source: "REMOTE_SIGNED",
    channelCode,
    providerKey: "crypto",
    packageName: "@novapay/remote-test-flow",
    displayName: "Remote Test Flow Plugin",
    vendor: "NovaPay Labs",
    description: "Signed remote plugin bundle for service-layer flow tests.",
    version,
    latestVersion: version,
    pricingMode: "PAID",
    priceLabel: "99.00 CNY / instance",
    purchaseUrl: "https://registry.example.com/checkout/remote.test-flow",
    purchasedAt: null,
    downloadUrl: `https://registry.example.com/download/${slug}/${version}`,
    checksum: bundle.checksum,
    signature: bundle.signature,
    registrySourceId: "source_remote_test",
    installed: false,
    enabled: false,
    installedAt: null,
    metadata: {},
    trusted: true,
    lastSyncedAt: now,
    createdAt: now,
    updatedAt: now,
  };

  const source: PluginRegistrySourceRow = {
    id: "source_remote_test",
    name: "Remote Test Registry",
    baseUrl: "https://registry.example.com",
    appId: "novapay-admin",
    appKeyCiphertext: "registry-secret",
    enabled: true,
    lastSyncAt: now,
    trustPublicKey: bundle.trustPublicKey,
    trustPublicKeyKeyId: "key-remote-test",
    trustPublicKeyExpiresAt: null,
    licensePublicKey: null,
    createdAt: now,
    updatedAt: now,
  };

  const stubState = createFlowPrismaStub({ plugin, source });
  const originalSingleton = globalThis.prismaClientSingleton;
  const previousInstanceId = process.env.INSTANCE_ID;
  const previousDatabaseUrl = process.env.DATABASE_URL;
  const previousSandboxFlag = process.env.NOVAPAY_PLUGIN_SANDBOX_ENABLED;
  const previousLocalPluginDir = process.env.NOVAPAY_LOCAL_PLUGIN_DIR;
  const tmpPluginDir = await mkdtemp(path.join(os.tmpdir(), "novapay-plugin-marketplace-"));
  const installRoot = path.join(process.cwd(), "runtime", "plugins", slug);
  const originalFetch = globalThis.fetch;

  process.env.INSTANCE_ID = "inst_test-flow";
  process.env.DATABASE_URL = "postgresql://stub:stub@127.0.0.1:5432/stub";
  process.env.NOVAPAY_PLUGIN_SANDBOX_ENABLED = "0";
  process.env.NOVAPAY_LOCAL_PLUGIN_DIR = tmpPluginDir;
  invalidateSystemConfigCache("INSTANCE_ID");
  globalThis.prismaClientSingleton = stubState.stub as never;

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = input.toString();

    if (url === plugin.downloadUrl) {
      return new Response(bundle.rawPayload, {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (url === "https://registry.example.com/api/licenses/verify") {
      const rawBody = typeof init?.body === "string" ? init.body : "{}";
      const body = JSON.parse(rawBody) as {
        licenseKey?: string;
        expectedSlug?: string;
        expectedVersion?: string;
        expectedInstanceId?: string;
        expectedMerchantId?: string;
      };

      if (body.expectedMerchantId === "merchant_other") {
        return new Response(
          JSON.stringify({
            valid: false,
            reason: "MERCHANT_MISMATCH",
            message: "License is already assigned to another merchant.",
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      return new Response(
        JSON.stringify({
          valid: true,
          claims: {
            jti: "lic_test_flow",
            pluginSlug: body.expectedSlug ?? slug,
            version: body.expectedVersion ?? version,
            pricingPlanKind: "PER_INSTANCE_ONE_TIME",
            instanceId: body.expectedInstanceId ?? "inst_test-flow",
            merchantId: body.expectedMerchantId,
            scope: body.expectedMerchantId ? "MERCHANT" : "INSTANCE",
            iat: 1_715_932_800,
            exp: 1_816_932_800,
          },
          licenseKeyHash: createHash("sha256")
            .update(body.licenseKey ?? "missing-license")
            .digest("hex"),
          signingKeyId: "license-key-1",
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    throw new Error(`Unexpected fetch: ${url}`);
  }) as typeof fetch;

  try {
    return await run({ stubState, plugin, source, bundle });
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.prismaClientSingleton = originalSingleton;
    invalidateSystemConfigCache("INSTANCE_ID");

    if (previousInstanceId === undefined) {
      delete process.env.INSTANCE_ID;
    } else {
      process.env.INSTANCE_ID = previousInstanceId;
    }

    if (previousDatabaseUrl === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = previousDatabaseUrl;
    }

    if (previousSandboxFlag === undefined) {
      delete process.env.NOVAPAY_PLUGIN_SANDBOX_ENABLED;
    } else {
      process.env.NOVAPAY_PLUGIN_SANDBOX_ENABLED = previousSandboxFlag;
    }

    if (previousLocalPluginDir === undefined) {
      delete process.env.NOVAPAY_LOCAL_PLUGIN_DIR;
    } else {
      process.env.NOVAPAY_LOCAL_PLUGIN_DIR = previousLocalPluginDir;
    }

    await rm(tmpPluginDir, { recursive: true, force: true });
    await rm(installRoot, { recursive: true, force: true });
  }
}

test("plugin marketplace flow persists a verified license, installs the signed bundle, and assigns it to a merchant", async () => {
  await withMarketplaceFlowContext(async ({ stubState, plugin }) => {
    const purchaseResult = await purchaseAndIssueLicense({
      slug: plugin.slug,
      licenseKey: "header.payload.signature",
      version: plugin.version,
      instanceId: "inst_test-flow",
      purchasedBy: "ops@example.com",
      orderReference: "ord_test_flow_1",
    });

    assert.equal(purchaseResult.success, true);

    const purchaseRecord = stubState.listPurchaseRecords()[0];
    assert.ok(purchaseRecord);
    assert.equal(purchaseRecord?.pluginSlug, plugin.slug);
    assert.equal(purchaseRecord?.orderReference, "ord_test_flow_1");
    assert.equal(purchaseRecord?.licenseKey, "header.payload.signature");
    assert.equal(purchaseRecord?.verifiedAt instanceof Date, true);

    const pluginAfterPurchase = stubState.getPlugin(plugin.slug);
    assert.ok(pluginAfterPurchase?.purchasedAt instanceof Date);

    const installResult = await installRemoteMarketplacePluginPackage(plugin.slug);
    assert.equal(installResult.inspection.runnable, true);
    assert.equal(installResult.installRecord.status, "VALIDATED");

    const pluginAfterInstall = stubState.getPlugin(plugin.slug);
    assert.equal(pluginAfterInstall?.installed, true);
    assert.equal(pluginAfterInstall?.enabled, false);
    assert.equal(pluginAfterInstall?.metadata?.runnable, true);
    assert.match(String(pluginAfterInstall?.metadata?.runtimeEntrypoint), /runtime\.js$/);

    const packageInstall = stubState.listPackageInstalls()[0];
    assert.ok(packageInstall);
    assert.equal(packageInstall?.pluginSlug, plugin.slug);
    assert.equal(packageInstall?.sourceId, plugin.registrySourceId);

    await setMarketplacePluginEnabledState({
      slug: plugin.slug,
      enabled: true,
    });

    const merchantPlugin = await installMerchantMarketplacePlugin({
      merchantId: "merchant_alpha",
      slug: plugin.slug,
    });

    assert.equal(merchantPlugin.slug, plugin.slug);
    assert.equal(stubState.listMerchantInstalls().length, 1);
    assert.equal(stubState.listMerchantInstalls()[0]?.merchantId, "merchant_alpha");
  });
});

test("plugin marketplace flow rejects merchant assignment when the paid license is bound to another merchant", async () => {
  await withMarketplaceFlowContext(async ({ stubState, plugin }) => {
    await purchaseAndIssueLicense({
      slug: plugin.slug,
      licenseKey: "header.payload.signature",
      version: plugin.version,
      instanceId: "inst_test-flow",
      purchasedBy: "ops@example.com",
      orderReference: "ord_test_flow_2",
    });

    await installRemoteMarketplacePluginPackage(plugin.slug);
    await setMarketplacePluginEnabledState({
      slug: plugin.slug,
      enabled: true,
    });

    await assert.rejects(
      () =>
        installMerchantMarketplacePlugin({
          merchantId: "merchant_other",
          slug: plugin.slug,
        }),
      (error: unknown) => {
        assert.ok(error instanceof MerchantPluginInstallError);
        assert.equal(error.code, "LICENSE_ASSIGNED_TO_OTHER_MERCHANT");
        return true;
      },
    );

    assert.equal(stubState.listMerchantInstalls().length, 0);
  });
});
