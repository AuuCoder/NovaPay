import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_RETIRED_KEY_GRACE_MS,
  createInMemorySigningKeyStore,
  type SigningKeyRecord,
} from "../../lib/signing/key-store";

function makeRecord(overrides: Partial<SigningKeyRecord> = {}): SigningKeyRecord {
  const createdAt = overrides.createdAt ?? new Date("2025-01-01T00:00:00Z");
  return {
    keyId: overrides.keyId ?? "key-2025-q1",
    alg: overrides.alg ?? "Ed25519",
    publicKey: overrides.publicKey ?? "AAAA",
    kmsKeyArn: overrides.kmsKeyArn ?? null,
    status: overrides.status ?? "ACTIVE",
    notBefore: overrides.notBefore ?? new Date("2025-01-01T00:00:00Z"),
    notAfter: overrides.notAfter ?? new Date("2026-01-01T00:00:00Z"),
    createdAt,
  };
}

describe("createInMemorySigningKeyStore", () => {
  it("throws when no active key is configured", async () => {
    const store = createInMemorySigningKeyStore();

    await assert.rejects(
      () => store.getActive(),
      /No active signing key configured\./,
    );
  });

  it("provisions the first active key on initial rotate", async () => {
    const store = createInMemorySigningKeyStore();

    const result = await store.rotate({
      newKey: {
        keyId: "key-2025-q1",
        alg: "Ed25519",
        publicKey: "AAAA",
        kmsKeyArn: null,
        notBefore: new Date("2025-01-01T00:00:00Z"),
        notAfter: new Date("2025-04-01T00:00:00Z"),
      },
    });

    assert.equal(result.retired, null);
    assert.equal(result.newActive.keyId, "key-2025-q1");
    assert.equal(result.newActive.status, "ACTIVE");

    const active = await store.getActive();
    assert.equal(active.keyId, "key-2025-q1");
  });

  it("retires the previous active key with notAfter pushed by at least 30 days", async () => {
    const initial = makeRecord({
      keyId: "key-2024-q4",
      status: "ACTIVE",
      // notAfter intentionally close to the rotation moment to force the
      // store to extend it by 30 days.
      notAfter: new Date(Date.now() + 1_000),
      createdAt: new Date("2024-10-01T00:00:00Z"),
    });
    const store = createInMemorySigningKeyStore([initial]);

    const beforeRotate = Date.now();
    const result = await store.rotate({
      newKey: {
        keyId: "key-2025-q1",
        alg: "Ed25519",
        publicKey: "BBBB",
        kmsKeyArn: null,
        notBefore: new Date("2025-01-01T00:00:00Z"),
        notAfter: new Date("2025-04-01T00:00:00Z"),
      },
    });

    assert.ok(result.retired);
    assert.equal(result.retired?.keyId, "key-2024-q4");
    assert.equal(result.retired?.status, "RETIRED");

    const minExpected = beforeRotate + DEFAULT_RETIRED_KEY_GRACE_MS - 1_000;
    assert.ok(
      (result.retired?.notAfter.getTime() ?? 0) >= minExpected,
      `Expected notAfter >= ${minExpected}, got ${result.retired?.notAfter.getTime()}`,
    );

    const active = await store.getActive();
    assert.equal(active.keyId, "key-2025-q1");
  });

  it("listTrustAnchors returns ACTIVE plus non-expired RETIRED, sorted by createdAt asc", async () => {
    const now = new Date("2025-02-01T00:00:00Z");
    const expiredRetired = makeRecord({
      keyId: "key-old-expired",
      status: "RETIRED",
      notAfter: new Date("2024-12-01T00:00:00Z"),
      createdAt: new Date("2024-01-01T00:00:00Z"),
    });
    const validRetired = makeRecord({
      keyId: "key-old-valid",
      status: "RETIRED",
      notAfter: new Date("2025-04-01T00:00:00Z"),
      createdAt: new Date("2024-06-01T00:00:00Z"),
    });
    const active = makeRecord({
      keyId: "key-current",
      status: "ACTIVE",
      notAfter: new Date("2026-01-01T00:00:00Z"),
      createdAt: new Date("2025-01-01T00:00:00Z"),
    });

    const store = createInMemorySigningKeyStore([
      expiredRetired,
      validRetired,
      active,
    ]);

    const anchors = await store.listTrustAnchors(now);
    const ids = anchors.map((record) => record.keyId);

    assert.deepEqual(ids, ["key-old-valid", "key-current"]);
  });

  it("rotate rejects duplicate keyId", async () => {
    const store = createInMemorySigningKeyStore([
      makeRecord({ keyId: "key-dup" }),
    ]);

    await assert.rejects(
      () =>
        store.rotate({
          newKey: {
            keyId: "key-dup",
            alg: "Ed25519",
            publicKey: "CCCC",
            kmsKeyArn: null,
            notBefore: new Date(),
            notAfter: new Date(Date.now() + 86_400_000),
          },
        }),
      /Signing key already exists: key-dup/,
    );
  });
});
