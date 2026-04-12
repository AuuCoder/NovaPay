import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function readFixture(relativePath: string) {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

test(".env example keeps payment channel secrets out of platform env vars", () => {
  const envExample = readFixture("../.env.example");

  assert.doesNotMatch(envExample, /^ALIPAY_[A-Z0-9_]+=.*$/m);
  assert.doesNotMatch(envExample, /^WXPAY_[A-Z0-9_]+=.*$/m);
  assert.match(
    envExample,
    /Merchant-owned channel credentials and upstream callback URLs are configured/s,
  );
});

test("merchant-facing docs explain dynamic callbacks and self-managed channel config", () => {
  const readme = readFixture("../README.md");
  const examples = readFixture("../docs/merchant-integration-examples.md");
  const runbook = readFixture("../docs/production-runbook.md");

  assert.match(readme, /商户不需要也不能传 `notifyUrl`/);
  assert.match(readme, /`\.env` 只保留平台级配置，不再填写 `ALIPAY_\*` \/ `WXPAY_\*`/);
  assert.match(examples, /商户不需要也不能传 `notifyUrl`/);
  assert.match(
    examples,
    /不要在平台 `\.env` 中填写 `ALIPAY_\*` \/ `WXPAY_\*` 商户支付参数/,
  );
  assert.match(runbook, /支付宝和微信支付参数不再由平台环境变量统一提供/);
});
