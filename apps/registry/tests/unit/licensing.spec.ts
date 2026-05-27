import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { sign as cryptoSignRaw } from "node:crypto";

import { createInMemorySigningKeyStore } from "../../lib/signing/key-store";
import {
  createLocalKeyPairAdapter,
  rotateSigningKey,
} from "../../lib/signing/rotation";
import { createSigner } from "../../lib/signing/signer";
import { issueLicense } from "../../lib/licensing/issuer";
import { verifyLicense } from "../../lib/licensing/verifier";
import {
  createInMemoryRevocationStore,
  revokeLicense,
} from "../../lib/licensing/revocation";

async function setupSigningEnvironment() {
  const keyStore = createInMemorySigningKeyStore();
  const adapter = createLocalKeyPairAdapter();
  const rotation = await rotateSigningKey(
    { keyId: `key-license-test-${Math.random().toString(36).slice(2, 8)}` },
    keyStore,
    adapter,
  );
  const signer = createSigner({
    adapter: {
      async signRaw({ rawBytes }) {
        return cryptoSignRaw(null, rawBytes, rotation.keyPair.privateKey!);
      },
    },
  });
  return { keyStore, signer };
}

describe("license issuer + verifier", () => {
  it("issues a license that verifies successfully against the active key", async () => {
    const { keyStore, signer } = await setupSigningEnvironment();
    const issued = await issueLicense(
      {
        pluginSlug: "thirdparty.sample-pay",
        version: "0.1.0",
        pricingPlanKind: "PER_INSTANCE_ONE_TIME",
        instanceId: "inst-abc",
        expiresInSeconds: 3600,
      },
      signer,
      keyStore,
    );

    const result = await verifyLicense(
      {
        jwsCompact: issued.jwsCompact,
        expectedSlug: "thirdparty.sample-pay",
        expectedVersion: "0.1.0",
        expectedInstanceId: "inst-abc",
      },
      keyStore,
    );

    assert.equal(result.valid, true);
    if (result.valid) {
      assert.equal(result.claims.pluginSlug, "thirdparty.sample-pay");
      assert.equal(result.claims.scope, "INSTANCE");
      assert.equal(result.signingKeyId, issued.signingKeyId);
    }
  });

  it("fails with INSTANCE_MISMATCH when expectedInstanceId differs", async () => {
    const { keyStore, signer } = await setupSigningEnvironment();
    const issued = await issueLicense(
      {
        pluginSlug: "thirdparty.sample-pay",
        version: "0.1.0",
        pricingPlanKind: "PER_INSTANCE_ONE_TIME",
        instanceId: "inst-A",
      },
      signer,
      keyStore,
    );

    const result = await verifyLicense(
      {
        jwsCompact: issued.jwsCompact,
        expectedInstanceId: "inst-B",
      },
      keyStore,
    );

    assert.equal(result.valid, false);
    if (!result.valid) {
      assert.equal(result.reason, "INSTANCE_MISMATCH");
    }
  });

  it("fails with MERCHANT_MISMATCH for merchant-scoped licenses", async () => {
    const { keyStore, signer } = await setupSigningEnvironment();
    const issued = await issueLicense(
      {
        pluginSlug: "thirdparty.sample-pay",
        version: "0.1.0",
        pricingPlanKind: "PER_MERCHANT_SUBSCRIPTION",
        instanceId: "inst-A",
        merchantId: "mch-1",
      },
      signer,
      keyStore,
    );

    const result = await verifyLicense(
      {
        jwsCompact: issued.jwsCompact,
        expectedMerchantId: "mch-2",
      },
      keyStore,
    );

    assert.equal(result.valid, false);
    if (!result.valid) {
      assert.equal(result.reason, "MERCHANT_MISMATCH");
    }
  });

  it("fails with EXPIRED when current time is past exp", async () => {
    const { keyStore, signer } = await setupSigningEnvironment();
    const issued = await issueLicense(
      {
        pluginSlug: "thirdparty.sample-pay",
        version: "0.1.0",
        pricingPlanKind: "PER_INSTANCE_ONE_TIME",
        instanceId: "inst-A",
        expiresInSeconds: 60,
      },
      signer,
      keyStore,
    );

    const future = Math.floor(Date.now() / 1000) + 3600;
    const result = await verifyLicense(
      { jwsCompact: issued.jwsCompact, now: future },
      keyStore,
    );

    assert.equal(result.valid, false);
    if (!result.valid) assert.equal(result.reason, "EXPIRED");
  });

  it("fails with REVOKED when revocation store reports the license", async () => {
    const { keyStore, signer } = await setupSigningEnvironment();
    const issued = await issueLicense(
      {
        pluginSlug: "thirdparty.sample-pay",
        version: "0.1.0",
        pricingPlanKind: "PER_INSTANCE_ONE_TIME",
        instanceId: "inst-A",
      },
      signer,
      keyStore,
    );

    const revocations = createInMemoryRevocationStore();
    const revokeResult = await revokeLicense(
      {
        licenseId: issued.jti,
        licenseKeyHash: issued.licenseKeyHash,
        reason: "Test revocation",
        revokedById: "admin-1",
      },
      revocations,
    );
    assert.equal(revokeResult.success, true);

    const result = await verifyLicense(
      { jwsCompact: issued.jwsCompact },
      keyStore,
      revocations,
    );
    assert.equal(result.valid, false);
    if (!result.valid) assert.equal(result.reason, "REVOKED");
  });

  it("fails with UNKNOWN_LICENSE when the signed token was never issued by the registry store", async () => {
    const { keyStore, signer } = await setupSigningEnvironment();
    const issued = await issueLicense(
      {
        pluginSlug: "thirdparty.sample-pay",
        version: "0.1.0",
        pricingPlanKind: "PER_INSTANCE_ONE_TIME",
        instanceId: "inst-A",
      },
      signer,
      keyStore,
    );

    const result = await verifyLicense(
      { jwsCompact: issued.jwsCompact },
      keyStore,
      undefined,
      {
        async findById() {
          return null;
        },
      },
    );

    assert.equal(result.valid, false);
    if (!result.valid) assert.equal(result.reason, "UNKNOWN_LICENSE");
  });

  it("fails with SIGNATURE_INVALID when the JWS is tampered", async () => {
    const { keyStore, signer } = await setupSigningEnvironment();
    const issued = await issueLicense(
      {
        pluginSlug: "thirdparty.sample-pay",
        version: "0.1.0",
        pricingPlanKind: "PER_INSTANCE_ONE_TIME",
        instanceId: "inst-A",
      },
      signer,
      keyStore,
    );

    // Flip a single character in the payload section.
    const parts = issued.jwsCompact.split(".");
    const payloadBytes = Buffer.from(parts[1]!, "base64url");
    payloadBytes[0] = payloadBytes[0]! ^ 0xff;
    const tampered = `${parts[0]}.${payloadBytes.toString("base64url")}.${parts[2]}`;

    const result = await verifyLicense({ jwsCompact: tampered }, keyStore);
    assert.equal(result.valid, false);
    if (!result.valid) {
      // Either SIGNATURE_INVALID (most likely) or INVALID_FORMAT if the
      // tampered base64url no longer decodes; both are acceptable failures.
      assert.ok(["SIGNATURE_INVALID", "INVALID_FORMAT"].includes(result.reason));
    }
  });

  it("rejects malformed JWS strings with INVALID_FORMAT", async () => {
    const { keyStore } = await setupSigningEnvironment();
    const result = await verifyLicense(
      { jwsCompact: "not-a-jws" },
      keyStore,
    );
    assert.equal(result.valid, false);
    if (!result.valid) assert.equal(result.reason, "INVALID_FORMAT");
  });
});

describe("revocation store", () => {
  it("rejects revocation without a reason", async () => {
    const store = createInMemoryRevocationStore();
    const result = await revokeLicense(
      {
        licenseId: "lic-1",
        licenseKeyHash: "deadbeef",
        reason: "   ",
        revokedById: "admin-1",
      },
      store,
    );
    assert.equal(result.success, false);
    assert.equal(result.errorCode, "REASON_REQUIRED");
  });

  it("rejects double revocation", async () => {
    const store = createInMemoryRevocationStore();
    await revokeLicense(
      {
        licenseId: "lic-1",
        licenseKeyHash: "deadbeef",
        reason: "test",
        revokedById: "admin-1",
      },
      store,
    );
    const second = await revokeLicense(
      {
        licenseId: "lic-1",
        licenseKeyHash: "deadbeef",
        reason: "again",
        revokedById: "admin-1",
      },
      store,
    );
    assert.equal(second.success, false);
    assert.equal(second.errorCode, "ALREADY_REVOKED");
  });
});
