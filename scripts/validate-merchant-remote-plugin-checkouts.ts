import { createSign, generateKeyPairSync, randomUUID } from "node:crypto";
import {
  installMerchantMarketplacePlugin,
  installRemoteMarketplacePluginPackage,
  setMarketplacePluginEnabledState,
  syncBuiltinMarketplacePlugins,
} from "@/lib/plugins/marketplace";
import { generateMerchantChannelCallbackToken } from "@/lib/merchant-channel-accounts";
import { createPaymentOrder } from "@/lib/orders/service";
import { getInstalledPaymentProvider } from "@/lib/payments/registry";
import { selectProviderAccountForOrder } from "@/lib/payments/provider-accounts";
import { getPrismaClient } from "@/lib/prisma";

const MERCHANT_CODE = "merchant-remote-plugin-checkouts";

interface ValidationScenario {
  pluginSlug: string;
  channelCode: string;
  providerKey: "alipay" | "wxpay" | "crypto";
  displayName: string;
  accountConfig: Record<string, string>;
  amount: string;
  subject: string;
  description: string;
  mockFetch?: (url: string, init?: RequestInit) => Promise<Response>;
}

function exportPemPair() {
  const { publicKey, privateKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
  });

  return {
    privateKeyPem: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
    publicKeyPem: publicKey.export({ type: "spki", format: "pem" }).toString(),
  };
}

function buildWechatSignedResponse(input: {
  body: string;
  platformPrivateKeyPem: string;
  serial: string;
}) {
  const timestamp = `${Math.floor(Date.now() / 1000)}`;
  const nonce = randomUUID().replace(/-/g, "");
  const message = `${timestamp}\n${nonce}\n${input.body}\n`;
  const signer = createSign("RSA-SHA256");
  signer.update(message, "utf8");
  signer.end();
  const signature = signer.sign(input.platformPrivateKeyPem, "base64");

  return {
    timestamp,
    nonce,
    signature,
    serial: input.serial,
  };
}

async function ensureApprovedMerchant() {
  const prisma = getPrismaClient();
  const existing = await prisma.merchant.findUnique({
    where: { code: MERCHANT_CODE },
  });

  if (existing) {
    return existing;
  }

  return prisma.merchant.create({
    data: {
      code: MERCHANT_CODE,
      name: "Remote Plugin Checkout Merchant",
      status: "APPROVED",
      callbackEnabled: false,
      legalName: "Remote Plugin Checkout Merchant Ltd.",
      contactName: "Checkout Owner",
      contactPhone: "13800138001",
      companyRegistrationId: "91310000REMOTEPLUGIN02",
      approvedAt: new Date(),
      statusChangedAt: new Date(),
    },
  });
}

async function ensureMerchantChannelAccount(input: {
  merchantId: string;
  channelCode: string;
  providerKey: string;
  displayName: string;
  config: Record<string, string>;
}) {
  const prisma = getPrismaClient();
  const existing = await prisma.merchantChannelAccount.findFirst({
    where: {
      merchantId: input.merchantId,
      channelCode: input.channelCode,
    },
    orderBy: [{ updatedAt: "desc" }],
  });

  if (existing) {
    return prisma.merchantChannelAccount.update({
      where: { id: existing.id },
      data: {
        providerKey: input.providerKey,
        displayName: input.displayName,
        config: input.config,
        enabled: true,
      },
    });
  }

  return prisma.merchantChannelAccount.create({
    data: {
      merchantId: input.merchantId,
      providerKey: input.providerKey,
      channelCode: input.channelCode,
      displayName: input.displayName,
      config: input.config,
      callbackToken: generateMerchantChannelCallbackToken(),
      enabled: true,
    },
  });
}

async function ensureMerchantBinding(merchantId: string, channelCode: string, merchantChannelAccountId: string) {
  const prisma = getPrismaClient();
  return prisma.merchantChannelBinding.upsert({
    where: {
      merchantId_channelCode: {
        merchantId,
        channelCode,
      },
    },
    update: {
      enabled: true,
      merchantChannelAccountId,
      providerAccountId: null,
      feeRate: "0",
    },
    create: {
      merchantId,
      channelCode,
      enabled: true,
      merchantChannelAccountId,
      feeRate: "0",
    },
  });
}

