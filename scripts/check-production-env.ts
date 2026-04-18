import "dotenv/config";
import { getDataEncryptionKey, getPublicBaseUrl } from "../lib/env";
import { normalizeUsdtReceivingAddress } from "../lib/payments/usdt-address";
import { getSystemConfig } from "../lib/system-config";
import { getPrismaClient } from "../lib/prisma";

function getChannelConfigAddress(config: unknown) {
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    return null;
  }

  const record = config as Record<string, unknown>;
  const candidate = record.walletAddress ?? record.receivingAddress ?? record.address;
  return typeof candidate === "string" ? candidate : null;
}

async function main() {
  const publicBaseUrl = getPublicBaseUrl();
  void getDataEncryptionKey();

  const prisma = getPrismaClient();
  await prisma.$queryRaw`SELECT 1`;

  const [
    adminUsers,
    merchants,
    approvedMerchants,
    enabledChannelAccounts,
    enabledOnchainAccountCount,
    enabledOnchainChannelRows,
  ] = await Promise.all([
    prisma.adminUser.count(),
    prisma.merchant.count(),
    prisma.merchant.count({
      where: {
        status: "APPROVED",
      },
    }),
    prisma.merchantChannelAccount.count({
      where: {
        enabled: true,
      },
    }),
    prisma.merchantChannelAccount.count({
      where: {
        enabled: true,
        channelCode: {
          in: ["usdt.bsc", "usdt.base", "usdt.sol"],
        },
      },
    }),
    prisma.merchantChannelAccount.findMany({
      where: {
        enabled: true,
        channelCode: {
          in: ["usdt.bsc", "usdt.base", "usdt.sol"],
        },
      },
      distinct: ["channelCode"],
      select: {
        channelCode: true,
      },
    }),
  ]);
  const enabledOnchainChannelCodes = enabledOnchainChannelRows.map((row) => row.channelCode);
  const enabledOnchainAccounts = enabledOnchainAccountCount;
  const workersRequired = ["npm run callbacks:worker", "npm run finance:worker"];

  if (enabledOnchainAccounts > 0) {
    workersRequired.push("npm run onchain:worker");
  }

  if (enabledOnchainChannelCodes.length > 0) {
    const systemConfigEntries = await Promise.all([
      getSystemConfig("USDT_BSC_RPC_URL"),
      getSystemConfig("USDT_BSC_TOKEN_CONTRACT"),
      getSystemConfig("USDT_BASE_RPC_URL"),
      getSystemConfig("USDT_BASE_TOKEN_CONTRACT"),
      getSystemConfig("USDT_SOL_RPC_URL"),
      getSystemConfig("USDT_SOL_MINT"),
    ]);
    const [
      bscRpcUrl,
      bscTokenContract,
      baseRpcUrl,
      baseTokenContract,
      solRpcUrl,
      solMintAddress,
    ] = systemConfigEntries;
    const missingConfigKeys: string[] = [];

    if (enabledOnchainChannelCodes.includes("usdt.bsc")) {
      if (!bscRpcUrl?.trim()) {
        missingConfigKeys.push("USDT_BSC_RPC_URL");
      }

      if (!bscTokenContract?.trim()) {
        missingConfigKeys.push("USDT_BSC_TOKEN_CONTRACT");
      }
    }

    if (enabledOnchainChannelCodes.includes("usdt.base")) {
      if (!baseRpcUrl?.trim()) {
        missingConfigKeys.push("USDT_BASE_RPC_URL");
      }

      if (!baseTokenContract?.trim()) {
        missingConfigKeys.push("USDT_BASE_TOKEN_CONTRACT");
      }
    }

    if (enabledOnchainChannelCodes.includes("usdt.sol")) {
      if (!solRpcUrl?.trim()) {
        missingConfigKeys.push("USDT_SOL_RPC_URL");
      }

      if (!solMintAddress?.trim()) {
        missingConfigKeys.push("USDT_SOL_MINT");
      }
    }

    if (missingConfigKeys.length > 0) {
      throw new Error(
        `已启用 USDT 链上通道，但缺少系统配置：${missingConfigKeys.join("、")}`,
      );
    }

    const enabledOnchainAccounts = await prisma.merchantChannelAccount.findMany({
      where: {
        enabled: true,
        channelCode: {
          in: ["usdt.bsc", "usdt.base", "usdt.sol"],
        },
      },
      select: {
        id: true,
        channelCode: true,
        displayName: true,
        config: true,
        merchant: {
          select: {
            code: true,
            name: true,
          },
        },
      },
      orderBy: [{ channelCode: "asc" }, { createdAt: "asc" }],
    });
    const addressMap = new Map<string, string>();

    for (const account of enabledOnchainAccounts) {
      const rawAddress = getChannelConfigAddress(account.config);

      if (!rawAddress) {
        continue;
      }

      let normalizedAddress: string;

      try {
        normalizedAddress = normalizeUsdtReceivingAddress(account.channelCode, rawAddress);
      } catch {
        throw new Error(
          `检测到无效的链上收款地址：${account.merchant.name}（${account.merchant.code}）/ ${account.displayName} / ${account.channelCode}。请修正后再上线。`,
        );
      }
      const dedupeKey = `${account.channelCode}:${normalizedAddress}`;
      const existing = addressMap.get(dedupeKey);
      const currentLabel = `${account.merchant.name}（${account.merchant.code}）/ ${account.displayName}`;

      if (existing) {
        throw new Error(
          `检测到重复的链上收款地址：${account.channelCode} / ${normalizedAddress} 同时出现在 ${existing} 和 ${currentLabel}。请为每个商户使用独立地址。`,
        );
      }

      addressMap.set(dedupeKey, currentLabel);
    }
  }

  console.log(
    JSON.stringify(
      {
        status: "ok",
        publicBaseUrl,
        adminBootstrapConfigured: Boolean(
          process.env.ADMIN_BOOTSTRAP_EMAIL?.trim() &&
            process.env.ADMIN_BOOTSTRAP_PASSWORD?.trim(),
        ),
        adminUsers,
        merchants,
        approvedMerchants,
        enabledChannelAccounts,
        enabledOnchainAccounts,
        enabledOnchainChannelCodes,
        workersRequired,
      },
      null,
      2,
    ),
  );

  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error(error);

  try {
    await getPrismaClient().$disconnect();
  } catch {
    // ignore disconnect failure during preflight
  }

  process.exitCode = 1;
});
