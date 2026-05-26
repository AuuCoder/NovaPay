import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  decryptSecret,
  encryptSecret,
  isStoredSecretSealed,
  maskStoredSecret,
  migrateStoredSecret,
  revealStoredSecret,
  sealStoredSecret,
} from "../../lib/security/secret-box";

describe("registry secret box", () => {
  it("round-trips raw encryption payloads", () => {
    const encrypted = encryptSecret("merchant-bank-account-001");
    assert.equal(decryptSecret(encrypted), "merchant-bank-account-001");
  });

  it("seals and reveals stored secret payloads", () => {
    const sealed = sealStoredSecret("seller@example.com");
    assert.equal(isStoredSecretSealed(sealed), true);
    assert.equal(revealStoredSecret(sealed), "seller@example.com");
  });

  it("migrates plaintext values into sealed storage format", () => {
    const migrated = migrateStoredSecret("6222020000001234");
    assert.ok(migrated);
    assert.equal(isStoredSecretSealed(migrated), true);
    assert.equal(revealStoredSecret(migrated), "6222020000001234");
  });

  it("masks stored values without exposing the plaintext", () => {
    const masked = maskStoredSecret(sealStoredSecret("6222020000001234"));
    assert.equal(masked, "6222****1234");
  });
});
