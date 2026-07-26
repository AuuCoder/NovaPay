import assert from "node:assert/strict";
import test from "node:test";
import { AppError } from "../lib/errors";
import { assertPaymentNotificationAmountMatches } from "../lib/orders/service";

function withAmountEnv(
  values: { nodeEnv: string; requireAmount?: string },
  run: () => void,
) {
  const env = process.env as Record<string, string | undefined>;
  const previousNodeEnv = env.NODE_ENV;
  const previousRequirement = process.env.NOVAPAY_REQUIRE_NOTIFICATION_AMOUNT;
  env.NODE_ENV = values.nodeEnv;
  if (values.requireAmount === undefined) {
    delete process.env.NOVAPAY_REQUIRE_NOTIFICATION_AMOUNT;
  } else {
    process.env.NOVAPAY_REQUIRE_NOTIFICATION_AMOUNT = values.requireAmount;
  }

  try {
    run();
  } finally {
    if (previousNodeEnv === undefined) delete env.NODE_ENV;
    else env.NODE_ENV = previousNodeEnv;
    if (previousRequirement === undefined) {
      delete process.env.NOVAPAY_REQUIRE_NOTIFICATION_AMOUNT;
    } else {
      process.env.NOVAPAY_REQUIRE_NOTIFICATION_AMOUNT = previousRequirement;
    }
  }
}

test("successful notification requires amount by default in production", () => {
  withAmountEnv({ nodeEnv: "production" }, () => {
    assert.throws(
      () =>
        assertPaymentNotificationAmountMatches({ toString: () => "88.00" }, undefined, {
          requireAmount: true,
        }),
      (error: unknown) => error instanceof AppError && error.code === "AMOUNT_REQUIRED",
    );
  });
});

test("legacy amount opt-out is explicit and does not affect non-success notifications", () => {
  withAmountEnv({ nodeEnv: "production", requireAmount: "0" }, () => {
    const previousWarn = console.warn;
    console.warn = () => undefined;
    try {
      assert.doesNotThrow(() =>
        assertPaymentNotificationAmountMatches({ toString: () => "88.00" }, undefined, {
          requireAmount: true,
        }),
      );
      assert.doesNotThrow(() =>
        assertPaymentNotificationAmountMatches({ toString: () => "88.00" }, undefined, {
          requireAmount: false,
        }),
      );
    } finally {
      console.warn = previousWarn;
    }
  });
});
