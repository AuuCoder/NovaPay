import { NextResponse } from "next/server";
import type { Locale } from "@/lib/i18n";

type MessageBuilder =
  | { zh: string; en: string }
  | ((vars?: Record<string, string | number | null | undefined>) => {
      zh: string;
      en: string;
    });

const dictionary: Record<string, MessageBuilder> = {
  UNAUTHORIZED: {
    zh: "请先登录或提供有效凭证。",
    en: "Please sign in or provide valid credentials.",
  },
  FORBIDDEN: {
    zh: "你没有执行当前操作的权限。",
    en: "You do not have permission to perform this action.",
  },
  MISSING_CREDENTIALS: {
    zh: "缺少 Registry 应用凭证头。",
    en: "Registry application credential headers are missing.",
  },
  CONSUMER_NOT_FOUND: (vars) => ({
    zh: `未找到 appId 为 ${String(vars?.appId ?? "")} 的 Registry 消费方。`,
    en: `No registry consumer found for appId ${String(vars?.appId ?? "")}.`,
  }),
  CONSUMER_DISABLED: (vars) => ({
    zh: `Registry 消费方 ${String(vars?.appId ?? "")} 已被停用。`,
    en: `Registry consumer ${String(vars?.appId ?? "")} is disabled.`,
  }),
  INVALID_REGISTRY_APP_KEY: {
    zh: "提供的应用密钥不正确。",
    en: "The provided application key is invalid.",
  },
  MISSING_TOKEN: {
    zh: "请先登录 Registry。",
    en: "Please sign in to the Registry first.",
  },
  INVALID_TOKEN: {
    zh: "个人访问令牌无效。",
    en: "The personal access token is invalid.",
  },
  TOKEN_REVOKED: {
    zh: "该个人访问令牌已被撤销。",
    en: "This personal access token has been revoked.",
  },
  DEVELOPER_ACCOUNT_REQUIRED: {
    zh: "当前操作需要开发者账号。",
    en: "A developer account is required for this action.",
  },
  ADMIN_SSO_REQUIRED: {
    zh: "当前操作需要 NovaPay 管理员 SSO 会话。",
    en: "A NovaPay admin SSO session is required for this action.",
  },
  ACCOUNT_HOLDER_REQUIRED: {
    zh: "必须填写收款人姓名。",
    en: "Account holder is required.",
  },
  PAYPAL_EMAIL_REQUIRED: {
    zh: "必须填写 PayPal 邮箱。",
    en: "PayPal email is required.",
  },
  ACCOUNT_NUMBER_REQUIRED: {
    zh: "必须填写银行卡号。",
    en: "Bank account number is required.",
  },
  PAYOUT_ACCOUNT_REQUIRED: {
    zh: "必须选择收款账户。",
    en: "Payout account is required.",
  },
  INSUFFICIENT_BALANCE: {
    zh: "可用余额不足。",
    en: "Insufficient available balance.",
  },
  INVALID_AMOUNT: {
    zh: "金额无效。",
    en: "Invalid amount.",
  },
  INVALID_FORM_DATA: {
    zh: "请求必须使用 multipart/form-data。",
    en: "The request must use multipart/form-data.",
  },
  MISSING_PACKAGE: {
    zh: "必须上传 `package` 文件。",
    en: "The `package` file is required.",
  },
  PACKAGE_TOO_LARGE: (vars) => ({
    zh: `插件包超过 ${String(vars?.maxMb ?? "")} MB 限制。`,
    en: `The package exceeds the ${String(vars?.maxMb ?? "")} MB limit.`,
  }),
  INVALID_PRICING_PLAN_KIND: {
    zh: "收费插件必须提供有效的计费计划。",
    en: "Paid plugins must provide a valid pricing plan.",
  },
  INVALID_PRICE_AMOUNT: {
    zh: "收费插件必须提供合法且大于 0 的价格金额。",
    en: "Paid plugins must provide a valid positive price amount.",
  },
  INVALID_PRICE_CURRENCY: {
    zh: "价格币种必须是 3 位 ISO 货币代码。",
    en: "Price currency must be a 3-letter ISO currency code.",
  },
  SLUG_MISMATCH: (vars) => ({
    zh: `Manifest 中的 slug ${String(vars?.manifestSlug ?? "")} 与 URL slug ${String(vars?.slug ?? "")} 不一致。`,
    en: `The manifest slug ${String(vars?.manifestSlug ?? "")} does not match the URL slug ${String(vars?.slug ?? "")}.`,
  }),
  RESERVED_SLUG: {
    zh: "`novapay.*` 命名空间保留给官方插件使用。",
    en: "The `novapay.*` namespace is reserved for official plugins.",
  },
  NOT_OWNER: {
    zh: "你可以浏览该插件，但只有最初发布者才能继续管理。",
    en: "You can browse this plugin, but only the original publisher can manage it.",
  },
  UPLOAD_FAILED: {
    zh: "插件包上传失败。",
    en: "Plugin package upload failed.",
  },
  NAME_REQUIRED: {
    zh: "必须填写令牌名称。",
    en: "Token name is required.",
  },
  TOKEN_NOT_FOUND: {
    zh: "未找到该令牌。",
    en: "Token not found.",
  },
  VERSION_NOT_FOUND: (vars) => ({
    zh: `未找到版本 ${String(vars?.slug ?? "")}@${String(vars?.version ?? "")}。`,
    en: `No version found for ${String(vars?.slug ?? "")}@${String(vars?.version ?? "")}.`,
  }),
  BUNDLE_NOT_FOUND: (vars) => ({
    zh: `未找到插件包 ${String(vars?.slug ?? "")}@${String(vars?.version ?? "")}。`,
    en: `No bundle found for ${String(vars?.slug ?? "")}@${String(vars?.version ?? "")}.`,
  }),
  VERIFICATION_PROFILE_MISSING: {
    zh: "当前插件版本未声明 verificationProfile。",
    en: "This plugin version does not declare a verificationProfile.",
  },
  VERIFICATION_REQUIRED: {
    zh: "该版本必须先通过验证，才能提交审核。",
    en: "This version must pass verification before it can be submitted for review.",
  },
  INVALID_TRANSITION: {
    zh: "当前状态不允许执行该操作。",
    en: "This action is not allowed in the current state.",
  },
  SIGNING_KEY_ROTATION_FAILED: {
    zh: "签名密钥轮换失败。",
    en: "Signing key rotation failed.",
  },
  PLUGIN_NOT_FOUND: (vars) => ({
    zh: `未找到 slug 为 ${String(vars?.slug ?? "")} 的插件。`,
    en: `No plugin found with slug ${String(vars?.slug ?? "")}.`,
  }),
  PLUGIN_IS_FREE: {
    zh: "该插件为免费插件，无需创建订单。",
    en: "This plugin is free and does not require an order.",
  },
  PLUGIN_PRICING_INCOMPLETE: {
    zh: "该收费插件的计费计划、金额或币种尚未配置完整。",
    en: "This paid plugin does not have a complete billing configuration yet.",
  },
  INVALID_BODY: {
    zh: "请求体必须是合法 JSON。",
    en: "The request body must be valid JSON.",
  },
  MISSING_INSTANCE_ID: {
    zh: "必须提供 instanceId。",
    en: "instanceId is required.",
  },
  ORDER_NOT_FOUND: (vars) => ({
    zh: `未找到订单 ${String(vars?.orderId ?? "")}。`,
    en: `No order found with id ${String(vars?.orderId ?? "")}.`,
  }),
  LICENSE_NOT_FOUND: (vars) => ({
    zh: `未找到授权 ${String(vars?.id ?? "")}。`,
    en: `No license found with id ${String(vars?.id ?? "")}.`,
  }),
  TAKEDOWN_DEFAULT_REASON: {
    zh: "管理员执行紧急下架。",
    en: "Emergency take-down by admin.",
  },
  TAKEDOWN_SUCCESS: (vars) => ({
    zh: `插件 ${String(vars?.slug ?? "")} 已下架。`,
    en: `Plugin ${String(vars?.slug ?? "")} has been taken down.`,
  }),
  REASON_REQUIRED: {
    zh: "必须填写原因。",
    en: "A reason is required.",
  },
  ALREADY_REVOKED: {
    zh: "该授权已经被吊销。",
    en: "This license has already been revoked.",
  },
  LICENSE_KEY_REQUIRED: {
    zh: "必须提供 licenseKey。",
    en: "licenseKey is required.",
  },
};

export function resolveRequestLocale(request: Request | Headers): Locale {
  const headers = request instanceof Headers ? request : request.headers;
  const cookie = headers.get("cookie") ?? "";
  const cookieMatch = cookie.match(/(?:^|;\s*)nvreg_locale=(zh|en)(?:;|$)/);
  if (cookieMatch?.[1] === "en") {
    return "en";
  }
  if (cookieMatch?.[1] === "zh") {
    return "zh";
  }

  const language = headers.get("accept-language")?.toLowerCase() ?? "";
  return language.includes("zh") ? "zh" : "en";
}

export function resolveApiMessage(
  locale: Locale,
  code: string,
  vars?: Record<string, string | number | null | undefined>,
) {
  const entry = dictionary[code];
  if (!entry) {
    return code;
  }

  const message = typeof entry === "function" ? entry(vars) : entry;
  return message[locale];
}

export function apiError(
  request: Request | Headers,
  code: string,
  status: number,
  vars?: Record<string, string | number | null | undefined>,
  extra?: Record<string, unknown>,
) {
  const locale = resolveRequestLocale(request);
  return NextResponse.json(
    {
      error: code,
      message: resolveApiMessage(locale, code, vars),
      ...(extra ?? {}),
    },
    { status },
  );
}
