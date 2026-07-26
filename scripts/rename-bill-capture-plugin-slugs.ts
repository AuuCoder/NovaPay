import "dotenv/config";
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { Prisma } from "../generated/prisma/client";
import { getPrismaClient } from "../lib/prisma";

interface RenameRule {
  oldSlug: string;
  newSlug: string;
  oldPackageNames: string[];
  newPackageName: string;
}

const rules: RenameRule[] = [
  {
    oldSlug: "novapay.ctf-alipay-bill-capture",
    newSlug: "novapay.alipay-bill-capture",
    oldPackageNames: [
      "@novapay/plugin-alipay-receipt-listener",
      "@novapay/plugin-ctf-alipay-bill-capture",
    ],
    newPackageName: "@novapay/plugin-alipay-bill-capture",
  },
  {
    oldSlug: "novapay.ctf-wxpay-bill-capture",
    newSlug: "novapay.wxpay-bill-capture",
    oldPackageNames: [
      "@novapay/plugin-wechat-receipt-listener",
      "@novapay/plugin-ctf-wxpay-bill-capture",
    ],
    newPackageName: "@novapay/plugin-wxpay-bill-capture",
  },
];

function replaceIfPresent(value: string | null | undefined, rule: RenameRule) {
  if (!value) {
    return value ?? null;
  }

  return value
    .split(rule.oldSlug)
    .join(rule.newSlug);
}

async function rewriteInstalledManifest(
  installPath: string,
  rule: RenameRule,
  dryRun: boolean,
) {
  const manifestPath = path.join(installPath, "plugin.json");

  if (!existsSync(manifestPath)) {
    return "missing";
  }

  const rawText = await readFile(manifestPath, "utf8");
  const parsed = JSON.parse(rawText) as Record<string, unknown>;
  let changed = false;

  if (parsed.slug === rule.oldSlug) {
    parsed.slug = rule.newSlug;
    changed = true;
  }

  if (typeof parsed.packageName === "string") {
    const nextPackageName = rule.oldPackageNames.includes(parsed.packageName)
      ? rule.newPackageName
      : parsed.packageName;
    if (nextPackageName !== parsed.packageName) {
      parsed.packageName = nextPackageName;
      changed = true;
    }
  }

  if (parsed.vendor === "NovaPay CTF Lab") {
    parsed.vendor = "NovaPay Official";
    changed = true;
  }

  if (!changed) {
    return "ok";
  }

  if (!dryRun) {
    await writeFile(manifestPath, `${JSON.stringify(parsed, null, 2)}\n`, "utf8");
  }

  return dryRun ? "would-update" : "updated";
}

async function main() {
  const prisma = getPrismaClient();
  const dryRun = process.argv.includes("--dry-run");
  const results: string[] = [];

  for (const rule of rules) {
    const oldPlugin = await prisma.marketplacePlugin.findUnique({
      where: { slug: rule.oldSlug },
    });

    if (!oldPlugin) {
      results.push(`${rule.oldSlug} -> ${rule.newSlug}: skipped (old slug not found)`);
      continue;
    }

    const installRows = await prisma.pluginPackageInstall.findMany({
      where: { pluginSlug: rule.oldSlug },
      select: { id: true, installPath: true, downloadUrl: true },
      orderBy: [{ installedAt: "asc" }],
    });

    const manifestRewriteStates: string[] = [];
    for (const install of installRows) {
      manifestRewriteStates.push(await rewriteInstalledManifest(install.installPath, rule, dryRun));
    }

    const newPlugin = await prisma.marketplacePlugin.findUnique({
      where: { slug: rule.newSlug },
    });

    if (!dryRun) {
      await prisma.$transaction(async (tx) => {
        if (!newPlugin) {
      await tx.marketplacePlugin.update({
        where: { slug: rule.oldSlug },
        data: {
          channelCode: null,
          packageName: rule.newPackageName,
        },
      });

          await tx.marketplacePlugin.create({
            data: {
              slug: rule.newSlug,
              kind: oldPlugin.kind,
              source: oldPlugin.source,
              registrySourceId: oldPlugin.registrySourceId,
              remotePluginId: replaceIfPresent(oldPlugin.remotePluginId, rule),
              channelCode: oldPlugin.channelCode,
              providerKey: oldPlugin.providerKey,
              packageName: rule.newPackageName,
              displayName: oldPlugin.displayName,
              vendor: oldPlugin.vendor,
              description: oldPlugin.description,
              version: oldPlugin.version,
              latestVersion: oldPlugin.latestVersion,
              publishedVersion: oldPlugin.publishedVersion,
              runtimeMode: oldPlugin.runtimeMode,
              pricingMode: oldPlugin.pricingMode,
              priceLabel: oldPlugin.priceLabel,
              purchaseUrl: replaceIfPresent(oldPlugin.purchaseUrl, rule),
              purchasedAt: oldPlugin.purchasedAt,
              downloadUrl: replaceIfPresent(oldPlugin.downloadUrl, rule),
              checksum: oldPlugin.checksum,
              signature: oldPlugin.signature,
              capabilities:
                (oldPlugin.capabilities ?? Prisma.JsonNull) as Prisma.InputJsonValue,
              metadata:
                (oldPlugin.metadata ?? Prisma.JsonNull) as Prisma.InputJsonValue,
              trusted: oldPlugin.trusted,
              installed: oldPlugin.installed,
              enabled: oldPlugin.enabled,
              installedAt: oldPlugin.installedAt,
              lastSyncedAt: oldPlugin.lastSyncedAt,
              createdAt: oldPlugin.createdAt,
            },
          });
        }

        await tx.merchantInstalledPlugin.updateMany({
          where: { pluginSlug: rule.oldSlug },
          data: { pluginSlug: rule.newSlug },
        });

        const packageInstalls = await tx.pluginPackageInstall.findMany({
          where: { pluginSlug: rule.oldSlug },
          select: { id: true, downloadUrl: true },
        });

        for (const install of packageInstalls) {
          await tx.pluginPackageInstall.update({
            where: { id: install.id },
            data: {
              pluginSlug: rule.newSlug,
              downloadUrl: replaceIfPresent(install.downloadUrl, rule),
            },
          });
        }

        await tx.pluginPurchaseRecord.updateMany({
          where: { pluginSlug: rule.oldSlug },
          data: { pluginSlug: rule.newSlug },
        });

        await tx.marketplacePlugin.delete({
          where: { slug: rule.oldSlug },
        });
      });
    }

    results.push(
      `${rule.oldSlug} -> ${rule.newSlug}: ${dryRun ? "would-migrate" : "migrated"} ` +
        `(installs=${installRows.length}, manifest=${manifestRewriteStates.join(",") || "n/a"})`,
    );
  }

  for (const row of results) {
    console.log(`[rename-bill-capture-plugin-slugs] ${row}`);
  }

  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error("[rename-bill-capture-plugin-slugs] fatal error");
  console.error(error);
  await getPrismaClient().$disconnect().catch(() => undefined);
  process.exit(1);
});
