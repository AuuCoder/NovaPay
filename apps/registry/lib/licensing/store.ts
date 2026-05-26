import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

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

interface PersistedLicenseRecord
  extends Omit<LicenseRecord, "issuedAt" | "expiresAt"> {
  issuedAt: string;
  expiresAt: string | null;
}

function toPersisted(record: LicenseRecord): PersistedLicenseRecord {
  return {
    ...record,
    issuedAt: record.issuedAt.toISOString(),
    expiresAt: record.expiresAt?.toISOString() ?? null,
  };
}

function fromPersisted(record: PersistedLicenseRecord): LicenseRecord {
  return {
    ...record,
    issuedAt: new Date(record.issuedAt),
    expiresAt: record.expiresAt ? new Date(record.expiresAt) : null,
  };
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

export function createPersistentLicenseStore(filePath: string): LicenseStore {
  function load() {
    if (!existsSync(filePath)) {
      return [] as PersistedLicenseRecord[];
    }

    try {
      return JSON.parse(readFileSync(filePath, "utf8")) as PersistedLicenseRecord[];
    } catch {
      return [] as PersistedLicenseRecord[];
    }
  }

  function save(records: LicenseRecord[]) {
    mkdirSync(path.dirname(filePath), { recursive: true });
    writeFileSync(filePath, JSON.stringify(records.map(toPersisted), null, 2), "utf8");
  }

  const records = load().map(fromPersisted);
  const byId = new Map(records.map((record) => [record.id, record]));
  const byOrderId = new Map(
    records
      .filter((record) => record.orderId)
      .map((record) => [record.orderId as string, record.id]),
  );

  function ordered() {
    return [...byId.values()].sort(
      (left, right) => right.issuedAt.getTime() - left.issuedAt.getTime(),
    );
  }

  return {
    async save(record) {
      byId.set(record.id, { ...record });
      if (record.orderId) {
        byOrderId.set(record.orderId, record.id);
      }
      save(ordered());
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
      save(ordered());
      return { ...updated };
    },
    async listAll() {
      return ordered().map((record) => ({ ...record }));
    },
  };
}
