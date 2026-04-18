import type {
  CreatePaymentInput,
  PaymentNotification,
  PaymentProvider,
  ProviderAccountConfig,
} from "@/lib/payments/types";
import {
  USDT_BASE_CHANNEL_CODE,
  USDT_BSC_CHANNEL_CODE,
  USDT_SOL_CHANNEL_CODE,
  isUsdtSolanaChannelCode,
} from "@/lib/payments/channel-codes";
import {
  allocateUsdtTailAmount,
  getUsdtCnyQuote,
  quoteUsdtAmountFromCny,
} from "@/lib/rates/usdt-quote";
import { normalizeUsdtReceivingAddress } from "@/lib/payments/usdt-address";

type UsdtOnchainChannelCode =
  | typeof USDT_BSC_CHANNEL_CODE
  | typeof USDT_BASE_CHANNEL_CODE
  | typeof USDT_SOL_CHANNEL_CODE;

interface UsdtChainDefinition {
  channelCode: UsdtOnchainChannelCode;
  displayName: string;
  description: string;
  networkLabel: string;
  qrHint: string;
}

const CHAIN_DEFINITIONS: Record<UsdtOnchainChannelCode, UsdtChainDefinition> = {
  "usdt.base": {
    channelCode: "usdt.base",
    displayName: "USDT · Base",
    description: "Use a Base-compatible wallet to transfer the exact USDT amount to the configured receiving address.",
    networkLabel: "Base",
    qrHint: "Scan or copy the address, then transfer the exact USDT amount on Base.",
  },
  "usdt.bsc": {
    channelCode: "usdt.bsc",
    displayName: "USDT · BSC",
    description: "Use a BSC-compatible wallet to transfer the exact USDT amount to the configured receiving address.",
    networkLabel: "BSC",
    qrHint: "Scan or copy the address, then transfer the exact USDT amount on BSC.",
  },
  "usdt.sol": {
    channelCode: "usdt.sol",
    displayName: "USDT · Solana",
    description: "Use a Solana wallet to transfer the exact USDT amount to the configured receiving address.",
    networkLabel: "Solana",
    qrHint: "Scan or copy the address, then transfer the exact USDT amount on Solana.",
  },
};

function getAccountValue(account: ProviderAccountConfig | null | undefined, keys: string[]) {
  if (!account) {
    return undefined;
  }

  for (const key of keys) {
    const value = account.config[key];

    if (value) {
      return value;
    }
  }

  return undefined;
}

function getReceivingAddress(account: ProviderAccountConfig | null | undefined) {
  const value = getAccountValue(account, ["walletAddress", "address", "receivingAddress"]);

  if (!value) {
    throw new Error("Receiving address is not configured in the merchant channel instance.");
  }

  return value;
}

function getAddressLabel(account: ProviderAccountConfig | null | undefined) {
  return getAccountValue(account, ["addressLabel", "walletLabel", "remark"]) ?? null;
}

function createUsdtOnchainProvider(chain: UsdtChainDefinition): PaymentProvider {
  return {
    getSummary() {
      return {
        code: chain.channelCode,
        provider: "crypto",
        displayName: chain.displayName,
        description: chain.description,
        configured: false,
        implementationStatus: "ready",
        capabilities: ["native_qr", "return_url", "order_close", "quote_lock"],
      };
    },

    isConfigured(account) {
      try {
        return Boolean(
          normalizeUsdtReceivingAddress(
            chain.channelCode,
            getAccountValue(account, ["walletAddress", "address", "receivingAddress"]),
          ),
        );
      } catch {
        return false;
      }
    },

    async createPayment(input: CreatePaymentInput) {
      const receivingAddress = normalizeUsdtReceivingAddress(
        chain.channelCode,
        getReceivingAddress(input.account),
      );
      const addressLabel = getAddressLabel(input.account);
      const accountId = input.account?.id;

      if (!accountId) {
        throw new Error("Merchant channel instance is missing for this USDT payment.");
      }

      const quote = await getUsdtCnyQuote();
      const effectiveExpireAt =
        input.expireAt && !Number.isNaN(input.expireAt.getTime())
          ? input.expireAt
          : quote.expiresAt;
      const baseQuotedUsdtAmount = quoteUsdtAmountFromCny({
        cnyAmount: input.amount,
        rate: quote.rate,
        spreadBps: quote.spreadBps,
      });
      const tailAllocation = await allocateUsdtTailAmount({
        accountId,
        channelCode: chain.channelCode,
        orderId: input.orderId,
        baseQuotedAmount: baseQuotedUsdtAmount,
      });

      return {
        status: "requires_action",
        mode: "qr_code",
        checkoutUrl: receivingAddress,
        providerStatus: "AWAITING_TRANSFER",
        providerPayload: {
          chainCode: chain.channelCode,
          chainType: isUsdtSolanaChannelCode(chain.channelCode) ? "solana" : "evm",
          networkLabel: chain.networkLabel,
          displayName: chain.displayName,
          tokenSymbol: "USDT",
          receivingAddress,
          addressLabel,
          qrPayload: receivingAddress,
          baseQuotedUsdtAmount: tailAllocation.baseQuotedAmount,
          quotedUsdtAmount: tailAllocation.payableAmount,
          tailOffsetUsdt: tailAllocation.tailOffsetAmount,
          tailSlot: tailAllocation.tailSlot,
          tailStepUsdt: tailAllocation.tailStepAmount,
          tailMaxUsdt: tailAllocation.tailMaxAmount,
          quotedCnyAmount: input.amount,
          quoteRate: quote.rate.toFixed(6),
          quoteSource: quote.source,
          quoteSpreadBps: quote.spreadBps,
          quotedAt: quote.quotedAt.toISOString(),
          quoteExpiresAt: effectiveExpireAt.toISOString(),
          merchantName: input.merchant.name,
          orderSubject: input.subject,
          qrHint: chain.qrHint,
        },
      };
    },

    async closePayment(input): Promise<PaymentNotification> {
      return {
        orderId: input.orderId,
        gatewayOrderId: input.gatewayOrderId ?? null,
        providerStatus: "CLOSED",
        amount: input.amount,
        paidAt: null,
        succeeds: false,
        rawPayload: {
          channelCode: chain.channelCode,
          action: "close",
        },
      };
    },
  };
}

export const usdtBscProvider = createUsdtOnchainProvider(CHAIN_DEFINITIONS["usdt.bsc"]);
export const usdtBaseProvider = createUsdtOnchainProvider(CHAIN_DEFINITIONS["usdt.base"]);
export const usdtSolProvider = createUsdtOnchainProvider(CHAIN_DEFINITIONS["usdt.sol"]);
