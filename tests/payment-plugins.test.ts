import assert from "node:assert/strict";
import test from "node:test";
import { getPaymentChannelOptions } from "../app/admin/support";
import {
  buildMerchantChannelCallbackPath,
  getMerchantChannelTemplates,
  supportsMerchantChannelCallbackRoute,
} from "../lib/merchant-channel-accounts";
import { listPaymentChannels } from "../lib/payments/registry";
import { listPaymentPlugins } from "../lib/payments/plugins";

test("payment plugin surfaces stay aligned across registry, merchant templates, and admin options", () => {
  const registryCodes = listPaymentChannels()
    .map((channel) => channel.code)
    .sort();
  const templateCodes = getMerchantChannelTemplates("zh")
    .map((template) => template.channelCode)
    .sort();
  const optionCodes = getPaymentChannelOptions("zh")
    .map((option) => option.code)
    .sort();

  assert.deepEqual(templateCodes, registryCodes);
  assert.deepEqual(optionCodes, registryCodes);
});

test("payment plugin callback metadata drives callback route support", () => {
  assert.equal(supportsMerchantChannelCallbackRoute("alipay.page"), true);
  assert.equal(supportsMerchantChannelCallbackRoute("wxpay.native"), true);
  assert.equal(supportsMerchantChannelCallbackRoute("usdt.base"), false);
  assert.equal(supportsMerchantChannelCallbackRoute("ctf.alipay.monitor"), true);
  assert.equal(supportsMerchantChannelCallbackRoute("ctf.wxpay.monitor"), true);

  assert.equal(
    buildMerchantChannelCallbackPath("wxpay.native", "acct_plugin", "token_plugin"),
    "/api/payments/callback/wxpay/acct_plugin/token_plugin",
  );
  assert.equal(
    buildMerchantChannelCallbackPath("ctf.alipay.monitor", "acct_ctf", "token_ctf"),
    "/api/ctf/bill-capture/acct_ctf/token_ctf",
  );
});

test("receipt-listener plugins require a collector secret", () => {
  for (const channelCode of ["ctf.alipay.monitor", "ctf.wxpay.monitor"]) {
    const template = getMerchantChannelTemplates("zh").find(
      (item) => item.channelCode === channelCode,
    );
    const secretField = template?.fields.find((field) => field.key === "collectorSecret");

    assert.equal(secretField?.required, true);
  }
});

test("payment plugins expose unique marketplace metadata for controlled plugin market", () => {
  const plugins = listPaymentPlugins();
  const slugs = plugins.map((plugin) => plugin.marketplace.slug);
  const packageNames = plugins.map((plugin) => plugin.marketplace.packageName);

  assert.equal(new Set(slugs).size, plugins.length);
  assert.equal(new Set(packageNames).size, plugins.length);

  for (const plugin of plugins) {
    assert.ok(plugin.marketplace.vendor);
    assert.ok(plugin.marketplace.version);
    assert.ok(plugin.marketplace.summary.zh);
    assert.ok(plugin.marketplace.summary.en);
  }
});
