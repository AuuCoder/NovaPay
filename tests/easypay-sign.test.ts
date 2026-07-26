import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import {
  appendSignedQueryToUrl,
  buildEasyPaySignSource,
  signEasyPay,
  verifyEasyPaySign,
  withEasyPaySignature,
} from "../lib/easypay/sign";
import {
  DEFAULT_EASYPAY_TYPE_MAPPING,
  findUninstalledMappingTargets,
  parseTypeMapping,
  resolveChannelCode,
} from "../lib/easypay/mapping";

const KEY = "testkey123456";

test("sign source excludes sign/sign_type and empty values, sorts ASCII ascending", () => {
  const source = buildEasyPaySignSource({
    pid: "1001",
    type: "alipay",
    out_trade_no: "ORDER-1",
    name: "Test",
    money: "1.00",
    notify_url: "",
    sign: "should-be-dropped",
    sign_type: "MD5",
    param: undefined,
    extra: null,
  });

  assert.equal(source, "money=1.00&name=Test&out_trade_no=ORDER-1&pid=1001&type=alipay");
});

test("sign appends the key directly (not &key=) and md5 lowercases", () => {
  const params = { pid: "1001", money: "9.90", out_trade_no: "A1" };
  const source = buildEasyPaySignSource(params);
  const expected = createHash("md5").update(`${source}${KEY}`, "utf8").digest("hex");

  assert.equal(signEasyPay(params, KEY), expected);
  // 确认确实是直接拼 KEY,而不是 `&key=`
  assert.notEqual(
    signEasyPay(params, KEY),
    createHash("md5").update(`${source}&key=${KEY}`, "utf8").digest("hex"),
  );
});

test("verify accepts a correct signature and rejects a tampered one", () => {
  const params: Record<string, string> = { pid: "1001", money: "5.00", out_trade_no: "B2" };
  params.sign = signEasyPay(params, KEY);

  assert.equal(verifyEasyPaySign(params, KEY), true);

  const tampered = { ...params, money: "500.00" };
  assert.equal(verifyEasyPaySign(tampered, KEY), false);
});

test("verify is case-insensitive on the provided sign and false when missing", () => {
  const params: Record<string, string> = { pid: "1001", out_trade_no: "C3" };
  const sign = signEasyPay(params, KEY);

  assert.equal(verifyEasyPaySign({ ...params, sign: sign.toUpperCase() }, KEY), true);
  assert.equal(verifyEasyPaySign(params, KEY), false);
});

test("withEasyPaySignature is self-consistent and drops empty values", () => {
  const signed = withEasyPaySignature(
    { pid: "1001", trade_status: "TRADE_SUCCESS", param: "" },
    KEY,
  );

  assert.equal(signed.sign_type, "MD5");
  assert.ok(!("param" in signed));
  assert.equal(verifyEasyPaySign(signed, KEY), true);
});

test("appendSignedQueryToUrl preserves existing query and adds a valid signature", () => {
  const url = appendSignedQueryToUrl(
    "https://shop.example.com/return?ref=abc",
    { pid: "1001", out_trade_no: "D4", trade_status: "TRADE_SUCCESS" },
    KEY,
  );
  const parsed = new URL(url);

  assert.equal(parsed.searchParams.get("ref"), "abc");
  assert.equal(parsed.searchParams.get("pid"), "1001");
  assert.ok(parsed.searchParams.get("sign"));
});

test("resolveChannelCode maps short types to dotted channel codes, null when unmapped", () => {
  assert.equal(resolveChannelCode(DEFAULT_EASYPAY_TYPE_MAPPING, "alipay"), "alipay.page");
  assert.equal(resolveChannelCode(DEFAULT_EASYPAY_TYPE_MAPPING, "WXPAY"), "wxpay.native");
  assert.equal(resolveChannelCode(DEFAULT_EASYPAY_TYPE_MAPPING, "qqpay"), null);
  assert.equal(resolveChannelCode(DEFAULT_EASYPAY_TYPE_MAPPING, ""), null);
});

test("parseTypeMapping normalizes keys/values and rejects bad shapes", () => {
  assert.deepEqual(parseTypeMapping({ Alipay: "alipay.page", bad: 1, "": "x" }), {
    alipay: "alipay.page",
  });
  assert.deepEqual(parseTypeMapping(null), {});
  assert.deepEqual(parseTypeMapping(["a"]), {});
});

test("findUninstalledMappingTargets flags channels not installed", () => {
  const invalid = findUninstalledMappingTargets(
    { alipay: "alipay.page", usdt: "usdt.bsc" },
    ["alipay.page"],
  );
  assert.deepEqual(invalid, [{ type: "usdt", channelCode: "usdt.bsc" }]);
});
