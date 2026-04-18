import Link from "next/link";
import {
  AdminPageHeader,
  FlashMessage,
  buttonClass,
  inputClass,
  panelClass,
} from "@/app/admin/ui";
import {
  dismissMerchantCredentialRevealAction,
  revealMerchantApiCredentialSecretAction,
  runMerchantCheckoutSmokeTestAction,
} from "@/app/merchant/actions";
import {
  CopyFieldList,
  CopyTextBlock,
  type CopyFieldItem,
} from "@/app/merchant/copy-field-list";
import { loadMerchantDashboardData } from "@/app/merchant/(console)/dashboard-data";
import type { SearchParamsInput } from "@/app/admin/support";
import { getCurrentLocale } from "@/lib/i18n-server";
import { maskStoredSecret } from "@/lib/secret-box";

function formatConfigLine(label: string, fieldName: string, value?: string | null) {
  const normalized = (value ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/\r/g, "")
    .replace(/\n/g, "\\n")
    .replace(/"/g, '\\"');

  return `${label} (${fieldName}): "${normalized}"`;
}

function hasValue(value?: string | null) {
  return Boolean(value?.trim());
}

export default async function MerchantIntegrationPage({
  searchParams,
}: {
  searchParams?: SearchParamsInput;
}) {
  const locale = await getCurrentLocale();
  const {
    messages,
    merchantDisplayName,
    credentialReveal,
    merchant,
    preferredCredential,
    publicBaseUrl,
    recommendedNoveShopChannelCode,
    canManageCredentials,
    canReadChannels,
    canReadOrders,
    canReadRefunds,
    checkoutTestChannels,
  } = await loadMerchantDashboardData(searchParams, { locale });

  const content =
    locale === "en"
      ? {
          eyebrow: "Merchant Integration",
          description:
            "Copy the NovaPay fields required by the NoveShop merchant backend from here. This page focuses only on integration handoff, so merchants do not need to search across unrelated settings.",
          integrationTitle: "NoveShop essentials",
          integrationDescription:
            "If you are only connecting NovaPay to NoveShop, start with the four fields below. Advanced endpoints and optional callback parameters are collapsed further down.",
          configBlockTitle: "Ready-to-copy NoveShop merchant profile",
          configBlockDesc:
            "This block matches the NovaPay payment profile form in NoveShop. It is intended for manual configuration in the merchant backend, not environment variables.",
          configBlockSecretReadyHint:
            "The API Secret field is included because the one-time Secret is still visible in this secure session.",
          configBlockSecretPendingHint:
            "The API Secret field is blank because NovaPay does not re-display old Secrets. Create a dedicated credential before going live.",
          configBlockNotifyConfiguredHint:
            "The callback verify secret is intentionally left blank. Rotate it in NovaPay first if NoveShop needs callback signature verification.",
          configBlockChannelPendingHint:
            "The default channel field is blank because no enabled merchant payment channel is available yet.",
          merchantCodeLabel: "Merchant Code (merchantCode)",
          apiKeyLabel: "API Key (apiKey)",
          apiKeyHintActive:
            "Use the current active NovaPay credential keyId as the NoveShop API Key.",
          apiKeyHintPending:
            "Create an active API credential first, then copy its keyId here.",
          apiSecretLabel: "API Secret (apiSecret)",
          apiSecretHintActive:
            "The current API Secret is still in its one-time display window and can be copied directly into NoveShop now.",
          apiSecretHintPending:
            "Full API Secret is not displayed permanently. Create a dedicated API credential and copy the Secret during creation.",
          defaultChannelCodeLabel: "Default Channel (defaultChannelCode)",
          defaultChannelCodeHintActive:
            "This is the recommended default channel based on the currently enabled NovaPay route.",
          defaultChannelCodeHintPending:
            "No enabled channel is available yet. Enable at least one merchant-owned payment channel first.",
          notifySecretLabel: "Callback Verify Secret (notifySecret, optional)",
          notifySecretHintConfigured:
            "Optional. NovaPay already has a callback signing secret configured, but the full value is not re-displayed for security.",
          baseUrlLabel: "Public Base URL",
          docsUrlLabel: "API Docs URL",
          createOrderUrlLabel: "Create Order URL",
          queryOrderUrlLabel: "Query Order URL",
          closeOrderUrlLabel: "Close Order URL",
          createRefundUrlLabel: "Create Refund URL",
          queryRefundUrlLabel: "Query Refund URL",
          signatureHeadersLabel: "Required Signature Headers",
          signatureHeadersHint:
            "Merchant signed requests must include these four headers on every call.",
          idempotencyHeaderLabel: "Recommended Idempotency Header",
          idempotencyHeaderHint:
            "Use this on create order, close order, and create refund requests.",
          callbackUrlLabel: "Default Business Callback URL (Optional)",
          callbackUrlHintConfigured:
            "NovaPay will deliver merchant-side business notifications to this endpoint.",
          callbackUrlHintEmpty:
            "Not configured. This does not affect basic payment collection. Configure it later only when your own backend needs asynchronous notifications.",
          callbackUrlExample:
            "Example: https://merchant.example.com/api/payments/novapay/callback",
          callbackUrlEmptyValue: "Not configured. Basic payment collection is unaffected.",
          essentialsTitle: "Only these 4 fields are needed first",
          essentialsDesc:
            "Most merchants can finish the initial NoveShop setup with just these values. Optional callback secrets and raw API endpoints can stay collapsed until needed.",
          essentialsHint:
            "If API Secret is blank, verify the current merchant password below and then copy it immediately.",
          advancedTitle: "Advanced integration details",
          advancedDesc:
            "Open this only when your implementation team needs direct NovaPay API endpoints, signature headers, or callback-related settings.",
          advancedSummary: "Show advanced parameters",
          profile: "Merchant Profile",
          credentials: "API Credentials",
          channels: "Channels",
          orders: "Orders",
          refunds: "Refunds",
          docs: "API Docs",
          smokeTest: "Run Payment Test",
          smokeTestAlipay: "Test Alipay",
          smokeTestWxpay: "Test WeChat Pay",
          secretUnlockTitle: "Reveal full API Secret",
          secretUnlockDesc:
            "For security, the full API Secret is hidden by default. Enter the current merchant login password to reveal it in this short secure session.",
          secretUnlockReadyDesc:
            "Password verification has completed. The full API Secret is currently visible on this page and can be copied into NoveShop.",
          secretUnlockNoCredential:
            "No usable API credential is available yet. Create a dedicated credential first before revealing the full Secret.",
          secretUnlockNoPermission:
            "This role cannot reveal the full API Secret. Use a merchant account with credential-management permission instead.",
          currentPasswordLabel: "Current Merchant Password",
          currentPasswordPlaceholder: "Enter current login password",
          revealSecretButton: "Verify and Reveal",
          hideSecretButton: "Hide Secret",
          currentCredentialLabel: "Current Credential",
          secretActionTitle: "API Secret",
          secretActionReady: "The full API Secret is visible in this card and can be copied now.",
          secretActionPrompt:
            "The full API Secret is hidden by default. Verify the current merchant password here when you need to fill NoveShop.",
        }
      : {
          eyebrow: "接入参数",
          description:
            "这里专门用于整理 NoveShop 商户后台要填写的 NovaPay 接入参数。商户只需要在这一页复制字段，不必在总览里来回查找。",
          integrationTitle: "NoveShop 必填参数",
          integrationDescription:
            "如果你只是把 NovaPay 接到 NoveShop，先看下面这 4 个字段就够了。其余接口地址和可选参数已收进下方折叠区。",
          configBlockTitle: "可直接复制的 NoveShop 商户后台配置",
          configBlockDesc:
            "这段内容对应 NoveShop 商户后台里的 NovaPay 收款配置表单，用于人工填写或转交配置，不是环境变量。",
          configBlockSecretReadyHint:
            "当前配置块已包含本次一次性展示的 API Secret，请立即复制并保存到 NoveShop。",
          configBlockSecretPendingHint:
            "当前配置块中的 API Secret 为空，因为历史 Secret 不会再次展示。上线前请新建一组专用 API 凭证并替换这里的值。",
          configBlockNotifyConfiguredHint:
            "回调验签密钥会保持留空。现有业务回调验签密钥不会再次明文回显；如需给 NoveShop 验签，请先在 NovaPay 中重新设置。",
          configBlockChannelPendingHint:
            "当前还没有已启用的支付通道实例，因此默认通道暂时为空。",
          merchantCodeLabel: "商户号（merchantCode）",
          apiKeyLabel: "API Key（apiKey）",
          apiKeyHintActive:
            "这里直接对应 NoveShop 里的 API Key，使用当前可用凭证的 Key ID 即可。",
          apiKeyHintPending:
            "当前还没有可用 API 凭证，请先生成后再复制到 NoveShop。",
          apiSecretLabel: "API Secret（apiSecret）",
          apiSecretHintActive:
            "当前这组 API Secret 仍处于一次性展示窗口，可以直接复制填写到 NoveShop。",
          apiSecretHintPending:
            "完整 API Secret 不会长期显示。如需给 NoveShop 填写，请新建一组专用 API 凭证，系统会立即展示一次 Secret。",
          defaultChannelCodeLabel: "默认通道（defaultChannelCode）",
          defaultChannelCodeHintActive:
            "这里给出当前推荐的默认通道编码，可直接填写到 NoveShop。",
          defaultChannelCodeHintPending:
            "当前还没有已启用的支付通道实例，请先在 NovaPay 启用至少一个通道。",
          notifySecretLabel: "回调验签密钥（notifySecret，可选）",
          notifySecretHintConfigured:
            "可选项。NovaPay 当前已配置业务回调验签密钥，但出于安全原因不会长期回显完整值。",
          baseUrlLabel: "公共接入域名",
          docsUrlLabel: "API 文档地址",
          createOrderUrlLabel: "下单地址",
          queryOrderUrlLabel: "查单地址",
          closeOrderUrlLabel: "关单地址",
          createRefundUrlLabel: "退款地址",
          queryRefundUrlLabel: "退款查询地址",
          signatureHeadersLabel: "必填签名头",
          signatureHeadersHint:
            "商户所有签名请求都必须携带这四个请求头。",
          idempotencyHeaderLabel: "推荐幂等头",
          idempotencyHeaderHint:
            "建议在下单、关单、退款等写接口上同时携带。",
          callbackUrlLabel: "默认业务回调地址（可选）",
          callbackUrlHintConfigured:
            "NovaPay 会把支付、退款等商户业务通知投递到这个地址。",
          callbackUrlHintEmpty:
            "当前未配置，不影响基础收款。只有你的业务系统需要异步接收通知时，才需要后续补充。",
          callbackUrlExample:
            "示例：https://merchant.example.com/api/payments/novapay/callback",
          callbackUrlEmptyValue: "未配置，不影响基础收款",
          essentialsTitle: "先填写这 4 个字段即可",
          essentialsDesc:
            "大多数商户在 NoveShop 首次接入时，只需要先复制下面这几项。回调验签、原始接口地址等高级参数可以后面再看。",
          essentialsHint:
            "如果 API Secret 还是空白，请先在下方验证当前商户密码，显示后立即复制。",
          advancedTitle: "高级接入参数",
          advancedDesc:
            "只有在实施人员需要直接对接 NovaPay API、查看签名头或配置回调相关参数时，再展开这里。",
          advancedSummary: "展开高级参数",
          profile: "商户配置",
          credentials: "API 凭证",
          channels: "支付通道",
          orders: "订单列表",
          refunds: "退款管理",
          docs: "API 文档",
          smokeTest: "支付测试",
          smokeTestAlipay: "支付宝测试",
          smokeTestWxpay: "微信支付测试",
          secretUnlockTitle: "显示完整 API Secret",
          secretUnlockDesc:
            "出于安全考虑，完整 API Secret 默认不直接显示。请输入当前商户登录密码，验证通过后才会在当前安全窗口内显示。",
          secretUnlockReadyDesc:
            "当前已完成密码验证，完整 API Secret 已在本页显示，可直接复制到 NoveShop 商户后台。",
          secretUnlockNoCredential:
            "当前还没有可用 API 凭证，请先创建一组专用凭证，再显示完整 Secret。",
          secretUnlockNoPermission:
            "当前角色不能显示完整 API Secret，请使用具备凭证管理权限的商户账号操作。",
          currentPasswordLabel: "当前商户登录密码",
          currentPasswordPlaceholder: "请输入当前登录密码",
          revealSecretButton: "验证并显示",
          hideSecretButton: "隐藏 Secret",
          currentCredentialLabel: "当前凭证",
          secretActionTitle: "API Secret",
          secretActionReady: "完整 API Secret 已在当前卡片中显示，现在可以直接复制。",
          secretActionPrompt:
            "完整 API Secret 默认隐藏。如需填写 NoveShop，请直接在这里验证当前商户密码后显示。",
        };

  const actionButtonClass = `${buttonClass} w-full sm:w-auto`;
  const darkSubtleButtonClass =
    "inline-flex items-center justify-center rounded-2xl border border-white/15 bg-white/10 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-white/15";
  const revealMatchesPreferredCredential = Boolean(
    credentialReveal?.secret &&
      preferredCredential &&
      ((credentialReveal.credentialId &&
        credentialReveal.credentialId === preferredCredential.id) ||
        credentialReveal.keyId === preferredCredential.keyId),
  );
  const currentCredentialKeyId = revealMatchesPreferredCredential
    ? credentialReveal?.keyId ?? preferredCredential?.keyId ?? ""
    : preferredCredential?.keyId ?? "";
  const revealedSecret = revealMatchesPreferredCredential
    ? credentialReveal?.secret ?? ""
    : "";
  const essentialCopyItems: CopyFieldItem[] = [
    {
      id: "merchant-code",
      label: content.merchantCodeLabel,
      value: merchant.code,
    },
    {
      id: "noveshop-api-key",
      label: content.apiKeyLabel,
      value: currentCredentialKeyId,
      hint:
        currentCredentialKeyId
          ? content.apiKeyHintActive
          : content.apiKeyHintPending,
    },
    {
      id: "noveshop-api-secret",
      label: content.apiSecretLabel,
      value: revealedSecret,
      hint: revealedSecret
        ? content.apiSecretHintActive
        : content.apiSecretHintPending,
      secret: Boolean(revealedSecret),
      multiline: true,
      wide: true,
    },
    {
      id: "noveshop-default-channel-code",
      label: content.defaultChannelCodeLabel,
      value: recommendedNoveShopChannelCode,
      hint: recommendedNoveShopChannelCode
        ? content.defaultChannelCodeHintActive
        : content.defaultChannelCodeHintPending,
    },
  ];
  const advancedCopyItems: CopyFieldItem[] = [
    {
      id: "noveshop-notify-secret",
      label: content.notifySecretLabel,
      value: merchant.notifySecret ? maskStoredSecret(merchant.notifySecret) ?? "" : "",
      hint: merchant.notifySecret ? content.notifySecretHintConfigured : undefined,
    },
    {
      id: "base-url",
      label: content.baseUrlLabel,
      value: publicBaseUrl,
    },
    {
      id: "docs-url",
      label: content.docsUrlLabel,
      value: `${publicBaseUrl}/docs`,
    },
    {
      id: "create-order-url",
      label: content.createOrderUrlLabel,
      value: `${publicBaseUrl}/api/payment-orders`,
    },
    {
      id: "query-order-url",
      label: content.queryOrderUrlLabel,
      value: `${publicBaseUrl}/api/payment-orders/{orderReference}`,
    },
    {
      id: "close-order-url",
      label: content.closeOrderUrlLabel,
      value: `${publicBaseUrl}/api/payment-orders/{orderReference}/close`,
    },
    {
      id: "create-refund-url",
      label: content.createRefundUrlLabel,
      value: `${publicBaseUrl}/api/payment-orders/{orderReference}/refunds`,
    },
    {
      id: "query-refund-url",
      label: content.queryRefundUrlLabel,
      value: `${publicBaseUrl}/api/payment-refunds/{refundReference}`,
    },
    {
      id: "signature-headers",
      label: content.signatureHeadersLabel,
      value: "x-novapay-key\nx-novapay-timestamp\nx-novapay-nonce\nx-novapay-signature",
      hint: content.signatureHeadersHint,
      multiline: true,
    },
    {
      id: "idempotency-header",
      label: content.idempotencyHeaderLabel,
      value: "Idempotency-Key",
      hint: content.idempotencyHeaderHint,
    },
    {
      id: "callback-url",
      label: content.callbackUrlLabel,
      value: merchant.callbackBase ?? "",
      hint: merchant.callbackBase
        ? `${content.callbackUrlHintConfigured} ${content.callbackUrlExample}`
        : `${content.callbackUrlHintEmpty} ${content.callbackUrlExample}`,
      emptyValueLabel: content.callbackUrlEmptyValue,
      wide: true,
    },
  ].filter((item) => hasValue(item.value) || item.id === "callback-url");
  const essentialCopyAllValue = essentialCopyItems
    .filter((item) => hasValue(item.value))
    .map((item) => `${item.label}${locale === "en" ? ": " : "："}${item.value?.trim()}`)
    .join("\n\n");
  const advancedCopyAllValue = advancedCopyItems
    .filter((item) => hasValue(item.value))
    .map((item) => `${item.label}${locale === "en" ? ": " : "："}${item.value?.trim()}`)
    .join("\n\n");
  const noveShopConfigValue = [
    formatConfigLine(
      locale === "en" ? "Merchant Code" : "商户号",
      "merchantCode",
      merchant.code,
    ),
    formatConfigLine(
      locale === "en" ? "Default Channel" : "默认通道",
      "defaultChannelCode",
      recommendedNoveShopChannelCode,
    ),
    formatConfigLine(
      locale === "en" ? "API Key" : "API Key",
      "apiKey",
      currentCredentialKeyId,
    ),
    formatConfigLine(
      locale === "en" ? "API Secret" : "API Secret",
      "apiSecret",
      revealedSecret,
    ),
  ].join("\n");
  const noveShopConfigHints = [
    content.essentialsHint,
    revealedSecret
      ? content.configBlockSecretReadyHint
      : content.configBlockSecretPendingHint,
    recommendedNoveShopChannelCode ? null : content.configBlockChannelPendingHint,
  ].filter((hint): hint is string => Boolean(hint));
  const advancedConfigHints = [
    merchant.notifySecret ? content.configBlockNotifyConfiguredHint : null,
  ].filter((hint): hint is string => Boolean(hint));
  function getCheckoutLabel(channelCode: string) {
    return channelCode === "wxpay.native"
      ? content.smokeTestWxpay
      : content.smokeTestAlipay;
  }

  return (
    <div className="space-y-8">
      <AdminPageHeader
        eyebrow={content.eyebrow}
        title={merchantDisplayName}
        description={content.description}
        actions={
          <div className="grid w-full gap-3 sm:flex sm:flex-wrap sm:justify-end">
            {checkoutTestChannels.length > 0 ? (
              checkoutTestChannels.map((channel) => (
                <form key={channel.code} action={runMerchantCheckoutSmokeTestAction}>
                  <input type="hidden" name="channelCode" value={channel.code} />
                  <button type="submit" className={actionButtonClass}>
                    {getCheckoutLabel(channel.code)}
                  </button>
                </form>
              ))
            ) : (
              <form action={runMerchantCheckoutSmokeTestAction}>
                <button type="submit" className={actionButtonClass}>
                  {content.smokeTest}
                </button>
              </form>
            )}
            <Link href="/merchant/credentials" className={actionButtonClass}>
              {content.credentials}
            </Link>
            <Link href="/merchant/profile" className={actionButtonClass}>
              {content.profile}
            </Link>
            {canReadChannels ? (
              <Link href="/merchant/channels" className={actionButtonClass}>
                {content.channels}
              </Link>
            ) : null}
            {canReadOrders ? (
              <Link href="/merchant/orders" className={actionButtonClass}>
                {content.orders}
              </Link>
            ) : null}
            {canReadRefunds ? (
              <Link href="/merchant/refunds" className={actionButtonClass}>
                {content.refunds}
              </Link>
            ) : null}
            <Link href="/docs" className={actionButtonClass}>
              {content.docs}
            </Link>
          </div>
        }
      />

      <FlashMessage success={messages.success} error={messages.error} />

      <section id="merchant-integration-copy" className={`${panelClass} p-5 sm:p-6`}>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.22em] text-muted">
              {content.eyebrow}
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-foreground">
              {content.integrationTitle}
            </h2>
          </div>
          <p className="max-w-3xl text-sm leading-7 text-muted">
            {content.integrationDescription}
          </p>
        </div>

        <div className="mt-6 space-y-6">
          <CopyTextBlock
            locale={locale}
            title={content.essentialsTitle}
            description={content.essentialsDesc}
            value={noveShopConfigValue}
            hints={noveShopConfigHints}
            secret={Boolean(revealedSecret)}
            footer={
              !preferredCredential ? (
                <div className="text-sm leading-7 text-muted">
                  {content.secretUnlockNoCredential}
                </div>
              ) : !canManageCredentials ? (
                <div className="text-sm leading-7 text-[#8a4d18]">
                  {content.secretUnlockNoPermission}
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <p
                        className={`text-xs uppercase tracking-[0.18em] ${
                          revealedSecret ? "text-[#d8c3ae]" : "text-muted"
                        }`}
                      >
                        {content.secretActionTitle}
                      </p>
                      <p
                        className={`mt-2 text-sm leading-7 ${
                          revealedSecret ? "text-[#d8c3ae]" : "text-muted"
                        }`}
                      >
                        {revealedSecret
                          ? content.secretActionReady
                          : content.secretActionPrompt}
                      </p>
                      <p
                        className={`mt-2 text-xs leading-6 ${
                          revealedSecret ? "text-[#d8c3ae]" : "text-muted"
                        }`}
                      >
                        {content.currentCredentialLabel}
                        {locale === "en" ? ": " : "："}
                        <span className="font-mono">{preferredCredential.keyId}</span>
                      </p>
                    </div>
                    {revealedSecret ? (
                      <form action={dismissMerchantCredentialRevealAction}>
                        <input type="hidden" name="redirectTo" value="/merchant/integration" />
                        <button type="submit" className={darkSubtleButtonClass}>
                          {content.hideSecretButton}
                        </button>
                      </form>
                    ) : null}
                  </div>
                  {!revealedSecret ? (
                    <form
                      action={revealMerchantApiCredentialSecretAction}
                      className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end"
                    >
                      <input type="hidden" name="credentialId" value={preferredCredential.id} />
                      <input type="hidden" name="redirectTo" value="/merchant/integration" />
                      <label className="block space-y-2">
                        <span
                          className={`text-sm font-medium ${
                            revealedSecret ? "text-white" : "text-foreground"
                          }`}
                        >
                          {content.currentPasswordLabel}
                        </span>
                        <input
                          name="currentPassword"
                          type="password"
                          autoComplete="current-password"
                          placeholder={content.currentPasswordPlaceholder}
                          className={inputClass}
                        />
                      </label>
                      <div className="sm:self-end">
                        <button type="submit" className={actionButtonClass}>
                          {content.revealSecretButton}
                        </button>
                      </div>
                    </form>
                  ) : null}
                </div>
              )
            }
          />

          <CopyFieldList
            locale={locale}
            items={essentialCopyItems}
            copyAllValue={essentialCopyAllValue}
          />

          {advancedCopyItems.length > 0 ? (
            <details className="rounded-[1.35rem] border border-line bg-white/80">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 text-left">
                <div>
                  <p className="text-xs uppercase tracking-[0.18em] text-muted">
                    {content.advancedTitle}
                  </p>
                  <p className="mt-2 text-sm leading-7 text-muted">
                    {content.advancedDesc}
                  </p>
                </div>
                <span className="shrink-0 text-sm font-medium text-foreground">
                  {content.advancedSummary}
                </span>
              </summary>
              <div className="border-t border-line px-5 py-5">
                <CopyFieldList
                  locale={locale}
                  items={advancedCopyItems}
                  copyAllValue={advancedCopyAllValue}
                />
                {advancedConfigHints.length > 0 ? (
                  <div className="mt-4 space-y-2">
                    {advancedConfigHints.map((hint) => (
                      <p key={hint} className="text-xs leading-6 text-muted">
                        {hint}
                      </p>
                    ))}
                  </div>
                ) : null}
              </div>
            </details>
          ) : null}
        </div>
      </section>
    </div>
  );
}
