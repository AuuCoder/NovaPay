import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { getPrismaClient } from "../runtime/prisma-client";
import {
  maskStoredSecret,
  migrateStoredSecret,
} from "../security/secret-box";

export interface PayoutAccountRecord {
  id: string;
  developerId: string;
  accountType: "bank_transfer" | "paypal";
  accountHolder: string;
  accountNumber: string | null;
  routingNumber: string | null;
  bankName: string | null;
  paypalEmail: string | null;
  status: "PENDING_VERIFICATION" | "VERIFIED" | "SUSPENDED";
  verifiedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

interface PersistedPayoutAccountRecord
  extends Omit<PayoutAccountRecord, "verifiedAt" | "createdAt" | "updatedAt"> {
  verifiedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface PrismaPayoutAccountRow {
  id: string;
  developerId: string;
  accountType: string;
  accountHolder: string;
  accountNumber: string | null;
  routingNumber: string | null;
  bankName: string | null;
  paypalEmail: string | null;
  status: string;
  verifiedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const REGISTRY_PROJECT_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
);
const PAYOUT_ACCOUNTS_FILE = path.join(
  REGISTRY_PROJECT_ROOT,
  ".tmp",
  "registry-payout-accounts.json",
);

let prismaHydrationPromise: Promise<void> | null = null;

function toPersisted(record: PayoutAccountRecord): PersistedPayoutAccountRecord {
  return {
    ...record,
    accountNumber: migrateStoredSecret(record.accountNumber),
    routingNumber: migrateStoredSecret(record.routingNumber),
    paypalEmail: migrateStoredSecret(record.paypalEmail),
    verifiedAt: record.verifiedAt?.toISOString() ?? null,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

function fromPersisted(record: PersistedPayoutAccountRecord): PayoutAccountRecord {
  return {
    ...record,
    verifiedAt: record.verifiedAt ? new Date(record.verifiedAt) : null,
    createdAt: new Date(record.createdAt),
    updatedAt: new Date(record.updatedAt),
  };
}

function toPublicRecord(record: PayoutAccountRecord): PayoutAccountRecord {
  return {
    ...record,
    accountNumber: maskStoredSecret(record.accountNumber),
    routingNumber: maskStoredSecret(record.routingNumber),
    paypalEmail: maskStoredSecret(record.paypalEmail),
  };
}

function toPrismaRowData(record: PayoutAccountRecord) {
  return {
    id: record.id,
    developerId: record.developerId,
    accountType: record.accountType,
    accountHolder: record.accountHolder,
    accountNumber: migrateStoredSecret(record.accountNumber),
    routingNumber: migrateStoredSecret(record.routingNumber),
    bankName: record.bankName,
    paypalEmail: migrateStoredSecret(record.paypalEmail),
    status: record.status,
    verifiedAt: record.verifiedAt,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

function fromPrismaRow(row: PrismaPayoutAccountRow): PayoutAccountRecord {
  return {
    id: row.id,
    developerId: row.developerId,
    accountType: row.accountType === "paypal" ? "paypal" : "bank_transfer",
    accountHolder: row.accountHolder,
    accountNumber: row.accountNumber,
    routingNumber: row.routingNumber,
    bankName: row.bankName,
    paypalEmail: row.paypalEmail,
    status:
      row.status === "VERIFIED" || row.status === "SUSPENDED"
        ? row.status
        : "PENDING_VERIFICATION",
    verifiedAt: row.verifiedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function loadRecords() {
  if (!existsSync(PAYOUT_ACCOUNTS_FILE)) {
    return [] as PersistedPayoutAccountRecord[];
  }

  try {
    return JSON.parse(readFileSync(PAYOUT_ACCOUNTS_FILE, "utf8")) as PersistedPayoutAccountRecord[];
  } catch {
    return [] as PersistedPayoutAccountRecord[];
  }
}

function loadFileBackedRecords() {
  return loadRecords().map(fromPersisted);
}

function saveRecords(records: PayoutAccountRecord[]) {
  mkdirSync(path.dirname(PAYOUT_ACCOUNTS_FILE), { recursive: true });
  writeFileSync(
    PAYOUT_ACCOUNTS_FILE,
    JSON.stringify(records.map(toPersisted), null, 2),
    "utf8",
  );
}

async function getPrismaPayoutAccountClient() {
  const prisma = (await getPrismaClient()) as
    | { payoutAccount?: Record<string, unknown> }
    | null;
  return prisma && prisma.payoutAccount ? (prisma as Record<string, unknown>) : null;
}

async function ensurePrismaHydrated(prisma: Record<string, unknown>) {
  if (prismaHydrationPromise) {
    return prismaHydrationPromise;
  }

  prismaHydrationPromise = (async () => {
    const payoutAccount = prisma.payoutAccount as {
      count(args?: unknown): Promise<number>;
      upsert(args: unknown): Promise<unknown>;
    };

    const count = await payoutAccount.count().catch(() => null);
    if (count === null || count > 0) {
      return;
    }

    const records = loadFileBackedRecords();
    for (const record of records) {
      await payoutAccount.upsert({
        where: { id: record.id },
        update: toPrismaRowData(record),
        create: toPrismaRowData(record),
      });
    }
  })().finally(() => {
    prismaHydrationPromise = null;
  });

  return prismaHydrationPromise;
}

export async function listPayoutAccountsByDeveloper(developerId: string) {
  const prisma = await getPrismaPayoutAccountClient();
  if (prisma) {
    try {
      await ensurePrismaHydrated(prisma);
      const rows = (await (
        prisma.payoutAccount as {
          findMany(args: unknown): Promise<PrismaPayoutAccountRow[]>;
        }
      ).findMany({
        where: { developerId },
        orderBy: { createdAt: "desc" },
      })) as PrismaPayoutAccountRow[];

      return rows.map((row) => toPublicRecord(fromPrismaRow(row)));
    } catch {
      // Fall through to file-backed storage.
    }
  }

  return loadFileBackedRecords()
    .filter((record) => record.developerId === developerId)
    .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
    .map(toPublicRecord);
}

export async function getPayoutAccountById(id: string) {
  const prisma = await getPrismaPayoutAccountClient();
  if (prisma) {
    try {
      await ensurePrismaHydrated(prisma);
      const row = (await (
        prisma.payoutAccount as {
          findUnique(args: unknown): Promise<PrismaPayoutAccountRow | null>;
        }
      ).findUnique({
        where: { id },
      })) as PrismaPayoutAccountRow | null;

      return row ? toPublicRecord(fromPrismaRow(row)) : null;
    } catch {
      // Fall through to file-backed storage.
    }
  }

  const record = loadFileBackedRecords().find((item) => item.id === id) ?? null;
  return record ? toPublicRecord(record) : null;
}

export async function createPayoutAccount(input: {
  developerId: string;
  accountType: "bank_transfer" | "paypal";
  accountHolder: string;
  accountNumber?: string | null;
  routingNumber?: string | null;
  bankName?: string | null;
  paypalEmail?: string | null;
}) {
  const now = new Date();
  const record: PayoutAccountRecord = {
    id: `pac_${randomUUID()}`,
    developerId: input.developerId,
    accountType: input.accountType,
    accountHolder: input.accountHolder,
    accountNumber: input.accountNumber ?? null,
    routingNumber: input.routingNumber ?? null,
    bankName: input.bankName ?? null,
    paypalEmail: input.paypalEmail ?? null,
    status: "PENDING_VERIFICATION",
    verifiedAt: null,
    createdAt: now,
    updatedAt: now,
  };

  const prisma = await getPrismaPayoutAccountClient();
  if (prisma) {
    try {
      await ensurePrismaHydrated(prisma);
      const created = (await (
        prisma.payoutAccount as {
          create(args: unknown): Promise<PrismaPayoutAccountRow>;
        }
      ).create({
        data: toPrismaRowData(record),
      })) as PrismaPayoutAccountRow;

      return toPublicRecord(fromPrismaRow(created));
    } catch {
      // Fall through to file-backed storage.
    }
  }

  const records = loadFileBackedRecords();
  records.push(record);
  saveRecords(records);
  return toPublicRecord(record);
}
