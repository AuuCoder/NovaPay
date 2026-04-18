import "dotenv/config";
import { getDataEncryptionKey, getPublicBaseUrl } from "../lib/env";
import { getPrismaClient } from "../lib/prisma";

async function main() {
  const publicBaseUrl = getPublicBaseUrl();
  void getDataEncryptionKey();

  const prisma = getPrismaClient();
  await prisma.$queryRaw`SELECT 1`;

  const [adminUsers, merchants, approvedMerchants, enabledChannelAccounts] =
    await Promise.all([
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
    ]);

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
        workersRequired: ["npm run callbacks:worker", "npm run finance:worker"],
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
