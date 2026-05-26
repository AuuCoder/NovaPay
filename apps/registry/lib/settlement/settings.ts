import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getPrismaClient } from "../runtime/prisma-client";
import { maskStoredSecret, migrateStoredSecret, revealStoredSecret } from "../security/secret-box";

export interface SettlementSettings {
  developerRevenueSharePercent: number;
  platformRevenueSharePercent: number;
  payoutHoldDays: number;
  registryNovaPayMerchantCode: string | null;
  registryNovaPayApiKeyId: string | null;
  registryNovaPayApiKeySecret: string | null;
  registryNovaPayNotifySecret: string | null;
  registryNovaPayChannelCode: string | null;
  updatedAt: string;
}

interface RegistrySettingRow {
  key: string;
  value: unknown;
  updatedAt: Date;
}

const REGISTRY_PROJECT_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
);
const SETTINGS_FILE = path.join(
  REGISTRY_PROJECT_ROOT,
  ".tmp",
  "registry-settlement-settings.json",
);
const SETTINGS_KEY = "settlement_policy";

const DEFAULT_SETTINGS: SettlementSettings = {
  developerRevenueSharePercent: 70,
  platformRevenueSharePercent: 30,
  payoutHoldDays: 7,
  registryNovaPayMerchantCode: null,
  registryNovaPayApiKeyId: null,
  registryNovaPayApiKeySecret: null,
  registryNovaPayNotifySecret: null,
  registryNovaPayChannelCode: "alipay.page",
  updatedAt: new Date().toISOString(),
};

let prismaHydrationPromise: Promise<void> | null = null;

function normalizeSettings(input?: Partial<SettlementSettings> | null) {
  const developerRevenueSharePercent = Math.max(
    0,
    Math.min(
      100,
      Math.trunc(
        typeof input?.developerRevenueSharePercent === "number"
          ? input.developerRevenueSharePercent
          : DEFAULT_SETTINGS.developerRevenueSharePercent,
      ),
    ),
  );
  const payoutHoldDays = Math.max(
    0,
    Math.trunc(
      typeof input?.payoutHoldDays === "number"
        ? input.payoutHoldDays
        : DEFAULT_SETTINGS.payoutHoldDays,
    ),
  );

  return {
    developerRevenueSharePercent,
    platformRevenueSharePercent: 100 - developerRevenueSharePercent,
    payoutHoldDays,
    registryNovaPayMerchantCode:
      typeof input?.registryNovaPayMerchantCode === "string"
        ? input.registryNovaPayMerchantCode
        : DEFAULT_SETTINGS.registryNovaPayMerchantCode,
    registryNovaPayApiKeyId:
      typeof input?.registryNovaPayApiKeyId === "string"
        ? input.registryNovaPayApiKeyId
        : DEFAULT_SETTINGS.registryNovaPayApiKeyId,
    registryNovaPayApiKeySecret:
      typeof input?.registryNovaPayApiKeySecret === "string"
        ? migrateStoredSecret(input.registryNovaPayApiKeySecret)
        : DEFAULT_SETTINGS.registryNovaPayApiKeySecret,
    registryNovaPayNotifySecret:
      typeof input?.registryNovaPayNotifySecret === "string"
        ? migrateStoredSecret(input.registryNovaPayNotifySecret)
        : DEFAULT_SETTINGS.registryNovaPayNotifySecret,
    registryNovaPayChannelCode:
      typeof input?.registryNovaPayChannelCode === "string" && input.registryNovaPayChannelCode.trim()
        ? input.registryNovaPayChannelCode.trim()
        : DEFAULT_SETTINGS.registryNovaPayChannelCode,
    updatedAt: input?.updatedAt ?? new Date().toISOString(),
  } satisfies SettlementSettings;
}

