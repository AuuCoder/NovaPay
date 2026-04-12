import "dotenv/config";
import { Prisma } from "../generated/prisma/client";
import { getPrismaClient } from "../lib/prisma";
import { migrateProviderConfigForStorage } from "../lib/provider-account-config";
import { isStoredSecretSealed, migrateStoredSecret } from "../lib/secret-box";

async function main() {
  const prisma = getPrismaClient();
  const [merchants, providerAccounts] = await Promise.all([
    prisma.merchant.findMany({
      where: {
        notifySecret: {
          not: null,
        },
      },
      select: {
        id: true,
        notifySecret: true,
      },
    }),
    prisma.providerAccount.findMany({
      select: {
        id: true,
        config: true,
      },
    }),
  ]);

  let migratedMerchants = 0;
  let migratedProviderAccounts = 0;

  for (const merchant of merchants) {
    if (!merchant.notifySecret || isStoredSecretSealed(merchant.notifySecret)) {
      continue;
    }

    await prisma.merchant.update({
      where: { id: merchant.id },
      data: {
        notifySecret: migrateStoredSecret(merchant.notifySecret),
      },
    });
    migratedMerchants += 1;
  }

  for (const account of providerAccounts) {
    const nextConfig = migrateProviderConfigForStorage(account.config);

    if (JSON.stringify(nextConfig) === JSON.stringify(account.config)) {
      continue;
    }

    await prisma.providerAccount.update({
      where: { id: account.id },
      data: {
        config: nextConfig as Prisma.InputJsonValue,
      },
    });
    migratedProviderAccounts += 1;
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        migratedMerchants,
        migratedProviderAccounts,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
