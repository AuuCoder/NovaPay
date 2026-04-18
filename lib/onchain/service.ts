import {
  OnchainDepositStatus,
  PaymentStatus,
} from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";
import { applyPaymentNotification } from "@/lib/orders/service";
import {
  USDT_BASE_CHANNEL_CODE,
  USDT_BSC_CHANNEL_CODE,
  USDT_SOL_CHANNEL_CODE,
} from "@/lib/payments/channel-codes";
import {
  normalizeEvmAddress,
  normalizeUsdtReceivingAddress,
} from "@/lib/payments/usdt-address";
import { getPrismaClient } from "@/lib/prisma";
import { getSystemConfig } from "@/lib/system-config";

const TRANSFER_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const DEFAULT_INTERVAL_MS = 15_000;
const DEFAULT_EVM_LOOKBACK_BLOCKS = 180;
const DEFAULT_SOL_SIGNATURE_LIMIT = 50;
const DEFAULT_EVM_CONFIRMATIONS = 12;
const DEFAULT_SOL_CONFIRMATIONS = 1;
const DEFAULT_RPC_TIMEOUT_MS = 10_000;
const USDT_OUTPUT_SCALE = 6;
const evmTokenDecimalsCache = new Map<string, number>();

type SupportedChainCode =
  | typeof USDT_BSC_CHANNEL_CODE
  | typeof USDT_BASE_CHANNEL_CODE
  | typeof USDT_SOL_CHANNEL_CODE;

type EvmChainCode = typeof USDT_BSC_CHANNEL_CODE | typeof USDT_BASE_CHANNEL_CODE;

interface OnchainWorkerConfig {
  intervalMs: number;
  evmLookbackBlocks: number;
  solSignatureLimit: number;
  bsc: {
    rpcUrl: string | null;
    tokenContract: string | null;
    requiredConfirmations: number;
  };
  base: {
    rpcUrl: string | null;
    tokenContract: string | null;
    requiredConfirmations: number;
  };
  sol: {
    rpcUrl: string | null;
    mintAddress: string | null;
    requiredConfirmations: number;
  };
}

interface MerchantChainAccountSnapshot {
  id: string;
  channelCode: string;
  config: unknown;
}

interface ChainScanResult {
  scannedAccounts: number;
  detected: number;
  matched: number;
  skipped: boolean;
  errors: number;
  error?: string | null;
}

interface RematchResult {
  checked: number;
  matched: number;
  ambiguous: number;
  pending: number;
  error?: string | null;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parsePositiveNumber(value: string | undefined, fallback: number) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : fallback;
}

function parseRpcUrls(value: string | null | undefined) {
  return (value ?? "")
    .split(/[\s,]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function toRpcEndpointHost(value: string) {
  try {
    return new URL(value).host;
  } catch {
    return value;
  }
}

function getStringRecord(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value)
      .filter(([, item]) => item !== undefined && item !== null)
      .map(([key, item]) => [key, String(item)]),
  );
}

function toJsonValue(value: Record<string, unknown>) {
  return value as Prisma.InputJsonValue;
}

function getAddressFromConfig(account: MerchantChainAccountSnapshot) {
  const config = getStringRecord(account.config);
  const value = config.walletAddress ?? config.receivingAddress ?? config.address ?? "";
  return normalizeUsdtReceivingAddress(account.channelCode, value);
}