function loadFileSettings() {
  if (!existsSync(SETTINGS_FILE)) {
    return { ...DEFAULT_SETTINGS };
  }

  try {
    const parsed = JSON.parse(readFileSync(SETTINGS_FILE, "utf8")) as Partial<SettlementSettings>;
    return normalizeSettings(parsed);
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function saveFileSettings(settings: SettlementSettings) {
  mkdirSync(path.dirname(SETTINGS_FILE), { recursive: true });
  writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2), "utf8");
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function getPrismaRegistrySettingClient() {
  const prisma = (await getPrismaClient()) as
    | { registrySetting?: Record<string, unknown> }
    | null;
  return prisma && prisma.registrySetting ? (prisma as Record<string, unknown>) : null;
}

async function ensurePrismaHydrated(prisma: Record<string, unknown>) {
  if (prismaHydrationPromise) {
    return prismaHydrationPromise;
  }

  prismaHydrationPromise = (async () => {
    const registrySetting = prisma.registrySetting as {
      findUnique(args: unknown): Promise<RegistrySettingRow | null>;
      upsert(args: unknown): Promise<unknown>;
    };

    const existing = await registrySetting.findUnique({
      where: { key: SETTINGS_KEY },
    }).catch(() => null);

    if (existing) {
      return;
    }

    if (!existsSync(SETTINGS_FILE)) {
      return;
    }

    await registrySetting.upsert({
      where: { key: SETTINGS_KEY },
      update: {
        value: loadFileSettings(),
      },
      create: {
        key: SETTINGS_KEY,
        value: loadFileSettings(),
      },
    });
  })().finally(() => {
    prismaHydrationPromise = null;
  });

  return prismaHydrationPromise;
}

export async function getSettlementSettings() {
  const prisma = await getPrismaRegistrySettingClient();
  if (prisma) {
    try {
      await ensurePrismaHydrated(prisma);
      const row = (await (
        prisma.registrySetting as {
          findUnique(args: unknown): Promise<RegistrySettingRow | null>;
        }
      ).findUnique({
        where: { key: SETTINGS_KEY },
      })) as RegistrySettingRow | null;

      if (row && isObjectRecord(row.value)) {
        return normalizeSettings({
          developerRevenueSharePercent:
            typeof row.value.developerRevenueSharePercent === "number"
              ? row.value.developerRevenueSharePercent
              : undefined,
          payoutHoldDays:
            typeof row.value.payoutHoldDays === "number"
              ? row.value.payoutHoldDays
              : undefined,
          registryNovaPayMerchantCode:
            typeof row.value.registryNovaPayMerchantCode === "string"
              ? row.value.registryNovaPayMerchantCode
              : undefined,
          registryNovaPayApiKeyId:
            typeof row.value.registryNovaPayApiKeyId === "string"
              ? row.value.registryNovaPayApiKeyId
              : undefined,
          registryNovaPayApiKeySecret:
            typeof row.value.registryNovaPayApiKeySecret === "string"
              ? row.value.registryNovaPayApiKeySecret
              : undefined,
          registryNovaPayNotifySecret:
            typeof row.value.registryNovaPayNotifySecret === "string"
              ? row.value.registryNovaPayNotifySecret
              : undefined,
          registryNovaPayChannelCode:
            typeof row.value.registryNovaPayChannelCode === "string"
              ? row.value.registryNovaPayChannelCode
              : undefined,
          updatedAt: row.updatedAt.toISOString(),
        });
      }
    } catch {
      // Fall through to file-backed storage.
    }
  }

  return loadFileSettings();
}

export async function updateSettlementSettings(input: {
  developerRevenueSharePercent: number;
  payoutHoldDays: number;
  registryNovaPayMerchantCode?: string | null;
  registryNovaPayApiKeyId?: string | null;
  registryNovaPayApiKeySecret?: string | null;
  registryNovaPayNotifySecret?: string | null;
  registryNovaPayChannelCode?: string | null;
}) {
  const settings = normalizeSettings({
    developerRevenueSharePercent: input.developerRevenueSharePercent,
    payoutHoldDays: input.payoutHoldDays,
    registryNovaPayMerchantCode: input.registryNovaPayMerchantCode ?? null,
    registryNovaPayApiKeyId: input.registryNovaPayApiKeyId ?? null,
    registryNovaPayApiKeySecret: input.registryNovaPayApiKeySecret ?? null,
    registryNovaPayNotifySecret: input.registryNovaPayNotifySecret ?? null,
    registryNovaPayChannelCode: input.registryNovaPayChannelCode ?? null,
    updatedAt: new Date().toISOString(),
  });

  const prisma = await getPrismaRegistrySettingClient();
  if (prisma) {
    try {
      await ensurePrismaHydrated(prisma);
      await (
        prisma.registrySetting as {
          upsert(args: unknown): Promise<unknown>;
        }
      ).upsert({
        where: { key: SETTINGS_KEY },
        update: {
          value: settings,
        },
        create: {
          key: SETTINGS_KEY,
          value: settings,
        },
      });
      saveFileSettings(settings);
      return settings;
    } catch {
      // Fall through to file-backed storage.
    }
  }

  saveFileSettings(settings);
  return settings;
}

export async function getSettlementSettingsForAdminView() {
  const settings = await getSettlementSettings();

  return {
    ...settings,
    registryNovaPayApiKeySecretMasked: maskStoredSecret(settings.registryNovaPayApiKeySecret),
    registryNovaPayNotifySecretMasked: maskStoredSecret(settings.registryNovaPayNotifySecret),
  };
}

export async function getRegistryNovaPayBridgeSecrets() {
  const settings = await getSettlementSettings();
  return {
    merchantCode: settings.registryNovaPayMerchantCode,
    apiKeyId: settings.registryNovaPayApiKeyId,
    apiKeySecret: revealStoredSecret(settings.registryNovaPayApiKeySecret),
    notifySecret: revealStoredSecret(settings.registryNovaPayNotifySecret),
    channelCode: settings.registryNovaPayChannelCode,
  };
}
