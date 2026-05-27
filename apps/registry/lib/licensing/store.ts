/**
 * License store: tracks issued licenses for purchase records and revocation
 * lookup. The persistent implementation runs against the Registry Postgres
 * database via Prisma; the in-memory implementation is kept for unit tests.
 */

export interface LicenseRecord {
  id: string;
  orderId: string | null;
  pluginId: string;
  pluginSlug: string;
  developerId: string | null;
  version: string;
  pricingPlanKind: "PER_INSTANCE_ONE_TIME" | "PER_MERCHANT_SUBSCRIPTION" | "PER_USAGE";
  issuedAt: Date;
  expiresAt: Date | null;
  state: "ISSUED" | "REVOKED" | "EXPIRED";
  jwsCompact: string;
  licenseKeyHash: string;
  instanceId: string | null;
  merchantId: string | null;
}

export interface LicenseStore {
  save(record: LicenseRecord): Promise<LicenseRecord>;
  findById(id: string): Promise<LicenseRecord | null>;
  findByOrderId(orderId: string): Promise<LicenseRecord | null>;
  markRevoked(id: string): Promise<LicenseRecord | null>;
  listAll(): Promise<LicenseRecord[]>;
}

export function createInMemoryLicenseStore(): LicenseStore {
  const byId = new Map<string, LicenseRecord>();
  const byOrderId = new Map<string, string>();

  return {
    async save(record) {
      byId.set(record.id, { ...record });
      if (record.orderId) {
        byOrderId.set(record.orderId, record.id);
      }
      return { ...record };
    },
    async findById(id) {
      const record = byId.get(id);
      return record ? { ...record } : null;
    },
    async findByOrderId(orderId) {
      const id = byOrderId.get(orderId);
      if (!id) return null;
      const record = byId.get(id);
      return record ? { ...record } : null;
    },
    async markRevoked(id) {
      const record = byId.get(id);
      if (!record) return null;
      const updated: LicenseRecord = { ...record, state: "REVOKED" };
      byId.set(id, updated);
      return { ...updated };
    },
    async listAll() {
      return [...byId.values()]
        .sort((left, right) => right.issuedAt.getTime() - left.issuedAt.getTime())
        .map((record) => ({ ...record }));
    },
  };
}

interface PrismaLicenseLike {
  license: {
    upsert(args: unknown): Promise<unknown>;
    findUnique(args: unknown): Promise<unknown>;
    findFirst(args: unknown): Promise<unknown>;
    findMany(args: unknown): Promise<unknown[]>;
    update(args: unknown): Promise<unknown>;
  };
}

interface LicenseRow {
  id: string;
  orderId: string | null;
  pluginId: string;
  pluginSlug: string;
  developerId: string | null;
  version: string;
  pricingPlanKind: LicenseRecord["pricingPlanKind"];
  issuedAt: Date;
  expiresAt: Date | null;
  state: LicenseRecord["state"];
  jwsCompact: string;
  licenseKeyHash: string;
  instanceId: string | null;
  merchantId: string | null;
}

function fromRow(row: LicenseRow): LicenseRecord {
  return {
    id: row.id,
    orderId: row.orderId,
    pluginId: row.pluginId,
    pluginSlug: row.pluginSlug,
    developerId: row.developerId,
    version: row.version,
    pricingPlanKind: row.pricingPlanKind,
    issuedAt: row.issuedAt,
    expiresAt: row.expiresAt,
    state: row.state,
    jwsCompact: row.jwsCompact,
    licenseKeyHash: row.licenseKeyHash,
    instanceId: row.instanceId,
    merchantId: row.merchantId,
  };
}

function toData(record: LicenseRecord) {
  return {
    id: record.id,
    orderId: record.orderId,
    pluginId: record.pluginId,
    pluginSlug: record.pluginSlug,
    developerId: record.developerId,
    version: record.version,
    pricingPlanKind: record.pricingPlanKind,
    issuedAt: record.issuedAt,
    expiresAt: record.expiresAt,
    state: record.state,
    jwsCompact: record.jwsCompact,
    licenseKeyHash: record.licenseKeyHash,
    instanceId: record.instanceId,
    merchantId: record.merchantId,
  };
}

export function createPrismaLicenseStore(prisma: PrismaLicenseLike): LicenseStore {
  return {
    async save(record) {
      const data = toData(record);
      const upserted = (await prisma.license.upsert({
        where: { id: record.id },
        create: data,
        update: {
          state: data.state,
          jwsCompact: data.jwsCompact,
          expiresAt: data.expiresAt,
        },
      })) as LicenseRow;
      return fromRow(upserted);
    },
    async findById(id) {
      const row = (await prisma.license.findUnique({ where: { id } })) as LicenseRow | null;
      return row ? fromRow(row) : null;
    },
    async findByOrderId(orderId) {
      const row = (await prisma.license.findFirst({ where: { orderId } })) as LicenseRow | null;
      return row ? fromRow(row) : null;
    },
    async markRevoked(id) {
      try {
        const row = (await prisma.license.update({
          where: { id },
          data: { state: "REVOKED" },
        })) as LicenseRow;
        return fromRow(row);
      } catch {
        return null;
      }
    },
    async listAll() {
      const rows = (await prisma.license.findMany({
        orderBy: { issuedAt: "desc" },
      })) as LicenseRow[];
      return rows.map(fromRow);
    },
  };
}
