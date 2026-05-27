import { randomUUID } from "node:crypto";
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

interface PrismaPayoutAccountLike {
  payoutAccount: {
    findMany(args: unknown): Promise<unknown[]>;
    findUnique(args: unknown): Promise<unknown>;
    create(args: unknown): Promise<unknown>;
  };
}

async function getPrismaPayoutAccount(): Promise<PrismaPayoutAccountLike | null> {
  const prisma = (await getPrismaClient()) as unknown as PrismaPayoutAccountLike | null;
  if (!prisma || !prisma.payoutAccount) return null;
  return prisma;
}

function fromRow(row: PrismaPayoutAccountRow): PayoutAccountRecord {
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

function toPublicRecord(record: PayoutAccountRecord): PayoutAccountRecord {
  return {
    ...record,
    accountNumber: maskStoredSecret(record.accountNumber),
    routingNumber: maskStoredSecret(record.routingNumber),
    paypalEmail: maskStoredSecret(record.paypalEmail),
  };
}

export async function listPayoutAccountsByDeveloper(developerId: string) {
  const prisma = await getPrismaPayoutAccount();
  if (!prisma) return [];

  const rows = (await prisma.payoutAccount.findMany({
    where: { developerId },
    orderBy: { createdAt: "desc" },
  })) as PrismaPayoutAccountRow[];

  return rows.map((row) => toPublicRecord(fromRow(row)));
}

export async function getPayoutAccountById(id: string) {
  const prisma = await getPrismaPayoutAccount();
  if (!prisma) return null;

  const row = (await prisma.payoutAccount.findUnique({
    where: { id },
  })) as PrismaPayoutAccountRow | null;

  return row ? toPublicRecord(fromRow(row)) : null;
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
  const prisma = await getPrismaPayoutAccount();
  if (!prisma) {
    throw new Error("Registry database is not available.");
  }

  const now = new Date();
  const row = (await prisma.payoutAccount.create({
    data: {
      id: `pac_${randomUUID()}`,
      developerId: input.developerId,
      accountType: input.accountType,
      accountHolder: input.accountHolder,
      accountNumber: migrateStoredSecret(input.accountNumber ?? null),
      routingNumber: migrateStoredSecret(input.routingNumber ?? null),
      bankName: input.bankName ?? null,
      paypalEmail: migrateStoredSecret(input.paypalEmail ?? null),
      status: "PENDING_VERIFICATION",
      verifiedAt: null,
      createdAt: now,
      updatedAt: now,
    },
  })) as PrismaPayoutAccountRow;

  return toPublicRecord(fromRow(row));
}
