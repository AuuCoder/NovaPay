import assert from "node:assert/strict";
import test from "node:test";
import {
  assertMerchantProfileCompleteForChannel,
  buildMerchantProfileCompletionMessage,
  channelRequiresMerchantProfile,
  createPendingMerchantName,
  getMerchantDisplayName,
  getMerchantProfileMissingFields,
  isMerchantProfileComplete,
} from "../lib/merchant-profile-completion";

test("pending merchant placeholder name is treated as incomplete", () => {
  const merchant = {
    name: createPendingMerchantName("mch_123456"),
    legalName: null,
    contactName: "张三",
    contactPhone: null,
    companyRegistrationId: null,
  };

  assert.deepEqual(getMerchantProfileMissingFields(merchant), [
    "商户名称",
    "企业主体名称",
    "联系电话",
    "统一社会信用代码",
  ]);
  assert.equal(isMerchantProfileComplete(merchant), false);
});

test("merchant profile becomes complete after required fields are filled", () => {
  const merchant = {
    name: "星链科技有限公司",
    legalName: "星链科技有限公司",
    contactName: "张三",
    contactPhone: "13800138000",
    companyRegistrationId: "91310000XXXXXXXXXX",
  };

  assert.deepEqual(getMerchantProfileMissingFields(merchant), []);
  assert.equal(isMerchantProfileComplete(merchant), true);
});

test("display name falls back to verification status when placeholder name is hidden", () => {
  assert.equal(
    getMerchantDisplayName(createPendingMerchantName("mch_pending"), "zh", {
      profileComplete: false,
    }),
    "待认证商户",
  );
  assert.equal(
    getMerchantDisplayName(createPendingMerchantName("mch_verified"), "en", {
      profileComplete: true,
    }),
    "Verified Merchant",
  );
});

test("completion message supports english field labels", () => {
  const merchant = {
    name: createPendingMerchantName("mch_abcdef"),
    legalName: null,
    contactName: null,
    contactPhone: "13800138000",
    companyRegistrationId: null,
  };

  assert.equal(
    buildMerchantProfileCompletionMessage(merchant, {
      locale: "en",
      prefix: "Complete before activation: ",
    }),
    "Complete before activation: Merchant Name, Legal Entity Name, Contact Name, Business Registration ID.",
  );
});

test("regulated channels require merchant profile while future lightweight channels do not", () => {
  assert.equal(channelRequiresMerchantProfile("alipay.page"), true);
  assert.equal(channelRequiresMerchantProfile("wxpay.native"), true);
  assert.equal(channelRequiresMerchantProfile("codepay.qr"), false);
  assert.equal(channelRequiresMerchantProfile("usdt.trc20"), false);
});

test("channel-scoped profile assertion only blocks regulated channels", () => {
  const merchant = {
    name: createPendingMerchantName("mch_future"),
    legalName: null,
    contactName: null,
    contactPhone: null,
    companyRegistrationId: null,
  };

  assert.throws(() => {
    assertMerchantProfileCompleteForChannel(merchant, "alipay.page", {
      locale: "en",
      prefix: "Fill profile first: ",
    });
  });

  assert.doesNotThrow(() => {
    assertMerchantProfileCompleteForChannel(merchant, "usdt.trc20", {
      locale: "en",
      prefix: "Fill profile first: ",
    });
  });
});