function dedupeAccountsByAddress(accounts: MerchantChainAccountSnapshot[]) {
  const addressToAccount = new Map<string, MerchantChainAccountSnapshot>();
  const uniqueAccounts: MerchantChainAccountSnapshot[] = [];
  const duplicateAccounts: MerchantChainAccountSnapshot[] = [];

  for (const account of accounts) {
    try {
      const address = getAddressFromConfig(account);
      const existing = addressToAccount.get(address);

      if (existing) {
        duplicateAccounts.push(account);
        console.error(
          `[onchain-worker] duplicate receiving address detected for ${account.channelCode}: ${address}. Keeping account ${existing.id}, skipping account ${account.id}.`,
        );
        continue;
      }

      addressToAccount.set(address, account);
      uniqueAccounts.push(account);
    } catch (error) {
      duplicateAccounts.push(account);
      console.error(
        `[onchain-worker] invalid receiving address on account ${account.id}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  return {
    uniqueAccounts,
    duplicateAccounts,
  };
}

function padTopicAddress(value: string) {
  return `0x${normalizeEvmAddress(value).slice(2).padStart(64, "0")}`;
}

function hexToBigInt(value: string) {
  return BigInt(value);
}

function formatTokenAmount(rawAmount: bigint, decimals: number, scale = USDT_OUTPUT_SCALE) {
  const normalizedScale = Math.max(scale, 0);
  const zero = BigInt(0);
  const raw = rawAmount < zero ? -rawAmount : rawAmount;

  if (decimals === normalizedScale) {
    const divisor = BigInt(10) ** BigInt(normalizedScale);
    const whole = raw / divisor;
    const fraction = raw % divisor;
    return `${rawAmount < zero ? "-" : ""}${whole}.${fraction
      .toString()
      .padStart(normalizedScale, "0")}`;
  }

  if (decimals > normalizedScale) {
    const divisor = BigInt(10) ** BigInt(decimals - normalizedScale);
    return formatTokenAmount(raw / divisor, normalizedScale, normalizedScale);
  }

  const multiplier = BigInt(10) ** BigInt(normalizedScale - decimals);
  return formatTokenAmount(raw * multiplier, normalizedScale, normalizedScale);
}

async function fetchJsonRpc<T>(rpcUrl: string, method: string, params: unknown[]) {
  const candidates = parseRpcUrls(rpcUrl);

  if (candidates.length === 0) {
    throw new Error(`No RPC endpoint configured for ${method}`);
  }

  let lastError: Error | null = null;

  for (const candidate of candidates) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), DEFAULT_RPC_TIMEOUT_MS);

    try {
      const response = await fetch(candidate, {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: `${method}_${Date.now()}`,
          method,
          params,
        }),
        cache: "no-store",
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const payload = (await response.json()) as {
        result?: T;
        error?: {
          message?: string;
        };
      };

      if (payload.error) {
        throw new Error(payload.error.message ?? `${method} failed`);
      }

      return payload.result as T;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      lastError = new Error(
        `${method} failed via ${toRpcEndpointHost(candidate)}: ${message}`,
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  throw lastError ?? new Error(`${method} failed`);
}

async function getEvmTokenDecimals(rpcUrl: string, tokenContract: string) {
  const cacheKey = `${rpcUrl}::${tokenContract.toLowerCase()}`;
  const cached = evmTokenDecimalsCache.get(cacheKey);

  if (cached !== undefined) {
    return cached;
  }

  const result = await fetchJsonRpc<string>(rpcUrl, "eth_call", [
    {
      to: tokenContract,
      data: "0x313ce567",
    },
    "latest",
  ]);
  const decimals = Number(hexToBigInt(result));
  evmTokenDecimalsCache.set(cacheKey, decimals);
  return decimals;
}

async function getOnchainAccounts(channelCode: SupportedChainCode) {
  const prisma = getPrismaClient();
  return prisma.merchantChannelAccount.findMany({
    where: {
      enabled: true,
      channelCode,
    },
    select: {
      id: true,
      channelCode: true,
      config: true,
    },
  });
}

function toObservedAt(value: Date | null | undefined, fallback = new Date()) {
  return value && !Number.isNaN(value.getTime()) ? value : fallback;
}

async function upsertDeposit(input: {
  amount: string;
  blockNumber: bigint | null;
  chainCode: SupportedChainCode;
  merchantChannelAccountId: string;
  observedAt: Date;
  rawPayload: Record<string, unknown>;
  recipientAddress: string;
  requiredConfirmations: number;
  txHash: string;
  txIndex: string;
}) {
  const prisma = getPrismaClient();

  return prisma.onchainDeposit.upsert({
    where: {
      chainCode_txHash_txIndex: {
        chainCode: input.chainCode,
        txHash: input.txHash,
        txIndex: input.txIndex,
      },
    },
    update: {
      merchantChannelAccountId: input.merchantChannelAccountId,
      recipientAddress: input.recipientAddress,
      amount: input.amount,
      blockNumber: input.blockNumber,
      confirmations: input.requiredConfirmations,
      requiredConfirmations: input.requiredConfirmations,
      observedAt: input.observedAt,
      confirmedAt: input.observedAt,
      rawPayload: toJsonValue(input.rawPayload),
    },
    create: {
      chainCode: input.chainCode,
      tokenCode: "USDT",
      merchantChannelAccountId: input.merchantChannelAccountId,
      recipientAddress: input.recipientAddress,
      amount: input.amount,
      txHash: input.txHash,
      txIndex: input.txIndex,
      blockNumber: input.blockNumber,
      confirmations: input.requiredConfirmations,
      requiredConfirmations: input.requiredConfirmations,
      observedAt: input.observedAt,
      confirmedAt: input.observedAt,
      rawPayload: toJsonValue(input.rawPayload),
      status: OnchainDepositStatus.CONFIRMED,
    },
  });
}

async function matchDepositToOrder(deposit: {
  id: string;
  amount: { toString(): string };
  chainCode: string;
  merchantChannelAccountId: string | null;
  observedAt: Date;
  paymentOrderId: string | null;
  recipientAddress: string;
  txHash: string;
  txIndex: string;
}) {
  if (!deposit.merchantChannelAccountId || deposit.paymentOrderId) {
    return { matched: false, reason: "no_account_or_already_matched" as const };
  }

  const prisma = getPrismaClient();
  const candidates = await prisma.paymentOrder.findMany({
    where: {
      merchantChannelAccountId: deposit.merchantChannelAccountId,
      channelCode: deposit.chainCode,
      payableAmount: deposit.amount.toString(),
      payableCurrency: "USDT",
      createdAt: {
        lte: deposit.observedAt,
      },
      AND: [
        {
          OR: [
            {
              quoteExpiresAt: null,
            },
            {
              quoteExpiresAt: {
                gte: deposit.observedAt,
              },
            },
          ],
        },
        {
          OR: [
            {
              expireAt: null,
            },
            {
              expireAt: {
                gte: deposit.observedAt,
              },
            },
          ],
        },
        {
          OR: [
            {
              status: {
                in: [PaymentStatus.PENDING, PaymentStatus.PROCESSING],
              },
            },
            {
              status: PaymentStatus.CANCELLED,
              updatedAt: {
                gte: deposit.observedAt,
              },
            },
          ],
        },
      ],
    },
    orderBy: [{ createdAt: "asc" }],
    take: 2,
    select: {
      id: true,
    },
  });

  if (candidates.length !== 1) {
    return {
      matched: false,
      reason: candidates.length === 0 ? ("not_found" as const) : ("ambiguous" as const),
    };
  }

  const matchedOrder = candidates[0];
  await applyPaymentNotification({
    orderId: matchedOrder.id,
    gatewayOrderId: deposit.txHash,
    providerStatus: "ONCHAIN_CONFIRMED",
    paidAt: deposit.observedAt,
    succeeds: true,
    rawPayload: {
      chainCode: deposit.chainCode,
      depositId: deposit.id,
      recipientAddress: deposit.recipientAddress,
      txHash: deposit.txHash,
      txIndex: deposit.txIndex,
    },
  });

  await prisma.onchainDeposit.update({
    where: {
      id: deposit.id,
    },
    data: {
      paymentOrderId: matchedOrder.id,
      status: OnchainDepositStatus.MATCHED,
    },
  });

  return {
    matched: true,
    reason: "matched" as const,
    paymentOrderId: matchedOrder.id,
  };
}

async function rematchConfirmedDeposits() {
  const prisma = getPrismaClient();
  const deposits = await prisma.onchainDeposit.findMany({
    where: {
      status: OnchainDepositStatus.CONFIRMED,
      paymentOrderId: null,
    },
    orderBy: [{ observedAt: "asc" }],
    select: {
      id: true,
      amount: true,
      chainCode: true,
      merchantChannelAccountId: true,
      observedAt: true,
      paymentOrderId: true,
      recipientAddress: true,
      txHash: true,
      txIndex: true,
    },
  });

  let matched = 0;
  let ambiguous = 0;
  let pending = 0;

  for (const deposit of deposits) {
    const result = await matchDepositToOrder(deposit);

    if (result.matched) {
      matched += 1;
      continue;
    }

    if (result.reason === "ambiguous") {
      ambiguous += 1;
    } else {
      pending += 1;
    }
  }

  return {
    checked: deposits.length,
    matched,
    ambiguous,
    pending,
  };
}

async function scanEvmChain(input: {
  chainCode: EvmChainCode;
  evmLookbackBlocks: number;
  requiredConfirmations: number;
  rpcUrl: string | null;
  tokenContract: string | null;
}): Promise<ChainScanResult> {
  if (!input.rpcUrl || !input.tokenContract) {
    return {
      scannedAccounts: 0,
      detected: 0,
      matched: 0,
      skipped: true,
      errors: 0,
    };
  }

  const accounts = await getOnchainAccounts(input.chainCode);
  const { uniqueAccounts, duplicateAccounts } = dedupeAccountsByAddress(accounts);

  if (uniqueAccounts.length === 0) {
    return {
      scannedAccounts: 0,
      detected: 0,
      matched: 0,
      skipped: false,
      errors: duplicateAccounts.length,
    };
  }

  const currentBlockHex = await fetchJsonRpc<string>(input.rpcUrl, "eth_blockNumber", []);
  const currentBlock = hexToBigInt(currentBlockHex);
  const requiredConfirmations = BigInt(Math.max(input.requiredConfirmations, 1));
  const safeBlock =
    currentBlock >= requiredConfirmations
      ? currentBlock - requiredConfirmations + BigInt(1)
      : BigInt(-1);

  if (safeBlock < BigInt(0)) {
    return {
      scannedAccounts: uniqueAccounts.length,
      detected: 0,
      matched: 0,
      skipped: false,
      errors: duplicateAccounts.length,
    };
  }

  const tokenContract = normalizeEvmAddress(input.tokenContract);
  const decimals = await getEvmTokenDecimals(input.rpcUrl, tokenContract);
  const fromBlock =
    safeBlock > BigInt(input.evmLookbackBlocks)
      ? safeBlock - BigInt(input.evmLookbackBlocks) + BigInt(1)
      : BigInt(0);
  const blockTimestampCache = new Map<string, Date>();
  let detected = 0;
  let matched = 0;
  let errors = duplicateAccounts.length;

  for (const account of uniqueAccounts) {
    try {
      const walletAddress = getAddressFromConfig(account);

      if (!walletAddress) {
        continue;
      }

      const normalizedAddress = normalizeEvmAddress(walletAddress);
      const logs = await fetchJsonRpc<
        Array<{
          address: string;
          blockNumber: string;
          data: string;
          logIndex: string;
          topics: string[];
          transactionHash: string;
        }>
      >(input.rpcUrl, "eth_getLogs", [
        {
          address: tokenContract,
          fromBlock: `0x${fromBlock.toString(16)}`,
          toBlock: `0x${safeBlock.toString(16)}`,
          topics: [TRANSFER_TOPIC, null, padTopicAddress(normalizedAddress)],
        },
      ]);

      for (const log of logs) {
        const blockNumber = hexToBigInt(log.blockNumber);
        const blockKey = log.blockNumber.toLowerCase();
        let observedAt = blockTimestampCache.get(blockKey) ?? null;

        if (!observedAt) {
          const block = await fetchJsonRpc<{ timestamp: string }>(input.rpcUrl, "eth_getBlockByNumber", [
            log.blockNumber,
            false,
          ]);
          observedAt = new Date(Number(hexToBigInt(block.timestamp)) * 1_000);
          blockTimestampCache.set(blockKey, observedAt);
        }

        const deposit = await upsertDeposit({
          amount: formatTokenAmount(hexToBigInt(log.data), decimals),
          blockNumber,
          chainCode: input.chainCode,
          merchantChannelAccountId: account.id,
          observedAt: toObservedAt(observedAt),
          rawPayload: {
            address: log.address,
            blockNumber: log.blockNumber,
            logIndex: log.logIndex,
            topics: log.topics,
            transactionHash: log.transactionHash,
          },
          recipientAddress: normalizedAddress,
          requiredConfirmations: input.requiredConfirmations,
          txHash: log.transactionHash,
          txIndex: log.logIndex,
        });
        detected += 1;

        const result = await matchDepositToOrder({
          id: deposit.id,
          amount: deposit.amount,
          chainCode: deposit.chainCode,
          merchantChannelAccountId: deposit.merchantChannelAccountId,
          observedAt: deposit.observedAt,
          paymentOrderId: deposit.paymentOrderId,
          recipientAddress: deposit.recipientAddress,
          txHash: deposit.txHash,
          txIndex: deposit.txIndex,
        });

        if (result.matched) {
          matched += 1;
        }
      }
    } catch (error) {
      errors += 1;
      console.error(
        `[onchain-worker] ${input.chainCode} account ${account.id} scan failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  return {
    scannedAccounts: uniqueAccounts.length,
    detected,
    matched,
    skipped: false,
    errors,
  };
}

async function scanSolChain(input: {
  requiredConfirmations: number;
  rpcUrl: string | null;
  mintAddress: string | null;
  signatureLimit: number;
}): Promise<ChainScanResult> {
  if (!input.rpcUrl || !input.mintAddress) {
    return {
      scannedAccounts: 0,
      detected: 0,
      matched: 0,
      skipped: true,
      errors: 0,
    };
  }

  const accounts = await getOnchainAccounts(USDT_SOL_CHANNEL_CODE);
  const { uniqueAccounts, duplicateAccounts } = dedupeAccountsByAddress(accounts);

  if (uniqueAccounts.length === 0) {
    return {
      scannedAccounts: 0,
      detected: 0,
      matched: 0,
      skipped: false,
      errors: duplicateAccounts.length,
    };
  }

  let detected = 0;
  let matched = 0;
  let errors = duplicateAccounts.length;

  for (const account of uniqueAccounts) {
    try {
      const walletAddress = getAddressFromConfig(account);

      if (!walletAddress) {
        continue;
      }

      const tokenAccounts = await fetchJsonRpc<{
        value: Array<{
          pubkey: string;
        }>;
      }>(input.rpcUrl, "getTokenAccountsByOwner", [
        walletAddress,
        {
          mint: input.mintAddress,
        },
        {
          encoding: "jsonParsed",
          commitment: "finalized",
        },
      ]);

      for (const tokenAccount of tokenAccounts.value) {
        const signatures = await fetchJsonRpc<
          Array<{
            signature: string;
            blockTime?: number | null;
            slot: number;
          }>
        >(input.rpcUrl, "getSignaturesForAddress", [
          tokenAccount.pubkey,
          {
            commitment: "finalized",
            limit: input.signatureLimit,
          },
        ]);

        for (const signatureInfo of signatures) {
          const transaction = await fetchJsonRpc<{
            blockTime?: number | null;
            meta?: {
              postTokenBalances?: Array<{
                accountIndex: number;
                mint?: string;
                uiTokenAmount?: { amount?: string; decimals?: number };
              }>;
              preTokenBalances?: Array<{
                accountIndex: number;
                mint?: string;
                uiTokenAmount?: { amount?: string; decimals?: number };
              }>;
            };
            transaction?: {
              message?: {
                accountKeys?: Array<
                  | string
                  | {
                      pubkey?: string;
                    }
                >;
              };
            };
          } | null>(input.rpcUrl, "getTransaction", [
            signatureInfo.signature,
            {
              commitment: "finalized",
              encoding: "jsonParsed",
              maxSupportedTransactionVersion: 0,
            },
          ]);

          if (!transaction?.meta || !transaction.transaction?.message?.accountKeys) {
            continue;
          }

          const accountKeys = transaction.transaction.message.accountKeys.map((entry) =>
            typeof entry === "string" ? entry : String(entry.pubkey ?? ""),
          );
          const postBalance = transaction.meta.postTokenBalances?.find(
            (entry) =>
              entry.mint === input.mintAddress &&
              accountKeys[entry.accountIndex] === tokenAccount.pubkey,
          );
          const preBalance = transaction.meta.preTokenBalances?.find(
            (entry) =>
              entry.mint === input.mintAddress &&
              accountKeys[entry.accountIndex] === tokenAccount.pubkey,
          );
          const postAmount = BigInt(postBalance?.uiTokenAmount?.amount ?? "0");
          const preAmount = BigInt(preBalance?.uiTokenAmount?.amount ?? "0");
          const delta = postAmount - preAmount;

          if (delta <= BigInt(0)) {
            continue;
          }

          const decimals = Number(postBalance?.uiTokenAmount?.decimals ?? preBalance?.uiTokenAmount?.decimals ?? 6);
          const deposit = await upsertDeposit({
            amount: formatTokenAmount(delta, decimals),
            blockNumber: signatureInfo.slot ? BigInt(signatureInfo.slot) : null,
            chainCode: USDT_SOL_CHANNEL_CODE,
            merchantChannelAccountId: account.id,
            observedAt: toObservedAt(
              transaction.blockTime ? new Date(transaction.blockTime * 1_000) : null,
            ),
            rawPayload: {
              signature: signatureInfo.signature,
              slot: signatureInfo.slot,
              tokenAccount: tokenAccount.pubkey,
            },
            recipientAddress: walletAddress,
            requiredConfirmations: input.requiredConfirmations,
            txHash: signatureInfo.signature,
            txIndex: tokenAccount.pubkey,
          });
          detected += 1;

          const result = await matchDepositToOrder({
            id: deposit.id,
            amount: deposit.amount,
            chainCode: deposit.chainCode,
            merchantChannelAccountId: deposit.merchantChannelAccountId,
            observedAt: deposit.observedAt,
            paymentOrderId: deposit.paymentOrderId,
            recipientAddress: deposit.recipientAddress,
            txHash: deposit.txHash,
            txIndex: deposit.txIndex,
          });

          if (result.matched) {
            matched += 1;
          }
        }
      }
    } catch (error) {
      errors += 1;
      console.error(
        `[onchain-worker] ${USDT_SOL_CHANNEL_CODE} account ${account.id} scan failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  return {
    scannedAccounts: uniqueAccounts.length,
    detected,
    matched,
    skipped: false,
    errors,
  };
}

async function safeChainScan(label: string, runner: () => Promise<ChainScanResult>) {
  try {
    const result = await runner();
    return {
      ...result,
      error: null,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[onchain-worker] ${label} task failed: ${message}`);
    return {
      scannedAccounts: 0,
      detected: 0,
      matched: 0,
      skipped: true,
      errors: 1,
      error: message,
    } satisfies ChainScanResult;
  }
}

async function safeRematchTask(runner: () => Promise<RematchResult>) {
  try {
    const result = await runner();
    return {
      ...result,
      error: null,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[onchain-worker] rematch task failed: ${message}`);
    return {
      checked: 0,
      matched: 0,
      ambiguous: 0,
      pending: 0,
      error: message,
    } satisfies RematchResult;
  }
}

export async function getOnchainWorkerConfig(): Promise<OnchainWorkerConfig> {
  const [
    intervalMsRaw,
    evmLookbackBlocksRaw,
    solSignatureLimitRaw,
    bscRpcUrl,
    bscTokenContract,
    bscConfirmationsRaw,
    baseRpcUrl,
    baseTokenContract,
    baseConfirmationsRaw,
    solRpcUrl,
    solMintAddress,
    solConfirmationsRaw,
  ] = await Promise.all([
    getSystemConfig("ONCHAIN_WORKER_INTERVAL_MS"),
    getSystemConfig("USDT_EVM_LOOKBACK_BLOCKS"),
    getSystemConfig("USDT_SOL_SIGNATURE_LIMIT"),
    getSystemConfig("USDT_BSC_RPC_URL"),
    getSystemConfig("USDT_BSC_TOKEN_CONTRACT"),
    getSystemConfig("USDT_BSC_CONFIRMATIONS"),
    getSystemConfig("USDT_BASE_RPC_URL"),
    getSystemConfig("USDT_BASE_TOKEN_CONTRACT"),
    getSystemConfig("USDT_BASE_CONFIRMATIONS"),
    getSystemConfig("USDT_SOL_RPC_URL"),
    getSystemConfig("USDT_SOL_MINT"),
    getSystemConfig("USDT_SOL_CONFIRMATIONS"),
  ]);

  return {
    intervalMs: parsePositiveNumber(intervalMsRaw, DEFAULT_INTERVAL_MS),
    evmLookbackBlocks: parsePositiveNumber(evmLookbackBlocksRaw, DEFAULT_EVM_LOOKBACK_BLOCKS),
    solSignatureLimit: parsePositiveNumber(solSignatureLimitRaw, DEFAULT_SOL_SIGNATURE_LIMIT),
    bsc: {
      rpcUrl: bscRpcUrl?.trim() || null,
      tokenContract: bscTokenContract?.trim() || null,
      requiredConfirmations: parsePositiveNumber(
        bscConfirmationsRaw,
        DEFAULT_EVM_CONFIRMATIONS,
      ),
    },
    base: {
      rpcUrl: baseRpcUrl?.trim() || null,
      tokenContract: baseTokenContract?.trim() || null,
      requiredConfirmations: parsePositiveNumber(
        baseConfirmationsRaw,
        DEFAULT_EVM_CONFIRMATIONS,
      ),
    },
    sol: {
      rpcUrl: solRpcUrl?.trim() || null,
      mintAddress: solMintAddress?.trim() || null,
      requiredConfirmations: parsePositiveNumber(
        solConfirmationsRaw,
        DEFAULT_SOL_CONFIRMATIONS,
      ),
    },
  };
}

export async function runOnchainMaintenance() {
  const config = await getOnchainWorkerConfig();
  const [bsc, base, sol, rematch] = await Promise.all([
    safeChainScan("bsc", () =>
      scanEvmChain({
        chainCode: USDT_BSC_CHANNEL_CODE,
        evmLookbackBlocks: config.evmLookbackBlocks,
        requiredConfirmations: config.bsc.requiredConfirmations,
        rpcUrl: config.bsc.rpcUrl,
        tokenContract: config.bsc.tokenContract,
      }),
    ),
    safeChainScan("base", () =>
      scanEvmChain({
        chainCode: USDT_BASE_CHANNEL_CODE,
        evmLookbackBlocks: config.evmLookbackBlocks,
        requiredConfirmations: config.base.requiredConfirmations,
        rpcUrl: config.base.rpcUrl,
        tokenContract: config.base.tokenContract,
      }),
    ),
    safeChainScan("sol", () =>
      scanSolChain({
        requiredConfirmations: config.sol.requiredConfirmations,
        rpcUrl: config.sol.rpcUrl,
        mintAddress: config.sol.mintAddress,
        signatureLimit: config.solSignatureLimit,
      }),
    ),
    safeRematchTask(rematchConfirmedDeposits),
  ]);

  return {
    config: {
      intervalMs: config.intervalMs,
      evmLookbackBlocks: config.evmLookbackBlocks,
      solSignatureLimit: config.solSignatureLimit,
    },
    chains: {
      bsc,
      base,
      sol,
    },
    rematch,
  };
}

export { sleep };
