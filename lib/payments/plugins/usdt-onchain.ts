import {
  usdtBaseProvider,
  usdtBscProvider,
  usdtSolProvider,
} from "@/lib/payments/providers/usdt-onchain";
import type { PaymentChannelCode } from "@/lib/payments/types";
import type {
  LocalizedText,
  PaymentPluginDefinition,
} from "@/lib/payments/plugins/types";

function createUsdtOnchainPlugin(input: {
  channelCode: PaymentChannelCode;
  title: {
    zh: string;
    en: string;
  };
  networkLabel: {
    zh: string;
    en: string;
  };
  walletPlaceholder: string;
  addressLabelPlaceholder: LocalizedText;
  provider: PaymentPluginDefinition["provider"];
  marketplace: {
    slug: string;
    packageName: string;
    version: string;
  };
}): PaymentPluginDefinition {
  return {
    channelCode: input.channelCode,
    providerKey: "crypto",
    provider: input.provider,
    marketplace: {
      slug: input.marketplace.slug,
      packageName: input.marketplace.packageName,
      vendor: "NovaPay Core",
      version: input.marketplace.version,
      category: {
        zh: "链上支付",
        en: "On-chain Payment",
      },
      summary: {
        zh: `受控内置 ${input.networkLabel.zh} 链 USDT 插件，支持托管收银页、锁价与链上到账匹配。`,
        en: `Trusted built-in ${input.networkLabel.en} USDT plugin with hosted checkout, quote locking, and on-chain settlement matching.`,
      },
      description: {
        zh: `由 NovaPay 核心团队维护，适配商户自有 ${input.networkLabel.zh} 链收款地址，并与链上 worker 协同完成到账识别。`,
        en: `Maintained by the NovaPay core team for merchant-owned ${input.networkLabel.en} receiving addresses, coordinated with NovaPay on-chain workers for deposit recognition.`,
      },
    },
    adminOption: {
      title: input.title,
      detail: {
        zh: `商户自有 ${input.networkLabel.zh} 链 USDT 收款地址，已支持托管收银页、锁价和链上到账匹配。`,
        en: `Merchant-owned ${input.networkLabel.en} USDT receiving address with hosted checkout, quote lock, and on-chain matching.`,
      },
    },
    merchantTemplate: {
      title: input.title,
      description: {
        zh: `商户维护自己的 ${input.networkLabel.zh} 链 USDT 收款地址。系统会为该通道生成托管支付页、锁定报价并匹配链上到账。`,
        en: `The merchant provides its own ${input.networkLabel.en} USDT receiving address. NovaPay generates a hosted checkout page, locks the quote, and matches on-chain deposits for this channel.`,
      },
      requiresMerchantProfileCompletion: false,
      fields: [
        {
          key: "walletAddress",
          label: {
            zh: "收款地址",
            en: "Receiving Address",
          },
          required: true,
          placeholder: input.walletPlaceholder,
        },
        {
          key: "addressLabel",
          label: {
            zh: "地址备注",
            en: "Address Label",
          },
          placeholder: input.addressLabelPlaceholder,
        },
      ],
    },
  };
}

export const usdtBscPlugin = createUsdtOnchainPlugin({
  channelCode: "usdt.bsc",
  title: {
    zh: "USDT · BSC",
    en: "USDT on BSC",
  },
  networkLabel: {
    zh: "BSC",
    en: "BSC",
  },
  walletPlaceholder: "0x...",
  addressLabelPlaceholder: {
    zh: "BSC 主收款钱包",
    en: "BSC main wallet",
  },
  marketplace: {
    slug: "novapay.usdt-bsc",
    packageName: "@novapay/plugin-usdt-bsc",
    version: "1.0.0",
  },
  provider: usdtBscProvider,
});

export const usdtBasePlugin = createUsdtOnchainPlugin({
  channelCode: "usdt.base",
  title: {
    zh: "USDT · Base",
    en: "USDT on Base",
  },
  networkLabel: {
    zh: "Base",
    en: "Base",
  },
  walletPlaceholder: "0x...",
  addressLabelPlaceholder: {
    zh: "Base 结算钱包",
    en: "Base settlement wallet",
  },
  marketplace: {
    slug: "novapay.usdt-base",
    packageName: "@novapay/plugin-usdt-base",
    version: "1.0.0",
  },
  provider: usdtBaseProvider,
});

export const usdtSolPlugin = createUsdtOnchainPlugin({
  channelCode: "usdt.sol",
  title: {
    zh: "USDT · Solana",
    en: "USDT on Solana",
  },
  networkLabel: {
    zh: "Solana",
    en: "Solana",
  },
  walletPlaceholder: "9xQeWvG816bUx9EP...",
  addressLabelPlaceholder: {
    zh: "Solana 收款钱包",
    en: "Solana receiving wallet",
  },
  marketplace: {
    slug: "novapay.usdt-sol",
    packageName: "@novapay/plugin-usdt-sol",
    version: "1.0.0",
  },
  provider: usdtSolProvider,
});
