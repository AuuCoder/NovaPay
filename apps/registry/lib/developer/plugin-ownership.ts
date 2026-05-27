import { isOfficialPluginSlug } from "../plugins/official";
import { getPrismaClient } from "../runtime/prisma-client";

export class PluginOwnershipError extends Error {
  code: "RESERVED_SLUG" | "NOT_OWNER";

  constructor(code: "RESERVED_SLUG" | "NOT_OWNER", message: string) {
    super(message);
    this.name = "PluginOwnershipError";
    this.code = code;
  }
}

interface OwnershipRow {
  slug: string;
  developerId: string;
  createdAt: Date;
}

interface PrismaOwnershipLike {
  pluginOwnership: {
    findUnique(args: unknown): Promise<unknown>;
    findMany(args: unknown): Promise<unknown[]>;
    create(args: unknown): Promise<unknown>;
  };
}

async function getPrismaOwnership(): Promise<PrismaOwnershipLike | null> {
  const prisma = (await getPrismaClient()) as unknown as PrismaOwnershipLike | null;
  if (!prisma || !prisma.pluginOwnership) return null;
  return prisma;
}

export async function getPluginOwner(slug: string): Promise<string | null> {
  const prisma = await getPrismaOwnership();
  if (!prisma) return null;
  const row = (await prisma.pluginOwnership.findUnique({ where: { slug } })) as
    | OwnershipRow
    | null;
  return row?.developerId ?? null;
}

export async function listPluginOwnerships() {
  const prisma = await getPrismaOwnership();
  if (!prisma) return [];
  const rows = (await prisma.pluginOwnership.findMany({
    orderBy: { createdAt: "asc" },
  })) as OwnershipRow[];
  return rows.map((row) => ({
    slug: row.slug,
    developerId: row.developerId,
    createdAt: row.createdAt.toISOString(),
  }));
}

export async function canDeveloperManagePlugin(
  slug: string,
  developerId: string | null,
) {
  if (!developerId || isOfficialPluginSlug(slug)) {
    return false;
  }
  return (await getPluginOwner(slug)) === developerId;
}

export async function ensurePluginOwnership(slug: string, developerId: string) {
  if (isOfficialPluginSlug(slug)) {
    throw new PluginOwnershipError(
      "RESERVED_SLUG",
      "The `novapay.*` namespace is reserved for official NovaPay plugins.",
    );
  }

  const prisma = await getPrismaOwnership();
  if (!prisma) {
    throw new Error("Registry database is not available.");
  }

  const existing = (await prisma.pluginOwnership.findUnique({
    where: { slug },
  })) as OwnershipRow | null;

  if (!existing) {
    await prisma.pluginOwnership.create({
      data: { slug, developerId },
    });
    return { created: true, developerId };
  }

  if (existing.developerId !== developerId) {
    throw new PluginOwnershipError(
      "NOT_OWNER",
      "This plugin slug belongs to another developer account.",
    );
  }

  return { created: false, developerId };
}

export async function assertPluginOwnership(slug: string, developerId: string) {
  if (!(await canDeveloperManagePlugin(slug, developerId))) {
    throw new PluginOwnershipError(
      "NOT_OWNER",
      "You can browse this plugin, but only the original publisher can manage it.",
    );
  }
}
