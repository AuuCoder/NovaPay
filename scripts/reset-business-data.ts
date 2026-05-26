import "dotenv/config";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient as RegistryPrismaClient } from "../apps/registry/generated/prisma/client";
import { getPrismaClient } from "@/lib/prisma";

function rewriteJsonFile<T>(filePath: string, nextValue: T) {
  writeFileSync(filePath, JSON.stringify(nextValue, null, 2), "utf8");
}

function cleanRegistryStateFiles(projectRoot: string) {
  const registryTmpDir = path.join(projectRoot, "apps", "registry", ".tmp");
  const authFile = path.join(registryTmpDir, "registry-auth-state.json");
  const patFile = path.join(registryTmpDir, "registry-pat-state.json");
  const payoutAccountsFile = path.join(registryTmpDir, "registry-payout-accounts.json");
  const ordersFile = path.join(registryTmpDir, "registry-orders-state.json");
  const licensesFile = path.join(registryTmpDir, "registry-licenses-state.json");
  const ledgerFile = path.join(registryTmpDir, "registry-ledger-state.json");
  const runtimeFile = path.join(registryTmpDir, "registry-runtime-state.json");
  const settlementFile = path.join(registryTmpDir, "registry-settlement-settings.json");
  const signingMaterialsFile = path.join(registryTmpDir, "registry-signing-materials.json");
  const objectStoreDir = path.join(registryTmpDir, "registry-object-store");

  if (existsSync(authFile)) {
    rewriteJsonFile(authFile, {
      developers: [],
      emailVerificationTokens: [],
      sessions: [],
    });
  }

  if (existsSync(patFile)) {
    rewriteJsonFile(patFile, {
      tokens: [],
    });
  }

  if (existsSync(payoutAccountsFile)) {
    rewriteJsonFile(payoutAccountsFile, []);
  }

  if (existsSync(ordersFile)) {
    rewriteJsonFile(ordersFile, []);
  }

  if (existsSync(licensesFile)) {
    rewriteJsonFile(licensesFile, []);
  }

  if (existsSync(ledgerFile)) {
    rewriteJsonFile(ledgerFile, {
      entries: [],
      payouts: [],
    });
  }

  if (existsSync(runtimeFile)) {
    rewriteJsonFile(runtimeFile, {
      pluginVersions: [],
      verificationSessions: [],
    });
  }

  if (existsSync(settlementFile)) {
    rmSync(settlementFile, { force: true });
  }

  if (existsSync(signingMaterialsFile)) {
    rmSync(signingMaterialsFile, { force: true });
  }

  if (existsSync(objectStoreDir)) {
    rmSync(objectStoreDir, { recursive: true, force: true });
  }

  const bootstrapSql = path.join(projectRoot, ".tmp", "registry-bootstrap.sql");
  if (existsSync(bootstrapSql)) {
    rmSync(bootstrapSql, { force: true });
  }

  const rootObjectStoreDir = path.join(projectRoot, ".tmp", "registry-object-store");
  if (existsSync(rootObjectStoreDir)) {
    rmSync(rootObjectStoreDir, { recursive: true, force: true });
  }

  const runtimePluginsDir = path.join(projectRoot, "runtime", "plugins");
  if (existsSync(runtimePluginsDir)) {
    rmSync(runtimePluginsDir, { recursive: true, force: true });
  }
}

async function resetMainBusinessData() {
  const prisma = getPrismaClient();

  await prisma.$transaction([
    prisma.paymentCallbackAttempt.deleteMany(),
    prisma.merchantIdempotencyRecord.deleteMany(),
    prisma.merchantRequestNonce.deleteMany(),
    prisma.onchainDeposit.deleteMany(),
    prisma.merchantLedgerEntry.deleteMany(),
    prisma.paymentRefund.deleteMany(),
    prisma.paymentOrder.deleteMany(),
    prisma.merchantSettlement.deleteMany(),
    prisma.merchantBalanceSnapshot.deleteMany(),
    prisma.pluginPackageInstall.deleteMany(),
    prisma.pluginPurchaseRecord.deleteMany(),
    prisma.merchantInstalledPlugin.deleteMany(),
    prisma.merchantChannelBinding.deleteMany(),
    prisma.merchantChannelAccount.deleteMany(),
    prisma.merchantApiCredential.deleteMany(),
    prisma.merchantSession.deleteMany(),
    prisma.merchantUser.deleteMany(),
    prisma.merchant.deleteMany(),
    prisma.adminSession.deleteMany(),
    prisma.adminAuditLog.deleteMany(),
    prisma.adminUser.deleteMany(),
    prisma.systemConfig.deleteMany(),
    prisma.pluginRegistrySource.deleteMany(),
  ]);

  await prisma.marketplacePlugin.updateMany({
    data: {
      registrySourceId: null,
      remotePluginId: null,
      latestVersion: null,
      publishedVersion: null,
      runtimeMode: null,
      pricingMode: null,
      priceLabel: null,
      purchaseUrl: null,
      purchasedAt: null,
      downloadUrl: null,
      checksum: null,
      signature: null,
      installed: false,
      enabled: false,
      installedAt: null,
      lastSyncedAt: null,
    },
    where: {
      source: "REMOTE_SIGNED",
    },
  });
}

async function resetRegistryPrismaData() {
  const connectionString = process.env.DATABASE_URL?.trim();
  if (!connectionString) {
    return false;
  }

  const prisma = new RegistryPrismaClient({
    adapter: new PrismaPg({ connectionString }),
  });

  try {
    await prisma.$transaction([
      prisma.licenseRevocation.deleteMany(),
      prisma.payoutRequest.deleteMany(),
      prisma.registryLedgerEntry.deleteMany(),
      prisma.auditLog.deleteMany(),
      prisma.reviewWorkflow.deleteMany(),
      prisma.license.deleteMany(),
      prisma.order.deleteMany(),
      prisma.pluginPricingHistory.deleteMany(),
      prisma.pluginVersion.deleteMany(),
      prisma.pluginAsset.deleteMany(),
      prisma.payoutAccount.deleteMany(),
      prisma.registryConsumer.deleteMany(),
      prisma.registrySetting.deleteMany(),
      prisma.pluginRecord.deleteMany(),
      prisma.developer.deleteMany(),
      prisma.signingKey.deleteMany(),
    ]);
    return true;
  } finally {
    await prisma.$disconnect().catch(() => undefined);
  }
}

async function main() {
  const projectRoot = process.cwd();
  await resetMainBusinessData();
  const registryPrismaCleared = await resetRegistryPrismaData();
  cleanRegistryStateFiles(projectRoot);

  console.log(
    JSON.stringify(
      {
        success: true,
        cleared: {
          merchants: true,
          orders: true,
          refunds: true,
          adminUsers: true,
          adminSessions: true,
          systemConfig: true,
          pluginRegistrySources: true,
          merchantChannels: true,
          runtimeInstalledPlugins: true,
          pluginPurchaseRecords: true,
          registryDevelopers: true,
          registryDeveloperSessions: true,
          registryOrders: true,
          registryLicenses: true,
          registryPayouts: true,
          registrySigningKeys: true,
          registrySettings: true,
          registryRuntimeOrders: true,
          registryRuntimeLicenses: true,
          registryVerificationSessions: true,
          registryObjectStore: true,
          registryPrismaCleared,
        },
      },
      null,
      2,
    ),
  );
}

await main();
