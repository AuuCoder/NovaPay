import assert from "node:assert/strict";
import test from "node:test";
import { AppError } from "../lib/errors";
import { assertEasyPayRequestFreshness } from "../lib/easypay/request";

function withEasyPayEnv(
  values: { nodeEnv: string; requireTimestamp?: string; maxAge?: string },
  run: () => void,
) {
  const env = process.env as Record<string, string | undefined>;
  const previous = {
    nodeEnv: env.NODE_ENV,
    requireTimestamp: process.env.EASYPAY_REQUIRE_TIMESTAMP,
    maxAge: process.env.EASYPAY_TIMESTAMP_MAX_AGE_SECONDS,
  };

  env.NODE_ENV = values.nodeEnv;
  if (values.requireTimestamp === undefined) delete process.env.EASYPAY_REQUIRE_TIMESTAMP;
  else process.env.EASYPAY_REQUIRE_TIMESTAMP = values.requireTimestamp;
  if (values.maxAge === undefined) delete process.env.EASYPAY_TIMESTAMP_MAX_AGE_SECONDS;
  else process.env.EASYPAY_TIMESTAMP_MAX_AGE_SECONDS = values.maxAge;

  try {
    run();
  } finally {
    if (previous.nodeEnv === undefined) delete env.NODE_ENV;
    else env.NODE_ENV = previous.nodeEnv;
    if (previous.requireTimestamp === undefined) delete process.env.EASYPAY_REQUIRE_TIMESTAMP;
    else process.env.EASYPAY_REQUIRE_TIMESTAMP = previous.requireTimestamp;
    if (previous.maxAge === undefined) delete process.env.EASYPAY_TIMESTAMP_MAX_AGE_SECONDS;
    else process.env.EASYPAY_TIMESTAMP_MAX_AGE_SECONDS = previous.maxAge;
  }
}

function hasCode(code: string) {
  return (error: unknown) => error instanceof AppError && error.code === code;
}

test("EasyPay requires timestamp by default in production", () => {
  withEasyPayEnv({ nodeEnv: "production" }, () => {
    assert.throws(
      () => assertEasyPayRequestFreshness({}),
      hasCode("EASYPAY_TIMESTAMP_REQUIRED"),
    );
  });
});

test("EasyPay legacy opt-out permits a missing timestamp", () => {
  withEasyPayEnv({ nodeEnv: "production", requireTimestamp: "0" }, () => {
    assert.doesNotThrow(() => assertEasyPayRequestFreshness({}));
  });
});

test("EasyPay rejects an invalid timestamp even in compatibility mode", () => {
  withEasyPayEnv({ nodeEnv: "production", requireTimestamp: "0" }, () => {
    assert.throws(
      () => assertEasyPayRequestFreshness({ timestamp: "not-a-time" }),
      hasCode("EASYPAY_TIMESTAMP_INVALID"),
    );
  });
});

test("EasyPay rejects expired timestamps", () => {
  withEasyPayEnv({ nodeEnv: "production", maxAge: "300" }, () => {
    assert.throws(
      () =>
        assertEasyPayRequestFreshness({
          timestamp: String(Date.now() - 301_000),
        }),
      hasCode("EASYPAY_TIMESTAMP_EXPIRED"),
    );
  });
});

test("EasyPay rejects an invalid max-age configuration", () => {
  withEasyPayEnv({ nodeEnv: "production", maxAge: "abc" }, () => {
    assert.throws(
      () => assertEasyPayRequestFreshness({ timestamp: String(Date.now()) }),
      hasCode("EASYPAY_TIMESTAMP_CONFIG_INVALID"),
    );
  });
});
