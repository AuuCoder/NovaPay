import Link from "next/link";
import type { SearchParamsInput } from "@/app/admin/support";
import { formatDateTime } from "@/app/admin/support";
import {
  AdminPageHeader,
  FlashMessage,
  LabeledField,
  StatusBadge,
  buttonClass,
  inputClass,
  panelClass,
  subtleButtonClass,
} from "@/app/admin/ui";
import {
  createMerchantSelfServiceApiCredentialAction,
  dismissMerchantCredentialRevealAction,
  revealMerchantApiCredentialSecretAction,
  updateMerchantSelfServiceApiCredentialAction,
} from "@/app/merchant/actions";
import {
  CopyFieldList,
  type CopyFieldItem,
} from "@/app/merchant/copy-field-list";
import { loadMerchantDashboardData } from "@/app/merchant/(console)/dashboard-data";
import { getCurrentLocale } from "@/lib/i18n-server";

export default async function MerchantCredentialsPage({
  searchParams,
}: {
  searchParams?: SearchParamsInput;
}) {
  const locale = await getCurrentLocale();
  const {
    messages,
    credentialReveal,
    merchantDisplayName,
    merchant,
    canManageCredentials,
    canReadChannels,
    canReadOrders,
    canReadRefunds,
  } = await loadMerchantDashboardData(searchParams, { locale });

  const content =
    locale === "en"
      ? {
          eyebrow: "API Credentials",
          description:
            "Manage merchant API credentials here. Production order requests must use dedicated credentials and keep the full Secret only in your secure server environment.",
          integration: "Integration",
          profile: "Merchant Profile",
          channels: "Channels",
          orders: "Orders",
          refunds: "Refunds",
          docs: "API Docs",
          credentialRevealTitle: "Save this API credential now",
          credentialRevealBootstrapDesc:
            "NovaPay generated the first API credential automatically during registration. The Secret is shown only within this short secure session window.",
          credentialRevealManualDesc:
            "The new API credential is ready. Save the Secret now and use it only in your server-side integration.",
          credentialRevealKeyId: "Key ID",
          credentialRevealSecret: "Secret",
          credentialRevealHint:
            "Store it in a secure secret manager. After this window closes, only the masked preview remains in the console.",
          credentialRevealDismiss: "I have saved it",
          credentialsEyebrow: "API Credentials",
          credentialsTitle: "Merchant API credentials",
          credentialsDesc:
            "Every signed merchant request must include `x-novapay-key`, `x-novapay-timestamp`, `x-novapay-nonce`, and `x-novapay-signature`.",
          createCredentialTitle: "Create API credential",
          noCredentialPermission:
            "This role does not have permission to manage API credentials.",
          credentialLabel: "Credential Label",
          credentialLabelPlaceholder: "Production / ERP / Test",
          expiresAtLabel: "Expires At",
          createCredentialButton: "Generate Credential",
          noCredentials:
            "No dedicated API credential exists yet. Create at least one credential before enabling server-side order creation.",
          secretPreview: "Secret Preview",
          credentialKeyIdHint:
            "Copy this keyId directly into your server-side integration. The full Secret is only shown once at creation time.",
          credentialToggleLabel: "Enable credential",
          credentialCreatedAt: "Created",
          credentialLastUsedAt: "Last Used",
          credentialExpiresAt: "Expires",
          saveCredential: "Save Credential Status",
          revealSecretTitle: "Reveal full API Secret",
          revealSecretDesc:
            "For security, the full API Secret is hidden by default. Enter the current merchant login password to reveal it only in this short secure session.",
          revealSecretReadyDesc:
            "Password verification has completed. The full API Secret is now visible for this credential and can be copied immediately.",
          revealSecretNoPermission:
            "This role cannot reveal the full API Secret. Use a merchant account with credential-management permission instead.",
          currentPasswordLabel: "Current Merchant Password",
          currentPasswordPlaceholder: "Enter current login password",
          revealSecretButton: "Verify and Reveal",
          hideSecretButton: "Hide Secret",
          integrationCardTitle: "Need to fill NoveShop next?",
          integrationCardDesc:
            "After a credential is created, go to the integration page to copy the merchant backend fields required by NoveShop.",
          integrationCardCta: "Open Integration Page",
        }
      : {
          eyebrow: "API 凭证",
          description:
            "这里统一管理商户 API 凭证。正式环境下，所有服务端签名请求都应使用独立凭证，并把完整 Secret 保存在你的服务端密钥系统中。",
          integration: "接入参数",
          profile: "商户配置",
          channels: "支付通道",
          orders: "订单列表",
          refunds: "退款管理",
          docs: "API 文档",
          credentialRevealTitle: "请立即保存这组 API 凭证",
          credentialRevealBootstrapDesc:
            "系统已在注册时自动生成首个 API 凭证。Secret 只会在当前这段安全展示窗口内显示一次。",
          credentialRevealManualDesc:
            "新的 API 凭证已经生成。请立即保存 Secret，并仅交给服务端接入使用。",
          credentialRevealKeyId: "Key ID",
          credentialRevealSecret: "Secret",
          credentialRevealHint:
            "建议立即保存到企业密钥管理系统。当前窗口结束后，后台只会保留脱敏预览，不再显示完整 Secret。",
          credentialRevealDismiss: "我已保存",
          credentialsEyebrow: "API 凭证",
          credentialsTitle: "商户 API 凭证",
          credentialsDesc:
            "正式环境下，所有签名请求都必须携带 `x-novapay-key`、`x-novapay-timestamp`、`x-novapay-nonce`、`x-novapay-signature` 四个请求头。",
          createCredentialTitle: "新增 API 凭证",
          noCredentialPermission: "当前角色没有管理 API 凭证的权限。",
          credentialLabel: "凭证标签",
          credentialLabelPlaceholder: "Production / ERP / Test",
          expiresAtLabel: "过期时间",
          createCredentialButton: "生成凭证",
          noCredentials:
            "当前还没有独立 API 凭证。建议至少创建一组凭证后，再开始服务端正式下单联调。",
          secretPreview: "Secret 预览",
          credentialKeyIdHint:
            "这里可以直接复制 keyId 给服务端接入使用；完整 Secret 仍只会在创建当次展示一次。",
          credentialToggleLabel: "启用凭证",
          credentialCreatedAt: "创建于",
          credentialLastUsedAt: "最近使用",
          credentialExpiresAt: "到期",
          saveCredential: "保存凭证状态",
          revealSecretTitle: "显示完整 API Secret",
          revealSecretDesc:
            "出于安全考虑，完整 API Secret 默认不直接显示。请输入当前商户登录密码，验证通过后才会在当前安全窗口内短时显示。",
          revealSecretReadyDesc:
            "当前已完成密码验证，这张凭证的完整 API Secret 已显示，可立即复制并保存到你的服务端密钥系统中。",
          revealSecretNoPermission:
            "当前角色不能显示完整 API Secret，请使用具备凭证管理权限的商户账号操作。",
          currentPasswordLabel: "当前商户登录密码",
          currentPasswordPlaceholder: "请输入当前登录密码",
          revealSecretButton: "验证并显示",
          hideSecretButton: "隐藏 Secret",
          integrationCardTitle: "下一步要去配置 NoveShop？",
          integrationCardDesc:
            "新建凭证后，可直接前往接入参数页复制 NoveShop 商户后台所需字段。",
          integrationCardCta: "前往接入参数页",
        };

  const actionButtonClass = `${buttonClass} w-full sm:w-auto`;
  const activeCredentialReveal =
    credentialReveal && credentialReveal.source !== "reauth" ? credentialReveal : null;
  const revealCopyItems: CopyFieldItem[] = [
    {
      id: "credential-reveal-key-id",
      label: content.credentialRevealKeyId,
      value: activeCredentialReveal?.keyId ?? "",
    },
    {
      id: "credential-reveal-secret",
      label: content.credentialRevealSecret,
      value: activeCredentialReveal?.secret ?? "",
      secret: true,
      multiline: true,
    },
  ];
  const revealCopyAllValue = revealCopyItems
    .filter((item) => item.value?.trim())
    .map((item) => `${item.label}${locale === "en" ? ": " : "："}${item.value?.trim()}`)
    .join("\n\n");

  return (
    <div className="space-y-8">
      <AdminPageHeader
        eyebrow={content.eyebrow}
        title={merchantDisplayName}
        description={content.description}
        actions={
          <div className="grid w-full gap-3 sm:flex sm:flex-wrap sm:justify-end">
            <Link href="/merchant/integration" className={actionButtonClass}>
              {content.integration}
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

      {activeCredentialReveal ? (
        <section className="rounded-[1.75rem] border border-[#c9dfd5] bg-[linear-gradient(135deg,#f3fbf7_0%,#eef7ff_100%)] p-5 shadow-[0_18px_50px_rgba(29,87,70,0.08)] sm:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-3xl">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#1d5746]">
                {content.credentialRevealTitle}
              </p>
              <p className="mt-3 text-sm leading-7 text-[#335f52]">
                {activeCredentialReveal.source === "bootstrap"
                  ? content.credentialRevealBootstrapDesc
                  : content.credentialRevealManualDesc}
              </p>
              <p className="mt-2 text-xs leading-6 text-[#4b6d62]">
                {content.credentialRevealHint}
              </p>
            </div>
            <form action={dismissMerchantCredentialRevealAction}>
              <input type="hidden" name="redirectTo" value="/merchant/credentials" />
              <button type="submit" className={subtleButtonClass}>
                {content.credentialRevealDismiss}
              </button>
            </form>
          </div>
          <div className="mt-5">
            <CopyFieldList
              locale={locale}
              items={revealCopyItems}
              copyAllValue={revealCopyAllValue}
            />
          </div>
        </section>
      ) : null}

      <section id="merchant-api-credentials" className={`${panelClass} min-w-0 p-5 sm:p-6`}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.22em] text-muted">
              {content.credentialsEyebrow}
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-foreground">
              {content.credentialsTitle}
            </h2>
          </div>
          <p className="max-w-2xl text-sm leading-7 text-muted">
            {content.credentialsDesc}
          </p>
        </div>

        <div className="mt-6 grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
          <form
            action={createMerchantSelfServiceApiCredentialAction}
            className="rounded-[1.5rem] border border-line bg-white/75 p-5"
          >
            <input type="hidden" name="redirectTo" value="/merchant/credentials" />
            <h3 className="text-lg font-semibold text-foreground">
              {content.createCredentialTitle}
            </h3>
            {!canManageCredentials ? (
              <p className="mt-3 rounded-[1rem] border border-[#f3d1ab] bg-[#fff4e7] px-4 py-3 text-sm text-[#8a4d18]">
                {content.noCredentialPermission}
              </p>
            ) : null}
            <div className="mt-4 grid gap-4">
              <LabeledField label={content.credentialLabel}>
                <input
                  name="label"
                  placeholder={content.credentialLabelPlaceholder}
                  className={inputClass}
                />
              </LabeledField>
              <LabeledField label={content.expiresAtLabel}>
                <input name="expiresAt" type="datetime-local" className={inputClass} />
              </LabeledField>
            </div>
            <div className="mt-5">
              {canManageCredentials ? (
                <button type="submit" className={actionButtonClass}>
                  {content.createCredentialButton}
                </button>
              ) : null}
            </div>
          </form>

          <div className="rounded-[1.5rem] border border-line bg-white/75 p-5">
            {merchant.apiCredentials.length === 0 ? (
              <div className="rounded-[1.25rem] border border-dashed border-line p-6 text-sm leading-7 text-muted">
                {content.noCredentials}
              </div>
            ) : (
              <div className="space-y-4">
                {merchant.apiCredentials.map((credential) => (
                  <article
                    key={credential.id}
                    className="rounded-[1.25rem] border border-line bg-[#faf7f1] p-4"
                  >
                    {(() => {
                      const revealedSecret =
                        credentialReveal?.secret &&
                        ((credentialReveal.credentialId &&
                          credentialReveal.credentialId === credential.id) ||
                          credentialReveal.keyId === credential.keyId)
                          ? credentialReveal.secret
                          : "";
                      const credentialCopyItems: CopyFieldItem[] = [
                        {
                          id: `credential-key-id-${credential.id}`,
                          label: content.credentialRevealKeyId,
                          value: credential.keyId,
                          hint: content.credentialKeyIdHint,
                        },
                        ...(revealedSecret
                          ? [
                              {
                                id: `credential-secret-${credential.id}`,
                                label: content.credentialRevealSecret,
                                value: revealedSecret,
                                secret: true,
                                multiline: true,
                                wide: true,
                              } satisfies CopyFieldItem,
                            ]
                          : []),
                      ];
                      const credentialCopyAllValue = credentialCopyItems
                        .filter((item) => item.value?.trim())
                        .map(
                          (item) =>
                            `${item.label}${locale === "en" ? ": " : "："}${item.value?.trim()}`,
                        )
                        .join("\n\n");

                      return (
                        <>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-foreground">
                          {credential.label}
                        </p>
                        <p className="mt-1 break-all font-mono text-xs text-muted">
                          {credential.keyId}
                        </p>
                        <p className="mt-1 text-xs text-muted">
                          {content.secretPreview}：{credential.secretPreview}
                        </p>
                      </div>
                      <StatusBadge tone={credential.enabled ? "success" : "danger"}>
                        {credential.enabled ? (locale === "en" ? "Enabled" : "已启用") : (locale === "en" ? "Disabled" : "已停用")}
                      </StatusBadge>
                    </div>
                    <div className="mt-4">
                      <CopyFieldList
                        locale={locale}
                        items={credentialCopyItems}
                        copyAllValue={credentialCopyAllValue}
                      />
                    </div>
                    <div className="mt-4 rounded-[1rem] border border-line bg-white/80 p-4">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="max-w-3xl">
                          <p className="text-xs uppercase tracking-[0.18em] text-muted">
                            {content.credentialRevealSecret}
                          </p>
                          <h3 className="mt-2 text-base font-semibold text-foreground">
                            {content.revealSecretTitle}
                          </h3>
                          <p className="mt-2 text-sm leading-7 text-muted">
                            {revealedSecret
                              ? content.revealSecretReadyDesc
                              : content.revealSecretDesc}
                          </p>
                        </div>
                        {revealedSecret ? (
                          <form action={dismissMerchantCredentialRevealAction}>
                            <input
                              type="hidden"
                              name="redirectTo"
                              value="/merchant/credentials"
                            />
                            <button type="submit" className={subtleButtonClass}>
                              {content.hideSecretButton}
                            </button>
                          </form>
                        ) : null}
                      </div>
                      {!canManageCredentials ? (
                        <p className="mt-4 rounded-[1rem] border border-[#f3d1ab] bg-[#fff4e7] px-4 py-3 text-sm leading-7 text-[#8a4d18]">
                          {content.revealSecretNoPermission}
                        </p>
                      ) : !revealedSecret ? (
                        <form
                          action={revealMerchantApiCredentialSecretAction}
                          className="mt-4 grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end"
                        >
                          <input type="hidden" name="credentialId" value={credential.id} />
                          <input
                            type="hidden"
                            name="redirectTo"
                            value="/merchant/credentials"
                          />
                          <LabeledField label={content.currentPasswordLabel}>
                            <input
                              name="currentPassword"
                              type="password"
                              autoComplete="current-password"
                              placeholder={content.currentPasswordPlaceholder}
                              className={inputClass}
                            />
                          </LabeledField>
                          <button type="submit" className={actionButtonClass}>
                            {content.revealSecretButton}
                          </button>
                        </form>
                      ) : null}
                    </div>
                    <form
                      action={updateMerchantSelfServiceApiCredentialAction}
                      className="mt-4"
                    >
                      <input type="hidden" name="id" value={credential.id} />
                      <input type="hidden" name="redirectTo" value="/merchant/credentials" />
                      <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
                      <LabeledField label={content.expiresAtLabel}>
                        <input
                          name="expiresAt"
                          type="datetime-local"
                          defaultValue={
                            credential.expiresAt
                              ? new Date(
                                  credential.expiresAt.getTime() -
                                    credential.expiresAt.getTimezoneOffset() * 60000,
                                )
                                  .toISOString()
                                  .slice(0, 16)
                              : ""
                          }
                          className={inputClass}
                        />
                      </LabeledField>
                      <label className="inline-flex items-center gap-3 rounded-[1rem] border border-line bg-white px-4 py-3 text-sm text-foreground">
                        <input
                          type="checkbox"
                          name="enabled"
                          defaultChecked={credential.enabled}
                          className="h-4 w-4 rounded border-line"
                        />
                        {content.credentialToggleLabel}
                      </label>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-3 text-xs text-muted">
                      <span>
                        {content.credentialCreatedAt}{" "}
                        {formatDateTime(credential.createdAt, locale)}
                      </span>
                      <span>
                        {content.credentialLastUsedAt}{" "}
                        {formatDateTime(credential.lastUsedAt, locale)}
                      </span>
                      <span>
                        {content.credentialExpiresAt}{" "}
                        {formatDateTime(credential.expiresAt, locale)}
                      </span>
                    </div>
                    <div className="mt-4">
                      {canManageCredentials ? (
                        <button type="submit" className={actionButtonClass}>
                          {content.saveCredential}
                        </button>
                      ) : null}
                    </div>
                    </form>
                        </>
                      );
                    })()}
                  </article>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      <section className={`${panelClass} p-5 sm:p-6`}>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.22em] text-muted">
              {content.integration}
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-foreground">
              {content.integrationCardTitle}
            </h2>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-muted">
              {content.integrationCardDesc}
            </p>
          </div>
          <Link href="/merchant/integration" className={subtleButtonClass}>
            {content.integrationCardCta}
          </Link>
        </div>
      </section>
    </div>
  );
}
