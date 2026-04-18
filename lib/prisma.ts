import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { getPublicBaseUrl } from "@/lib/env";

declare global {
  var prismaClientSingleton: PrismaClient | undefined;
}

const REQUIRED_DELEGATES = [
  "merchant",
  "merchantUser",
  "merchantSession",
  "adminUser",
  "adminSession",
  "paymentOrder",
  "paymentRefund",
  "merchantLedgerEntry",
  "merchantSettlement",
  "merchantBalanceSnapshot",
  "merchantChannelAccount",
  "merchantRequestNonce",
] as const;

function hasRequiredDelegates(client: PrismaClient) {
  return REQUIRED_DELEGATES.every((key) => {
    const value = Reflect.get(client, key);
    return value !== undefined && value !== null;
  });
}

export function getPrismaClient() {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error("DATABASE_URL is missing. Copy .env.example to .env first.");
  }

  if (process.env.NODE_ENV === "production") {
    void getPublicBaseUrl();
  }

  if (
    globalThis.prismaClientSingleton &&
    !hasRequiredDelegates(globalThis.prismaClientSingleton)
  ) {
    void globalThis.prismaClientSingleton.$disconnect().catch(() => undefined);
    globalThis.prismaClientSingleton = undefined;
  }

  if (!globalThis.prismaClientSingleton) {
    const adapter = new PrismaPg({ connectionString });
    globalThis.prismaClientSingleton = new PrismaClient({ adapter });
  }

  return globalThis.prismaClientSingleton;
}
