import { createHash, timingSafeEqual } from "node:crypto";

/**
 * 易支付(彩虹易支付)协议签名工具。
 *
 * 算法(与社区实现完全一致):
 *  1. 取所有参数,排除 `sign`、`sign_type`,以及空值(空串 / null / undefined)。
 *  2. key 按 ASCII 升序排序(JS 默认 `sort()` 即码点升序,等价 PHP `ksort`)。
 *  3. 拼成 `a=b&c=d`,**不做 URL 编码**。
 *  4. 末尾**直接拼接** KEY(注意:不是 `&key=KEY`,而是直接把 KEY 接在串尾)。
 *  5. `md5()` 取小写,`sign_type=MD5`。
 *
 * 纯函数,不依赖 DB / Next,便于单测。
 */

export type EasyPayParams = Record<string, string | number | null | undefined>;

const EXCLUDED_SIGN_KEYS = new Set(["sign", "sign_type"]);

function isMeaningfulValue(value: string | number | null | undefined): value is string | number {
  if (value === null || value === undefined) {
    return false;
  }

  return String(value) !== "";
}

/**
 * 构造待签名源串:过滤 sign/sign_type/空值 → key ASCII 升序 → `a=b&c=d`(不编码)。
 */
export function buildEasyPaySignSource(params: EasyPayParams): string {
  return Object.keys(params)
    .filter((key) => !EXCLUDED_SIGN_KEYS.has(key))
    .filter((key) => isMeaningfulValue(params[key]))
    .sort()
    .map((key) => `${key}=${String(params[key])}`)
    .join("&");
}

/**
 * 计算签名:md5(源串 + KEY),小写。
 */
export function signEasyPay(params: EasyPayParams, key: string): string {
  const source = buildEasyPaySignSource(params);
  return createHash("md5").update(`${source}${key}`, "utf8").digest("hex");
}

/**
 * 校验签名。比较大小写不敏感,缺失 sign 直接判 false。
 */
export function verifyEasyPaySign(params: EasyPayParams, key: string): boolean {
  const provided = params.sign;

  if (!isMeaningfulValue(provided)) {
    return false;
  }

  const expected = signEasyPay(params, key);
  const expectedBuffer = Buffer.from(expected);
  const providedBuffer = Buffer.from(String(provided).toLowerCase());
  return (
    expectedBuffer.length === providedBuffer.length &&
    timingSafeEqual(expectedBuffer, providedBuffer)
  );
}

/**
 * 给一组业务参数补上 `sign_type=MD5` 与 `sign`,返回带签名的参数对象。
 * 用于构造出站 notify / return 的回跳参数。
 */
export function withEasyPaySignature(params: EasyPayParams, key: string): Record<string, string> {
  const signed: EasyPayParams = { ...params, sign_type: "MD5" };
  const sign = signEasyPay(signed, key);

  const result: Record<string, string> = {};
  for (const [paramKey, value] of Object.entries(signed)) {
    if (isMeaningfulValue(value)) {
      result[paramKey] = String(value);
    }
  }
  result.sign = sign;
  return result;
}

/**
 * 构造带签名的查询串(已做 URL 编码,可直接拼到 URL 上)。
 * 注意:签名计算用的是未编码源串,编码只发生在最终拼 URL 这一步。
 */
export function buildSignedQuery(params: EasyPayParams, key: string): string {
  const signed = withEasyPaySignature(params, key);
  const search = new URLSearchParams();
  for (const [paramKey, value] of Object.entries(signed)) {
    search.append(paramKey, value);
  }
  return search.toString();
}

/**
 * 把签名参数追加到一个已有 URL 上(保留其原有 query),返回完整 URL 字符串。
 */
export function appendSignedQueryToUrl(
  baseUrl: string,
  params: EasyPayParams,
  key: string,
): string {
  const signed = withEasyPaySignature(params, key);
  const url = new URL(baseUrl);
  for (const [paramKey, value] of Object.entries(signed)) {
    url.searchParams.set(paramKey, value);
  }
  return url.toString();
}
