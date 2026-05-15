import assert from "node:assert/strict";
import test from "node:test";
import {
  SYSTEM_CONFIG_INSTANCE_ID_KEY,
  SYSTEM_CONFIG_PLUGIN_REGISTRY_GROUP,
  ensureInstanceId,
  invalidateSystemConfigCache,
} from "../lib/system-config";

interface MockRow {
  key: string;
  value: string;
  group: string | null;
  label: string | null;
}

interface MockCreateInput {
  data: {
    key: string;
    value: string;
    group?: string;
    label?: string | null;
  };
}

function createInMemoryPrismaStub() {
  const rows = new Map<string, MockRow>();
  let createCalls = 0;

  const stub = {
    systemConfig: {
      async findUnique(args: { where: { key: string } }) {
        const row = rows.get(args.where.key);
        return row ? { ...row } : null;
      },
      async create(args: MockCreateInput) {
        createCalls += 1;
        if (rows.has(args.data.key)) {
          throw new Error(`Duplicate key: ${args.data.key}`);
        }
        const row: MockRow = {
          key: args.data.key,
          value: args.data.value,
          group: args.data.group ?? null,
          label: args.data.label ?? null,
        };
        rows.set(row.key, row);
        return { key: row.key, value: row.value };
      },
    },
  };

  return {
    stub,
    rows,
    getCreateCalls: () => createCalls,
  };
}

test("ensureInstanceId creates inst_<uuid> when missing and stores plugin-registry group + label", async () => {
  invalidateSystemConfigCache(SYSTEM_CONFIG_INSTANCE_ID_KEY);
  const { stub, rows, getCreateCalls } = createInMemoryPrismaStub();

  const value = await ensureInstanceId(stub);

  assert.match(value, /^inst_[0-9a-fA-F-]{36}$/);
  assert.equal(getCreateCalls(), 1);

  const stored = rows.get(SYSTEM_CONFIG_INSTANCE_ID_KEY);
  assert.ok(stored, "INSTANCE_ID row must be persisted");
  assert.equal(stored?.value, value);
  assert.equal(stored?.group, SYSTEM_CONFIG_PLUGIN_REGISTRY_GROUP);
  assert.equal(stored?.label, "NovaPay Instance ID");
});

test("ensureInstanceId returns the existing value without re-writing", async () => {
  invalidateSystemConfigCache(SYSTEM_CONFIG_INSTANCE_ID_KEY);
  const { stub, rows, getCreateCalls } = createInMemoryPrismaStub();
  rows.set(SYSTEM_CONFIG_INSTANCE_ID_KEY, {
    key: SYSTEM_CONFIG_INSTANCE_ID_KEY,
    value: "inst_existing-12345",
    group: SYSTEM_CONFIG_PLUGIN_REGISTRY_GROUP,
    label: "NovaPay Instance ID",
  });

  const value = await ensureInstanceId(stub);

  assert.equal(value, "inst_existing-12345");
  assert.equal(
    getCreateCalls(),
    0,
    "must not invoke systemConfig.create when row already exists",
  );
});

test("ensureInstanceId is idempotent across two consecutive calls", async () => {
  invalidateSystemConfigCache(SYSTEM_CONFIG_INSTANCE_ID_KEY);
  const { stub, getCreateCalls } = createInMemoryPrismaStub();

  const first = await ensureInstanceId(stub);
  const second = await ensureInstanceId(stub);

  assert.equal(first, second);
  assert.equal(getCreateCalls(), 1);
});
