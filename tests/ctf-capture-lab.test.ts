import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCtfCaptureLabSignature,
  createCtfCaptureLabBill,
  createCtfCaptureLabSession,
  decodeCtfCaptureLabEnvelope,
  encodeCtfCaptureLabEnvelope,
  parseCtfCaptureLabPaymentInput,
} from "../lib/ctf-capture-lab/app";
import {
  assertCtfBillCaptureAccount,
  assertCtfCollectorSecret,
  parseCtfBillCapturePayloadForAccount,
} from "../lib/ctf-bill-capture/service";
import type { ProviderAccountConfig } from "../lib/payments/types";

function buildCollectorAccount(collectorSecret?: string): ProviderAccountConfig {
  return {
    id: "account-test",
    providerKey: "ctf-bill-capture",
    channelCode: "ctf.alipay.monitor",
    displayName: "test collector",
    config: collectorSecret ? { collectorSecret } : {},
  };
}

test("CTF capture lab signature is stable and uses METHOD/PATH/timestamp/nonce/body", () => {
  const signature = buildCtfCaptureLabSignature({
    secret: "secret",
    method: "post",
    path: "/api/ctf/capture-lab/pay",
    timestamp: "1700000000000",
    nonce: "nonce-1",
    body: '{"amount":"1.23"}',
  });

  assert.equal(signature, "235a32d15bfa5682b6d80ddc9ace2931dbd62a151803b32b080f70162a3f5790");
});

test("CTF capture lab envelope round-trips bill rows as base64url JSON", () => {
  const session = createCtfCaptureLabSession({ deviceId: "unit-device" });
  const bill = createCtfCaptureLabBill({
    sessionId: session.sessionId,
    channelCode: "ctf.alipay.monitor",
    amount: "88",
    remark: "ORDER-UNIT-1",
    payerAccount: "buyer@example.test",
  });

  const decoded = decodeCtfCaptureLabEnvelope(encodeCtfCaptureLabEnvelope([bill]));

  assert.equal(decoded.version, 1);
  assert.equal(decoded.rows.length, 1);
  assert.equal(decoded.rows[0]?.amount, "88.00");
  assert.equal(decoded.rows[0]?.remark, "ORDER-UNIT-1");
  assert.equal(decoded.rows[0]?.channelCode, "ctf.alipay.monitor");
});

test("CTF capture lab payment input accepts aliases and normalizes monitor channels", () => {
  const input = parseCtfCaptureLabPaymentInput({
    channel: "wxpay",
    money: 6.6,
    memo: "ORDER-WX-1",
    nickname: "ctf-user",
  });

  assert.deepEqual(input, {
    channelCode: "ctf.wxpay.monitor",
    amount: "6.60",
    remark: "ORDER-WX-1",
    payerAccount: "ctf-user",
  });
});

test("CTF bill collector fails closed when its secret is not configured", () => {
  assert.throws(
    () =>
      assertCtfCollectorSecret({
        account: buildCollectorAccount(),
        providedSecret: null,
      }),
    (error: unknown) =>
      error instanceof Error &&
      "code" in error &&
      error.code === "CTF_COLLECTOR_SECRET_NOT_CONFIGURED",
  );
});

test("CTF bill collector requires the configured secret", () => {
  const account = buildCollectorAccount("collector-test-secret");

  assert.throws(() =>
    assertCtfCollectorSecret({ account, providedSecret: "wrong-secret" }),
  );
  assert.doesNotThrow(() =>
    assertCtfCollectorSecret({ account, providedSecret: "collector-test-secret" }),
  );
});

test("CTF bill collector rejects normal payment provider accounts", () => {
  assert.throws(
    () =>
      assertCtfBillCaptureAccount({
        ...buildCollectorAccount("collector-test-secret"),
        providerKey: "alipay",
        channelCode: "alipay.page",
      }),
    (error: unknown) =>
      error instanceof Error &&
      "code" in error &&
      error.code === "CTF_BILL_ACCOUNT_NOT_ALLOWED",
  );

  assert.doesNotThrow(() =>
    assertCtfBillCaptureAccount(buildCollectorAccount("collector-test-secret")),
  );
});

test("CTF bill collector never infers an amount from an open order", async () => {
  await assert.rejects(
    () =>
      parseCtfBillCapturePayloadForAccount({
        account: buildCollectorAccount("collector-test-secret"),
        raw: {
          channelCode: "ctf.alipay.monitor",
          source: "notif-alipay-voice-helper",
          paidAt: "2026-07-26T06:46:00+08:00",
          rawNotification: {
            packageName: "com.eg.android.AlipayGphone",
            channelId: "voice_helper",
            title: "收钱提醒助手",
          },
        },
      }),
    (error: unknown) =>
      error instanceof Error &&
      "code" in error &&
      error.code === "CTF_BILL_AMOUNT_REQUIRED",
  );
});
