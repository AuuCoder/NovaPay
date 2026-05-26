import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  createPat,
  authenticatePat,
  createInMemoryPatStore,
  hashToken,
} from "../../lib/auth/developer-pat";

describe("createPat", () => {
  it("generates a token with nvreg_ prefix and stores only the hash", () => {
    const result = createPat({ developerId: "dev-1", name: "CI Token" });

    assert.match(result.token, /^nvreg_[a-f0-9]{64}$/);
    assert.equal(result.record.developerId, "dev-1");
    assert.equal(result.record.name, "CI Token");
    assert.equal(result.record.status, "ACTIVE");
    assert.equal(result.record.tokenHash, hashToken(result.token));
    assert.match(result.record.tokenPreview, /^nvreg_\*{6}[a-f0-9]{4}$/);
  });
});

describe("authenticatePat", () => {
  it("authenticates a valid Bearer token", async () => {
    const store = createInMemoryPatStore();
    const { token, record } = createPat({ developerId: "dev-1", name: "Test" });
    await store.create(record);

    const result = await authenticatePat(`Bearer ${token}`, store);
    assert.equal(result.authenticated, true);
    if (result.authenticated) {
      assert.equal(result.developerId, "dev-1");
      assert.equal(result.tokenId, record.id);
    }
  });

  it("rejects missing Authorization header", async () => {
    const store = createInMemoryPatStore();
    const result = await authenticatePat(null, store);
    assert.equal(result.authenticated, false);
    if (!result.authenticated) {
      assert.equal(result.errorCode, "MISSING_TOKEN");
    }
  });

  it("rejects invalid token", async () => {
    const store = createInMemoryPatStore();
    const result = await authenticatePat("Bearer nvreg_invalid", store);
    assert.equal(result.authenticated, false);
    if (!result.authenticated) {
      assert.equal(result.errorCode, "INVALID_TOKEN");
    }
  });

  it("rejects revoked token", async () => {
    const store = createInMemoryPatStore();
    const { token, record } = createPat({ developerId: "dev-1", name: "Test" });
    await store.create(record);
    await store.revoke(record.id, "dev-1");

    const result = await authenticatePat(`Bearer ${token}`, store);
    assert.equal(result.authenticated, false);
    if (!result.authenticated) {
      assert.equal(result.errorCode, "TOKEN_REVOKED");
    }
  });
});
