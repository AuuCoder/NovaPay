import "dotenv/config";
import { getPrismaClient } from "../lib/prisma";
import { getOnchainWorkerConfig, runOnchainMaintenance, sleep } from "../lib/onchain/service";

function parseNumberOption(args: string[], name: string) {
  const inline = args.find((arg) => arg.startsWith(`${name}=`));

  if (inline) {
    const value = Number(inline.slice(`${name}=`.length));
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : null;
  }

  const index = args.findIndex((arg) => arg === name);

  if (index === -1) {
    return null;
  }

  const next = Number(args[index + 1]);
  return Number.isFinite(next) && next > 0 ? Math.floor(next) : null;
}

async function main() {
  const args = process.argv.slice(2);
  const runOnce = args.includes("--once");
  const config = await getOnchainWorkerConfig();
  const intervalMs = parseNumberOption(args, "--interval-ms") ?? config.intervalMs;
  let shuttingDown = false;

  const shutdown = (signal: string) => {
    if (shuttingDown) {
      return;
    }

    shuttingDown = true;
    console.log(`[onchain-worker] received ${signal}, waiting for current loop to finish...`);
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  console.log(
    `[onchain-worker] started with intervalMs=${intervalMs} mode=${runOnce ? "once" : "daemon"}`,
  );

  do {
    const startedAt = Date.now();
    const result = await runOnchainMaintenance();
    console.log(
      JSON.stringify(
        {
          ts: new Date().toISOString(),
          ...result,
        },
        null,
        2,
      ),
    );

    if (runOnce || shuttingDown) {
      break;
    }

    const elapsedMs = Date.now() - startedAt;
    await sleep(Math.max(intervalMs - elapsedMs, 0));
  } while (!shuttingDown);

  await getPrismaClient().$disconnect();
}

main().catch(async (error) => {
  console.error("[onchain-worker] fatal error");
  console.error(error);
  await getPrismaClient().$disconnect().catch(() => undefined);
  process.exit(1);
});
