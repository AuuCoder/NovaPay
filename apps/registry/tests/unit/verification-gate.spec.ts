import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assertVerificationSatisfied,
  hasPassedVerificationSession,
  requiresVerificationForPublish,
} from "../../lib/review/verification-gate";
import type { PluginVersionTestSession } from "../../lib/runtime/state";

function buildSession(
  status: PluginVersionTestSession["status"],
): PluginVersionTestSession {
  return {
    id: "pts_test",
    pluginSlug: "thirdparty.foo-pay",
    version: "1.0.0",
    status,
    verificationProfile: {
      version: 1,
      pluginType: "PAYMENT_CHANNEL",
      executionMode: "AUTO_ONLY",
      requiredConfigKeys: ["appId"],
      requiredChecks: ["create_payment"],
      expectedCreatePayment: {
        status: ["requires_action"],
        mode: ["redirect"],
        checkoutUrl: "required",
      },
    },
    submittedConfig: {
      appId: "demo",
    },
    steps: [],
    startedAt: null,
    completedAt: null,
    expiresAt: null,
    failureReason: null,
    resultSnapshot: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

describe("verification gate", () => {
  it("treats novapay.* plugins as official and exempt from verification", () => {
    assert.equal(requiresVerificationForPublish("novapay.alipay-page"), false);
    assert.doesNotThrow(() =>
      assertVerificationSatisfied({
        slug: "novapay.alipay-page",
        sessions: [],
        manifest: null,
      }),
    );
  });

  it("requires verification for third-party plugins", () => {
    assert.equal(requiresVerificationForPublish("thirdparty.foo-pay"), true);
    assert.throws(
      () =>
        assertVerificationSatisfied({
          slug: "thirdparty.foo-pay",
          sessions: [],
          manifest: {
            verificationProfile: buildSession("PASSED").verificationProfile,
          } as never,
        }),
      /must pass publisher self-verification/,
    );
  });

  it("requires verificationProfile for third-party plugins", () => {
    assert.throws(
      () =>
        assertVerificationSatisfied({
          slug: "thirdparty.foo-pay",
          sessions: [buildSession("PASSED")],
          manifest: null,
        }),
      /must declare verificationProfile/,
    );
  });

  it("accepts third-party plugins when a passed session exists", () => {
    const sessions = [buildSession("FAILED"), buildSession("PASSED")];

    assert.equal(hasPassedVerificationSession(sessions), true);
    assert.doesNotThrow(() =>
      assertVerificationSatisfied({
        slug: "thirdparty.foo-pay",
        sessions,
        manifest: {
          verificationProfile: buildSession("PASSED").verificationProfile,
        } as never,
      }),
    );
  });
});