async function runScenario(merchantCode: string, scenario: ValidationScenario) {
  const prisma = getPrismaClient();
  const merchant = await prisma.merchant.findUniqueOrThrow({
    where: { code: merchantCode },
  });

  await syncBuiltinMarketplacePlugins(true);
  await installRemoteMarketplacePluginPackage(scenario.pluginSlug);
  await setMarketplacePluginEnabledState({
    slug: scenario.pluginSlug,
    enabled: true,
  });

  await installMerchantMarketplacePlugin({
    merchantId: merchant.id,
    slug: scenario.pluginSlug,
  });

  const account = await ensureMerchantChannelAccount({
    merchantId: merchant.id,
    channelCode: scenario.channelCode,
    providerKey: scenario.providerKey,
    displayName: scenario.displayName,
    config: scenario.accountConfig,
  });
  await ensureMerchantBinding(merchant.id, scenario.channelCode, account.id);

  const originalFetch = globalThis.fetch;
  if (scenario.mockFetch) {
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) =>
      scenario.mockFetch!(input.toString(), init)) as typeof fetch;
  }

  try {
    const provider = await getInstalledPaymentProvider(scenario.channelCode);
    const route = await selectProviderAccountForOrder({
      merchantId: merchant.id,
      channelCode: scenario.channelCode,
      amount: scenario.amount,
    });
    const externalOrderId = `E2E-${randomUUID()}`;
    const result = await createPaymentOrder({
      merchantCode: merchant.code,
      channelCode: scenario.channelCode,
      externalOrderId,
      amount: scenario.amount,
      currency: "CNY",
      subject: scenario.subject,
      description: scenario.description,
    });

    return {
      pluginSlug: scenario.pluginSlug,
      channelCode: scenario.channelCode,
      providerSummary: provider?.getSummary() ?? null,
      routeConfigured: provider?.isConfigured(route.account) ?? false,
      externalOrderId,
      created: result.created,
      orderId: result.order.id,
      status: result.order.status,
      checkoutUrl: result.payment?.checkoutUrl ?? null,
      providerStatus: result.payment?.providerStatus ?? null,
      providerPayload: result.payment?.providerPayload ?? null,
    };
  } finally {
    globalThis.fetch = originalFetch;
  }
}

async function main() {
  const alipayKeys = exportPemPair();
  const wxMerchantKeys = exportPemPair();
  const wxPlatformKeys = exportPemPair();
  const wxBody = JSON.stringify({
    code_url: "weixin://wxpay/bizpayurl?pr=novapay_remote_plugin_test",
  });
  const signedWechatResponse = buildWechatSignedResponse({
    body: wxBody,
    platformPrivateKeyPem: wxPlatformKeys.privateKeyPem,
    serial: "platform-serial-test",
  });

  const merchant = await ensureApprovedMerchant();
  const scenarios: ValidationScenario[] = [
    {
      pluginSlug: "novapay.alipay-page",
      channelCode: "alipay.page",
      providerKey: "alipay",
      displayName: "Alipay Page Remote Plugin",
      accountConfig: {
        appId: "2021000000000000",
        privateKey: alipayKeys.privateKeyPem,
        publicKey: alipayKeys.publicKeyPem,
      },
      amount: "66.00",
      subject: "Remote plugin Alipay checkout validation",
      description: "Validate remote Alipay plugin createPayment flow",
    },
    {
      pluginSlug: "novapay.wxpay-native",
      channelCode: "wxpay.native",
      providerKey: "wxpay",
      displayName: "WeChat Native Remote Plugin",
      accountConfig: {
        appId: "wx1234567890abcdef",
        mchId: "1900000109",
        mchSerialNo: "merchant-serial-test",
        privateKey: wxMerchantKeys.privateKeyPem,
        apiV3Key: "12345678901234567890123456789012",
        platformPublicKey: wxPlatformKeys.publicKeyPem,
        platformSerial: "platform-serial-test",
        apiBaseUrl: "https://api.mch.weixin.qq.com",
      },
      amount: "77.00",
      subject: "Remote plugin WeChat checkout validation",
      description: "Validate remote WeChat Native plugin createPayment flow",
      mockFetch: async (url, init) => {
        if (!url.includes("/v3/pay/transactions/native")) {
          throw new Error(`Unexpected WeChat mock request: ${url}`);
        }

        return new Response(wxBody, {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "wechatpay-timestamp": signedWechatResponse.timestamp,
            "wechatpay-nonce": signedWechatResponse.nonce,
            "wechatpay-signature": signedWechatResponse.signature,
            "wechatpay-serial": signedWechatResponse.serial,
          },
        });
      },
    },
    {
      pluginSlug: "novapay.usdt-base",
      channelCode: "usdt.base",
      providerKey: "crypto",
      displayName: "USDT Polygon Remote Plugin",
      accountConfig: {
        walletAddress: "0x1111111111111111111111111111111111111111",
        addressLabel: "Polygon settlement wallet",
      },
      amount: "88.00",
      subject: "Remote plugin USDT checkout validation",
      description: "Validate remote USDT plugin createPayment flow",
    },
  ];

  const results = [];
  for (const scenario of scenarios) {
    results.push(await runScenario(merchant.code, scenario));
  }

  console.log(
    JSON.stringify(
      {
        merchantCode: merchant.code,
        results,
      },
      null,
      2,
    ),
  );
}

await main();
