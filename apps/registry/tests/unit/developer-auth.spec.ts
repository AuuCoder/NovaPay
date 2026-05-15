import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  registerDeveloper,
  loginDeveloper,
  verifyDeveloperEmail,
  createInMemoryDeveloperAuthStore,
  createInMemoryEmailVerificationStore,
} from "../../lib/auth/developer-auth";

describe("registerDeveloper", () => {
  it("creates a developer with EMAIL_UNVERIFIED status", async () => {
    const store = createInMemoryDeveloperAuthStore();
    const emailStore = createInMemoryEmailVerificationStore();

    const result = await registerDeveloper(
      { email: "dev@example.com", password: "securepass123", displayName: "Dev", contact: { phone: "123" } },
      store,
      emailStore,
    );

    assert.equal(result.success, true);
    assert.equal(result.developer?.status, "EMAIL_UNVERIFIED");
    assert.equal(result.developer?.email, "dev@example.com");
  });

  it("rejects duplicate email", async () => {
    const store = createInMemoryDeveloperAuthStore();
    const emailStore = createInMemoryEmailVerificationStore();

    await registerDeveloper(
      { email: "dev@example.com", password: "securepass123", displayName: "Dev", contact: { phone: "123" } },
      store,
      emailStore,
    );
    const result = await registerDeveloper(
      { email: "dev@example.com", password: "otherpass123", displayName: "Dev2", contact: { phone: "456" } },
      store,
      emailStore,
    );

    assert.equal(result.success, false);
    assert.equal(result.errorCode, "EMAIL_ALREADY_EXISTS");
  });

  it("rejects short passwords", async () => {
    const store = createInMemoryDeveloperAuthStore();
    const emailStore = createInMemoryEmailVerificationStore();

    const result = await registerDeveloper(
      { email: "dev@example.com", password: "short", displayName: "Dev", contact: { phone: "123" } },
      store,
      emailStore,
    );

    assert.equal(result.success, false);
    assert.equal(result.errorCode, "PASSWORD_TOO_SHORT");
  });

  it("rejects invalid email format", async () => {
    const store = createInMemoryDeveloperAuthStore();
    const emailStore = createInMemoryEmailVerificationStore();

    const result = await registerDeveloper(
      { email: "not-an-email", password: "securepass123", displayName: "Dev", contact: { phone: "123" } },
      store,
      emailStore,
    );

    assert.equal(result.success, false);
    assert.equal(result.errorCode, "INVALID_EMAIL");
  });

  it("rejects empty contact", async () => {
    const store = createInMemoryDeveloperAuthStore();
    const emailStore = createInMemoryEmailVerificationStore();

    const result = await registerDeveloper(
      { email: "dev@example.com", password: "securepass123", displayName: "Dev", contact: {} },
      store,
      emailStore,
    );

    assert.equal(result.success, false);
    assert.equal(result.errorCode, "MISSING_CONTACT");
  });
});

describe("loginDeveloper", () => {
  it("succeeds with correct credentials", async () => {
    const store = createInMemoryDeveloperAuthStore();
    const emailStore = createInMemoryEmailVerificationStore();

    await registerDeveloper(
      { email: "dev@example.com", password: "securepass123", displayName: "Dev", contact: { phone: "123" } },
      store,
      emailStore,
    );

    const result = await loginDeveloper({ email: "dev@example.com", password: "securepass123" }, store);
    assert.equal(result.success, true);
    assert.equal(result.developer?.email, "dev@example.com");
  });

  it("fails with wrong password", async () => {
    const store = createInMemoryDeveloperAuthStore();
    const emailStore = createInMemoryEmailVerificationStore();

    await registerDeveloper(
      { email: "dev@example.com", password: "securepass123", displayName: "Dev", contact: { phone: "123" } },
      store,
      emailStore,
    );

    const result = await loginDeveloper({ email: "dev@example.com", password: "wrongpass" }, store);
    assert.equal(result.success, false);
    assert.equal(result.errorCode, "INVALID_CREDENTIALS");
  });

  it("fails for non-existent account", async () => {
    const store = createInMemoryDeveloperAuthStore();
    const result = await loginDeveloper({ email: "nobody@example.com", password: "pass" }, store);
    assert.equal(result.success, false);
    assert.equal(result.errorCode, "ACCOUNT_NOT_FOUND");
  });
});

describe("verifyDeveloperEmail", () => {
  it("transitions status from EMAIL_UNVERIFIED to ACTIVE", async () => {
    const store = createInMemoryDeveloperAuthStore();
    const emailStore = createInMemoryEmailVerificationStore();

    const reg = await registerDeveloper(
      { email: "dev@example.com", password: "securepass123", displayName: "Dev", contact: { phone: "123" } },
      store,
      emailStore,
    );
    assert.equal(reg.developer?.status, "EMAIL_UNVERIFIED");

    // Get the token (in real flow this would be sent via email)
    const token = await emailStore.createToken(reg.developer!.id);
    // Consume the original token first (the one created during registration)
    // Actually, createToken was called during register, so we need to find it.
    // For testing, we just create a new one:
    const verifyToken = await emailStore.createToken(reg.developer!.id);

    const result = await verifyDeveloperEmail(verifyToken, store, emailStore);
    assert.equal(result.success, true);
    assert.equal(result.developer?.status, "ACTIVE");
  });

  it("rejects invalid token", async () => {
    const store = createInMemoryDeveloperAuthStore();
    const emailStore = createInMemoryEmailVerificationStore();

    const result = await verifyDeveloperEmail("invalid-token", store, emailStore);
    assert.equal(result.success, false);
    assert.equal(result.errorCode, "INVALID_TOKEN");
  });
});
