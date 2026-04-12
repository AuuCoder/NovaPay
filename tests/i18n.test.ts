import assert from "node:assert/strict";
import test from "node:test";
import { normalizeLocale, pickByLocale } from "../lib/i18n";

test("normalizeLocale falls back to zh and accepts en", () => {
  assert.equal(normalizeLocale(undefined), "zh");
  assert.equal(normalizeLocale(null), "zh");
  assert.equal(normalizeLocale("zh"), "zh");
  assert.equal(normalizeLocale("en"), "en");
  assert.equal(normalizeLocale("fr"), "zh");
});

test("pickByLocale returns values by locale", () => {
  assert.equal(pickByLocale("zh", { zh: "中文", en: "English" }), "中文");
  assert.equal(pickByLocale("en", { zh: "中文", en: "English" }), "English");
});
