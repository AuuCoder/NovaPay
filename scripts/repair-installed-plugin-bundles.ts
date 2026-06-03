import "dotenv/config";
import { existsSync } from "node:fs";
import path from "node:path";
import { getPrismaClient } from "../lib/prisma";
import {
  installRemoteMarketplacePluginPackage,
  setMarketplacePluginEnabledState,
} from "../lib/plugins/marketplace";

/**
 * Repairs REMOTE_SIGNED plugin bundles that are recorded as installed in the
 * database but whose extracted files are missing on disk (for example after a
 * container rebuild wiped the ephemeral runtime/plugins directory).
 *
 * For each affected plugin it re-downloads the bundle from the registry and
 * restores the plugin's previous `enabled` state. Plugins whose files are
 * already present are left untouched. Safe to run repeatedly (idempotent).
 */
async function main() {
  const prisma = getPrismaClient();
  const dryRun = process.argv.includes("--dry-run");

  const plugins = await prisma.marketplacePlugin.findMany({
    where: {
      kind: "PAYMENT_CHANNEL",
      source: "REMOTE_SIGNED",
      installed: true,
    },
    select: {
      slug: true,
      enabled: true,
      channelCode: true,
    },
    orderBy: [{ slug: "asc" }],
  });

  if (plugins.length === 0) {
    console.log("[repair] no installed REMOTE_SIGNED payment plugins found.");
    await prisma.$disconnect();
    return;
  }

  const results: Array<{ slug: string; action: string; detail?: string }> = [];

  for (const plugin of plugins) {
    const latestInstall = await prisma.pluginPackageInstall.findFirst({
      where: { pluginSlug: plugin.slug },
      orderBy: [{ installedAt: "desc" }],
      select: { installPath: true },
    });

    const manifestPresent =
      latestInstall?.installPath &&
      existsSync(path.join(latestInstall.installPath, "plugin.json"));

    if (manifestPresent) {
      results.push({ slug: plugin.slug, action: "ok (files present)" });
      continue;
    }

    if (dryRun) {
      results.push({ slug: plugin.slug, action: "would re-download (files missing)" });
      continue;
    }

    try {
      const result = await installRemoteMarketplacePluginPackage(plugin.slug);
      const runnable = result.inspection.runnable;

      // Re-installing resets enabled to false. Restore the previous state.
      if (plugin.enabled && runnable) {
        await setMarketplacePluginEnabledState({ slug: plugin.slug, enabled: true });
      }

      results.push({
        slug: plugin.slug,
        action: "re-downloaded",
        detail: `runnable=${runnable} restoredEnabled=${plugin.enabled && runnable}`,
      });
    } catch (error) {
      results.push({
        slug: plugin.slug,
        action: "FAILED",
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  }

  console.log("[repair] summary:");
  for (const row of results) {
    console.log(`  - ${row.slug}: ${row.action}${row.detail ? ` (${row.detail})` : ""}`);
  }

  const failed = results.filter((row) => row.action === "FAILED");
  await prisma.$disconnect();

  if (failed.length > 0) {
    process.exitCode = 1;
  }
}

main().catch(async (error) => {
  console.error("[repair] fatal error");
  console.error(error);
  await getPrismaClient().$disconnect().catch(() => undefined);
  process.exit(1);
});
