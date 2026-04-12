import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getCallbackStatusLabel,
  formatDateTime,
  formatMoney,
  getCallbackStatusTone,
  getMerchantStatusLabel,
  getMerchantStatusTone,
  getPaymentStatusLabel,
  getPaymentStatusTone,
  getRefundStatusLabel,
  readPageMessages,
  type SearchParamsInput,
} from "@/app/admin/support";
import {
  AdminPageHeader,
  FlashMessage,
  LabeledField,
  StatCard,
  StatusBadge,
  buttonClass,
  inputClass,
  panelClass,
  subtleButtonClass,
  textareaClass,
  tableWrapperClass,
} from "@/app/admin/ui";
import {
  createMerchantSelfServiceApiCredentialAction,
  dismissMerchantCredentialRevealAction,
  runMerchantCheckoutSmokeTestAction,
  updateMerchantProfileAction,
  updateMerchantSelfServiceApiCredentialAction,
} from "@/app/merchant/actions";
import { PaymentStatus } from "@/generated/prisma/enums";
import { getCurrentLocale } from "@/lib/i18n-server";
import { readMerchantCredentialReveal } from "@/lib/merchant-credential-reveal";
import {
  getMerchantDisplayName,
  getMerchantEditableName,
  getMerchantProfileMissingFields,
} from "@/lib/merchant-profile-completion";
import { hasMerchantPermission } from "@/lib/merchant-rbac";
import { requireMerchantSession } from "@/lib/merchant-session";
import { getPrismaClient } from "@/lib/prisma";
import { maskStoredSecret } from "@/lib/secret-box";

export default async function MerchantDashboardPage({
  searchParams,
}: {
  searchParams?: SearchParamsInput;
}) {
  const session = await requireMerchantSession();
  const prisma = getPrismaClient();
  const messages = await readPageMessages(searchParams);
  const locale = await getCurrentLocale();
  const credentialReveal = await readMerchantCredentialReveal();
  const merchant = await prisma.merchant.findUnique({
    where: {
      id: session.merchantUser.merchantId,
    },
    include: {
      _count: {
        select: {
          paymentOrders: true,
          paymentRefunds: true,
          apiCredentials: true,
          channelBindings: true,
          channelAccounts: true,
        },
      },
      channelBindings: {
        include: {
          merchantChannelAccount: {
            select: {
              id: true,
              displayName: true,
              channelCode: true,
              enabled: true,
              callbackToken: true,
            },
          },
          providerAccount: {
            select: {
              id: true,
              displayName: true,
              channelCode: true,
              enabled: true,
            },
          },
        },
        orderBy: [{ channelCode: "asc" }],
      },
      channelAccounts: {
        orderBy: [{ channelCode: "asc" }, { updatedAt: "desc" }],
        select: {
          id: true,
          channelCode: true,
          displayName: true,
          enabled: true,
          callbackToken: true,
          updatedAt: true,
        },
      },
      apiCredentials: {
        orderBy: [{ createdAt: "desc" }],
      },
      paymentOrders: {
        orderBy: [{ createdAt: "desc" }],
        take: 10,
        select: {
          id: true,
          externalOrderId: true,
          channelCode: true,
          amount: true,
          status: true,
          callbackStatus: true,
          createdAt: true,
          paidAt: true,
        },
      },
      paymentRefunds: {
        orderBy: [{ createdAt: "desc" }],
        take: 10,
        select: {
          id: true,
          externalRefundId: true,
          amount: true,
          status: true,
          providerStatus: true,
          createdAt: true,
          refundedAt: true,
          paymentOrder: {
            select: {
              externalOrderId: true,
            },
          },
        },
      },
    },
  });

  if (!merchant) {
    notFound();
  }

  const [successfulOrders, totalPaidAmount, successfulRefunds, totalRefundAmount] = await Promise.all([
    prisma.paymentOrder.count({
      where: {
        merchantId: merchant.id,
        status: PaymentStatus.SUCCEEDED,
      },
    }),
    prisma.paymentOrder.aggregate({
      where: {
        merchantId: merchant.id,
        status: PaymentStatus.SUCCEEDED,
      },
      _sum: {
        amount: true,
      },
    }),
    prisma.paymentRefund.count({
      where: {
        merchantId: merchant.id,
        status: "SUCCEEDED",
      },
    }),
    prisma.paymentRefund.aggregate({
      where: {
        merchantId: merchant.id,
        status: "SUCCEEDED",
      },
      _sum: {
        amount: true,
      },
    }),
  ]);

  const activeCredentialCount = merchant.apiCredentials.filter(
    (credential) => credential.enabled && (!credential.expiresAt || credential.expiresAt > new Date()),
  ).length;
  const activeChannelAccountCount = merchant.channelAccounts.filter((account) => account.enabled).length;
  const successRate =
    merchant._count.paymentOrders > 0
      ? `${((successfulOrders / merchant._count.paymentOrders) * 100).toFixed(1)}%`
      : "0%";
  const canEditProfile = hasMerchantPermission(session.merchantUser.role, "profile:write");
  const canManageCredentials = hasMerchantPermission(session.merchantUser.role, "credential:write");
  const canReadRefunds = hasMerchantPermission(session.merchantUser.role, "refund:read");
  const canReadChannels = hasMerchantPermission(session.merchantUser.role, "channel:read");
  const profileMissingFields = getMerchantProfileMissingFields(merchant, locale);
  const isProfileComplete = profileMissingFields.length === 0;
  const merchantDisplayName = getMerchantDisplayName(merchant.name, locale, {
    profileComplete: isProfileComplete,
  });
  const hasConfiguredBusinessCallback = Boolean(merchant.callbackEnabled && merchant.callbackBase?.trim());
  const hasAnyChannelAccount = merchant._count.channelAccounts > 0;
  const hasEnabledChannelAccount = activeChannelAccountCount > 0;
  const content =
    locale === "en"
      ? {
          headerEyebrow: "Merchant Portal",
          headerDesc:
            "Basic integration access is ready. Save your API credential first, then complete business callbacks or official channel activation when your project is ready.",
          manageChannels: "Manage Channels",
          viewOrders: "All Orders",
          refunds: "Refund Management",
          docs: "API Docs",
          checkoutSmokeTest: "Run Payment Test",
          checkoutSmokeTestAlipay: "Test Alipay",
          checkoutSmokeTestWxpay: "Test WeChat Pay",
          checkoutSmokeTestHint:
            "Each enabled official channel will show its own final payment test entry. Alipay opens the cashier directly, while WeChat Pay opens a hosted QR page for scanning.",
          quickStartEyebrow: "Quick Start",
          quickStartTitle: "Start integration in the recommended order",
          quickStartDesc:
            "Most merchants only need an API credential and the docs to begin. Company profile details and official payment channels can be completed later when production credentials are ready.",
          readyStatus: "Ready",
          pendingStatus: "Pending",
          optionalStatus: "Optional",
          quickAccessTitle: "Basic access is enabled",
          quickAccessDesc:
            "This merchant workspace is ready for API integration. Review the docs and keep at least one active API credential available.",
          quickCredentialTitle: "Save your API credential",
          quickCredentialReadyDesc:
            "An active API credential already exists. Keep the one-time Secret in your secure vault before using it in server-side requests.",
          quickCredentialEmptyDesc:
            "No active API credential is available yet. Generate one before server-side order creation is enabled.",
          quickCallbackTitle: "Configure merchant business callback only if needed",
          quickCallbackReadyDesc:
            "A default merchant business callback URL is already configured. NovaPay will keep upstream payment callbacks platform-managed.",
          quickCallbackPendingDesc:
            "You can skip this for now. Add your own business callback endpoint later if your backend needs asynchronous payment notifications.",
          quickOfficialChannelsTitle: "Enable official payment channels when credentials are ready",
          quickOfficialChannelsReadyDesc:
            "Merchant-owned official channel instances already exist. Keep default routing aligned with enabled instances before production traffic starts.",
          quickOfficialChannelsPendingDesc:
            "Alipay and WeChat Pay are configured later. Only those official channels require company profile completion and upstream credentials.",
          quickCredentialCta: "Open API Credentials",
          quickCallbackCta: "Open Profile Settings",
          quickOfficialChannelsCta: "Open Channels",
          credentialRevealTitle: "Save this API credential now",
          credentialRevealBootstrapDesc:
            "NovaPay generated the first API credential automatically during registration. The Secret is shown only for this short secure session window.",
          credentialRevealManualDesc:
            "The new API credential is ready. Save the Secret now and hand it to your server-side integration only.",
          credentialRevealKeyId: "Key ID",
          credentialRevealSecret: "Secret",
          credentialRevealHint:
            "Store it in a secure secret manager. After this window closes, only the masked preview remains in the console.",
          credentialRevealDismiss: "I have saved it",
          pendingApproval:
            "This merchant workspace is not currently allowed to create new orders. Resume access after the merchant status returns to approved.",
          profileIncompleteTitle: "Additional profile for regulated channels",
          profileIncompleteDesc:
            "If you plan to enable official regulated channels such as Alipay or WeChat Pay, complete the following merchant profile fields first.",
          profileIncompleteFields: "Missing fields",
          profileIncompleteHint:
            "Lower-risk channels can remain lightweight later, but regulated official channels will enforce these fields before activation.",
          reviewNote: "Platform Note",
          statStatus: "Status",
          statStatusDetail: "Current merchant review status",
          statOrders: "Orders",
          statOrdersDetail: "Total orders under this merchant",
          statChannels: "Channels",
          statChannelsDetail: `Enabled ${activeChannelAccountCount} of ${merchant._count.channelAccounts} instances`,
          statApiKeys: "API Keys",
          statApiKeysDetail: "Available dedicated API credentials",
          statSuccessRate: "Success Rate",
          statSuccessRateDetail: "Payment success rate for this merchant",
          statGmv: "GMV",
          statGmvDetail: "Successful transaction amount",
          statRefunds: "Refunds",
          statRefundsDetail: `Successful refund amount ${formatMoney(totalRefundAmount._sum.amount?.toString() ?? 0, "CNY", locale)}`,
          statNet: "Net Amount",
          statNetDetail: "Net amount after successful payments and refunds",
          profileEyebrow: "Profile",
          profileTitle: "Merchant profile",
          profileIntroTitle: "You can skip most of this during the first test",
          profileIntroDesc:
            "For API signing and basic integration, this section is optional at first. Complete the company profile only when you are ready to enable official channels such as Alipay or WeChat Pay.",
          profileCoreFieldsTitle: "Required later for official channels",
          profileCoreFields:
            "Merchant Name, Legal Entity Name, Contact Name, Contact Phone, and Business Registration ID.",
          profileAdvancedFieldsTitle: "Advanced settings you can leave blank for now",
          profileAdvancedFields:
            "Default Business Callback URL, API IP Whitelist, callback signing secret, and business note.",
          callbackEnabledStatus: "Business callbacks enabled",
          callbackDisabledStatus: "Business callbacks disabled",
          readOnlyProfile: "This role can view merchant settings but cannot edit profile or security parameters.",
          merchantNameLabel: "Merchant Name",
          legalNameLabel: "Legal Entity Name",
          merchantCodeLabel: "Merchant Code",
          registrationIdLabel: "Business Registration ID",
          contactNameLabel: "Contact Name",
          contactEmailLabel: "Contact Email",
          contactPhoneLabel: "Contact Phone",
          websiteLabel: "Website",
          websitePlaceholder: "https://merchant.example.com",
          callbackBaseLabel: "Default Business Callback URL",
          callbackBaseHint:
            "NovaPay will deliver merchant-side business notifications to this endpoint after payment or refund status changes. Upstream payment callbacks are managed automatically by the platform.",
          callbackBasePlaceholder: "https://merchant.example.com/api/payments/callback",
          ipWhitelistLabel: "API IP Whitelist",
          ipWhitelistHint: "Enter one source IP per line or separate them with commas. Only requests from these IPs will pass verification once configured.",
          callbackToggleLabel: "Enable merchant business callback notifications",
          notifySecretHintConfigured: `Configured: ${maskStoredSecret(merchant.notifySecret)}. Leave blank to keep the current business callback signing secret, or provide a new value to rotate it.`,
          notifySecretHintEmpty:
            "No business callback signing secret is configured yet. A new value will be encrypted and stored automatically.",
          onboardingNoteLabel: "Business Note",
          onboardingNoteHint: "Add business type, expected volume, or requested payment channels for platform review.",
          createdAt: "Created",
          updatedAt: "Updated",
          statusChangedAt: "Status Changed",
          saveProfile: "Save Merchant Profile",
          routingEyebrow: "Routing",
          routingTitle: "Payment channels and default routing",
          routingStatusReady: "Merchant-owned routing preferred",
          routingStatusEmpty: "Waiting for channel setup",
          routingDesc:
            "Routing only uses your own payment channel instances. If no explicit default instance is configured for a channel, the system prefers the most recently enabled merchant-owned instance. Platform-owned collection accounts are no longer used.",
          routingButton: "Open Channels Page",
          noBindingsWithAccounts:
            "You already created payment channel instances, but no explicit default bindings are configured yet. The system can still auto-route to enabled merchant-owned instances, though configuring defaults is recommended.",
          noBindingsWithoutAccounts:
            "No usable payment channel instances are configured yet. Add your Alipay or WeChat Pay channel settings before accepting production traffic.",
          channelCol: "Channel",
          targetCol: "Routing Target",
          rangeCol: "Amount Range",
          statusCol: "Status",
          merchantInstancePrefix: "Merchant Instance",
          legacyPrefix: "Legacy Platform Account",
          migrateHint: "Rebind to a merchant-owned instance before continuing",
          autoRoute: "No explicit default instance is configured. Auto-routing will use enabled merchant-owned instances.",
          minAmount: "Min",
          maxAmount: "Max",
          enabled: "Enabled",
          disabled: "Disabled",
          credentialsEyebrow: "API Credentials",
          credentialsTitle: "Merchant API credentials",
          credentialsDesc:
            "Production order requests must use dedicated API credentials and include the four signing headers `x-novapay-key`, `x-novapay-timestamp`, `x-novapay-nonce`, and `x-novapay-signature`.",
          createCredentialTitle: "Create API credential",
          noCredentialPermission: "This role does not have permission to manage API credentials.",
          credentialLabel: "Credential Label",
          credentialLabelPlaceholder: "Production / ERP / Test",
          expiresAtLabel: "Expires At",
          createCredentialButton: "Generate Credential",
          noCredentials: "No dedicated API credential exists yet. Create at least one production credential for server-side order creation.",
          secretPreview: "Secret Preview",
          credentialToggleLabel: "Enable credential",
          credentialCreatedAt: "Created",
          credentialLastUsedAt: "Last Used",
          credentialExpiresAt: "Expires",
          saveCredential: "Save Credential Status",
          recentOrdersEyebrow: "Recent Orders",
          recentOrdersTitle: "Recent orders",
          recentOrdersDesc: "This dashboard snapshot shows only the latest 10 orders. Use the full order list for filtering and paging.",
          recentOrdersButton: "Open Full Order List",
          noOrders: "No order records yet. Orders will appear here after the integration starts sending traffic.",
          orderIdCol: "Order ID",
          amountCol: "Amount",
          paymentStatusCol: "Payment Status",
          callbackStatusCol: "Business Callback",
          timeCol: "Time",
          createdPrefix: "Created",
          paidPrefix: "Paid",
          recentRefundsEyebrow: "Recent Refunds",
          recentRefundsTitle: "Recent refunds",
          recentRefundsDesc:
            "This dashboard snapshot shows only the latest 10 refunds. Use refund management for complete search and paging.",
          recentRefundsButton: "Open Refund Management",
          noRefunds: "No refund records yet. Refund requests and sync status will appear here.",
          refundIdCol: "Refund ID",
          relatedOrderCol: "Related Order",
          refundStatusCol: "Status",
          providerPending: "Awaiting provider result",
          refundCreatedPrefix: "Created",
          refundedPrefix: "Refunded",
        }
      : {
          headerEyebrow: "商户控制台",
          headerDesc:
            "基础接入已就绪。建议先保存 API 凭证并对接文档，业务回调和正式官方通道可按项目进度后续配置。",
          manageChannels: "管理支付通道",
          viewOrders: "查看全部订单",
          refunds: "退款管理",
          docs: "打开 API 文档",
          checkoutSmokeTest: "支付测试",
          checkoutSmokeTestAlipay: "支付宝测试",
          checkoutSmokeTestWxpay: "微信支付测试",
          checkoutSmokeTestHint:
            "已启用的官方通道会显示各自的最终支付测试入口。支付宝会直接进入收银台，微信支付会进入平台托管的二维码页面。",
          quickStartEyebrow: "快速开始",
          quickStartTitle: "按推荐顺序完成接入",
          quickStartDesc:
            "大多数商户先拿 API 凭证和文档就能开始联调。企业资料、业务回调和官方支付通道可在后续上线阶段再补充。",
          readyStatus: "已就绪",
          pendingStatus: "待处理",
          optionalStatus: "可后配",
          quickAccessTitle: "基础接入已开通",
          quickAccessDesc:
            "当前商户工作台已经可以开始接口接入。请先确认 API 文档和可用凭证，再推进服务端联调。",
          quickCredentialTitle: "先保存 API 凭证",
          quickCredentialReadyDesc:
            "当前已经存在可用的 API 凭证。请先妥善保存一次性展示的 Secret，再用于服务端请求签名。",
          quickCredentialEmptyDesc:
            "当前还没有可用的 API 凭证。请先生成一组凭证，再开始服务端下单联调。",
          quickCallbackTitle: "业务回调按需配置",
          quickCallbackReadyDesc:
            "默认业务回调地址已配置完成。NovaPay 会继续自动托管支付宝、微信等上游支付回调。",
          quickCallbackPendingDesc:
            "这一步可以暂时跳过。只有你的业务系统需要异步接收支付结果时，才需要配置商户业务回调地址。",
          quickOfficialChannelsTitle: "正式官方通道后续再开通",
          quickOfficialChannelsReadyDesc:
            "当前已经存在商户自有官方通道实例。上线前请确认默认路由与实例启停状态保持一致。",
          quickOfficialChannelsPendingDesc:
            "支付宝、微信支付等官方通道建议放到后续正式开通时再配置。只有这些官方通道才会强制要求补齐企业资料和上游参数。",
          quickCredentialCta: "查看 API 凭证",
          quickCallbackCta: "查看商户配置",
          quickOfficialChannelsCta: "前往支付通道",
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
          pendingApproval:
            "当前商户暂未开放新订单创建能力。恢复为通过状态后，才可继续发起支付订单。",
          profileIncompleteTitle: "官方通道资料待补齐",
          profileIncompleteDesc:
            "如果你计划启用支付宝、微信支付等高合规官方通道，请先补齐以下商户主体资料。",
          profileIncompleteFields: "待补充字段",
          profileIncompleteHint:
            "后续新增的低风险通道可以保持轻量接入，但高合规官方通道会在启用前强制校验这些字段。",
          reviewNote: "平台备注",
          statStatus: "状态",
          statStatusDetail: "商户当前审核状态",
          statOrders: "订单数",
          statOrdersDetail: "当前商户累计订单数",
          statChannels: "通道实例",
          statChannelsDetail: `已启用 ${activeChannelAccountCount} 个，共 ${merchant._count.channelAccounts} 个实例`,
          statApiKeys: "API 凭证",
          statApiKeysDetail: "当前可用的独立 API 凭证数量",
          statSuccessRate: "成功率",
          statSuccessRateDetail: "当前商户支付成功率",
          statGmv: "交易总额",
          statGmvDetail: "当前商户成功交易金额",
          statRefunds: "退款数",
          statRefundsDetail: `成功退款金额 ${formatMoney(totalRefundAmount._sum.amount?.toString() ?? 0, "CNY", locale)}`,
          statNet: "净额",
          statNetDetail: "成功收款减退款后的净额",
          profileEyebrow: "Profile",
          profileTitle: "商户接入配置",
          profileIntroTitle: "首次测试时，这一块大部分都可以先跳过",
          profileIntroDesc:
            "如果你现在只是先做接口签名和基础联调，这里可以先不填。只有在你准备启用支付宝、微信支付等官方通道时，才需要补齐商户主体资料。",
          profileCoreFieldsTitle: "后续开通官方通道时必须补齐",
          profileCoreFields:
            "商户名称、企业主体名称、联系人、联系电话、统一社会信用代码。",
          profileAdvancedFieldsTitle: "以下属于高级配置，当前可以留空",
          profileAdvancedFields:
            "默认业务回调地址、API IP 白名单、回调验签密钥、入驻补充说明。",
          callbackEnabledStatus: "业务回调已启用",
          callbackDisabledStatus: "业务回调已停用",
          readOnlyProfile: "当前角色仅可查看商户资料，不能修改接入参数与安全配置。",
          merchantNameLabel: "商户名称",
          legalNameLabel: "企业主体名称",
          merchantCodeLabel: "商户编码",
          registrationIdLabel: "统一社会信用代码",
          contactNameLabel: "联系人",
          contactEmailLabel: "联系邮箱",
          contactPhoneLabel: "联系电话",
          websiteLabel: "企业网站",
          websitePlaceholder: "https://merchant.example.com",
          callbackBaseLabel: "默认业务回调地址",
          callbackBaseHint: "订单支付、退款等状态变化后，NovaPay 会向这里投递商户业务通知。支付宝、微信等上游支付回调由平台自动管理。",
          callbackBasePlaceholder: "https://merchant.example.com/api/payments/callback",
          ipWhitelistLabel: "API IP 白名单",
          ipWhitelistHint: "每行或逗号分隔一个来源 IP。配置后，只有来自这些 IP 的请求才会通过验签。",
          callbackToggleLabel: "启用商户业务回调通知",
          notifySecretHintConfigured: `当前已配置：${maskStoredSecret(merchant.notifySecret)}。留空表示不修改当前业务回调验签密钥，输入新值会替换现有密钥。`,
          notifySecretHintEmpty: "当前未配置业务回调验签密钥。输入后会自动加密保存。",
          onboardingNoteLabel: "入驻补充说明",
          onboardingNoteHint: "可补充业务类型、交易规模、希望开通的支付通道。",
          createdAt: "创建于",
          updatedAt: "更新于",
          statusChangedAt: "状态更新时间",
          saveProfile: "保存商户配置",
          routingEyebrow: "Routing",
          routingTitle: "支付通道与默认路由",
          routingStatusReady: "商户自助优先",
          routingStatusEmpty: "等待创建通道实例",
          routingDesc:
            "当前路由只会使用你自己的支付通道实例；若某个通道没有显式默认实例，系统会优先选用该通道下最近启用的商户实例。平台级代收款账号已停用。",
          routingButton: "前往支付通道页",
          noBindingsWithAccounts:
            "你已经创建了支付通道实例，但当前还没有显式默认绑定。系统仍会自动优先使用已启用的商户实例，建议进入支付通道页设定默认实例。",
          noBindingsWithoutAccounts:
            "当前商户还没有可用的支付通道实例。请先进入支付通道页录入支付宝或微信支付参数，再开始正式收款。",
          channelCol: "通道",
          targetCol: "路由目标",
          rangeCol: "金额范围",
          statusCol: "状态",
          merchantInstancePrefix: "商户实例",
          legacyPrefix: "遗留平台账号路由",
          migrateHint: "请改绑为商户实例后再继续收款",
          autoRoute: "未指定默认实例，按已启用实例自动路由",
          minAmount: "最小",
          maxAmount: "最大",
          enabled: "已启用",
          disabled: "已停用",
          credentialsEyebrow: "API Credentials",
          credentialsTitle: "商户 API 凭证",
          credentialsDesc:
            "正式环境下，下单请求必须使用独立 API 凭证，并携带 `x-novapay-key`、`x-novapay-timestamp`、`x-novapay-nonce`、`x-novapay-signature` 四个签名头。",
          createCredentialTitle: "新增 API 凭证",
          noCredentialPermission: "当前角色没有管理 API 凭证的权限。",
          credentialLabel: "凭证标签",
          credentialLabelPlaceholder: "Production / ERP / Test",
          expiresAtLabel: "过期时间",
          createCredentialButton: "生成凭证",
          noCredentials: "当前还没有独立 API 凭证。建议至少创建一个生产凭证，用于服务端正式下单。",
          secretPreview: "Secret 预览",
          credentialToggleLabel: "启用凭证",
          credentialCreatedAt: "创建于",
          credentialLastUsedAt: "最近使用",
          credentialExpiresAt: "到期",
          saveCredential: "保存凭证状态",
          recentOrdersEyebrow: "Recent Orders",
          recentOrdersTitle: "最近订单",
          recentOrdersDesc: "这里仅展示最近 10 笔订单快照，完整筛选与翻页请进入订单列表。",
          recentOrdersButton: "打开完整订单列表",
          noOrders: "还没有订单记录，完成接入后这里会出现该商户的支付订单。",
          orderIdCol: "订单号",
          amountCol: "金额",
          paymentStatusCol: "支付状态",
          callbackStatusCol: "业务回调",
          timeCol: "时间",
          createdPrefix: "创建",
          paidPrefix: "支付",
          recentRefundsEyebrow: "Recent Refunds",
          recentRefundsTitle: "最近退款",
          recentRefundsDesc: "这里仅展示最近 10 笔退款快照，完整检索与翻页请进入退款管理。",
          recentRefundsButton: "打开退款管理",
          noRefunds: "还没有退款记录，退款申请与同步状态会显示在这里。",
          refundIdCol: "退款单号",
          relatedOrderCol: "关联订单",
          refundStatusCol: "状态",
          providerPending: "等待平台返回",
          refundCreatedPrefix: "创建",
          refundedPrefix: "退款",
        };
  const actionButtonClass = `${buttonClass} w-full sm:w-auto`;
  const secondaryActionButtonClass =
    "inline-flex w-full items-center justify-center rounded-2xl border border-line bg-white/80 px-4 py-2.5 text-sm font-medium text-foreground transition hover:border-accent hover:text-accent sm:w-auto";
  const mobileCardClass = "rounded-[1.25rem] border border-line bg-white/80 p-4";
  const checkoutTestChannels = [
    {
      code: "alipay.page",
      label: content.checkoutSmokeTestAlipay,
    },
    {
      code: "wxpay.native",
      label: content.checkoutSmokeTestWxpay,
    },
  ].filter((channel) => {
    const hasUsableBinding = merchant.channelBindings.some(
      (binding) =>
        binding.channelCode === channel.code &&
        (!binding.merchantChannelAccountId || binding.merchantChannelAccount?.enabled),
    );

    if (hasUsableBinding) {
      return true;
    }

    return merchant.channelAccounts.some(
      (account) => account.enabled && account.channelCode === channel.code,
    );
  });

  return (
    <div className="space-y-8">
      <AdminPageHeader
        eyebrow={content.headerEyebrow}
        title={merchantDisplayName}
        description={content.headerDesc}
        actions={
          <div className="grid w-full gap-3 sm:flex sm:flex-wrap sm:justify-end">
            {checkoutTestChannels.length > 0 ? (
              checkoutTestChannels.map((channel) => (
                <form key={channel.code} action={runMerchantCheckoutSmokeTestAction}>
                  <input type="hidden" name="channelCode" value={channel.code} />
                  <button type="submit" className={actionButtonClass}>
                    {channel.label}
                  </button>
                </form>
              ))
            ) : (
              <form action={runMerchantCheckoutSmokeTestAction}>
                <button type="submit" className={actionButtonClass}>
                  {content.checkoutSmokeTest}
                </button>
              </form>
            )}
            {canReadChannels ? (
              <Link href="/merchant/channels" className={actionButtonClass}>
                {content.manageChannels}
              </Link>
            ) : null}
            <Link href="/merchant/orders" className={actionButtonClass}>
              {content.viewOrders}
            </Link>
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

      <p className="-mt-4 text-sm leading-7 text-muted">{content.checkoutSmokeTestHint}</p>

      <FlashMessage success={messages.success} error={messages.error} />

      {credentialReveal ? (
        <section className="rounded-[1.75rem] border border-[#c9dfd5] bg-[linear-gradient(135deg,#f3fbf7_0%,#eef7ff_100%)] p-5 shadow-[0_18px_50px_rgba(29,87,70,0.08)] sm:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-3xl">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#1d5746]">
                {content.credentialRevealTitle}
              </p>
              <p className="mt-3 text-sm leading-7 text-[#335f52]">
                {credentialReveal.source === "bootstrap"
                  ? content.credentialRevealBootstrapDesc
                  : content.credentialRevealManualDesc}
              </p>
              <p className="mt-2 text-xs leading-6 text-[#4b6d62]">{content.credentialRevealHint}</p>
            </div>
            <form action={dismissMerchantCredentialRevealAction}>
              <button type="submit" className={subtleButtonClass}>
                {content.credentialRevealDismiss}
              </button>
            </form>
          </div>
          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            <div className="rounded-[1.25rem] border border-white/80 bg-white/90 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-muted">{content.credentialRevealKeyId}</p>
              <p className="mt-2 break-all font-mono text-sm text-foreground">{credentialReveal.keyId}</p>
            </div>
            <div className="rounded-[1.25rem] border border-white/80 bg-[#1f1812] p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-[#d8c3ae]">{content.credentialRevealSecret}</p>
              <p className="mt-2 break-all font-mono text-sm text-white">{credentialReveal.secret}</p>
            </div>
          </div>
        </section>
      ) : null}

      <section className={`${panelClass} p-5 sm:p-6`}>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.22em] text-muted">{content.quickStartEyebrow}</p>
            <h2 className="mt-2 text-2xl font-semibold text-foreground">{content.quickStartTitle}</h2>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-muted">{content.quickStartDesc}</p>
          </div>
          <Link href="/docs" className={buttonClass}>
            {content.docs}
          </Link>
        </div>
        <div className="mt-6 grid gap-4 xl:grid-cols-4">
          <article className="rounded-[1.25rem] border border-line bg-white/80 p-4">
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-base font-semibold text-foreground">{content.quickAccessTitle}</h3>
              <StatusBadge tone="success">{content.readyStatus}</StatusBadge>
            </div>
            <p className="mt-3 text-sm leading-7 text-muted">{content.quickAccessDesc}</p>
          </article>
          <article className="rounded-[1.25rem] border border-line bg-white/80 p-4">
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-base font-semibold text-foreground">{content.quickCredentialTitle}</h3>
              <StatusBadge tone={activeCredentialCount > 0 ? "success" : "warning"}>
                {activeCredentialCount > 0 ? content.readyStatus : content.pendingStatus}
              </StatusBadge>
            </div>
            <p className="mt-3 text-sm leading-7 text-muted">
              {activeCredentialCount > 0 ? content.quickCredentialReadyDesc : content.quickCredentialEmptyDesc}
            </p>
            <div className="mt-4">
              <Link href="/merchant#merchant-api-credentials" className={subtleButtonClass}>
                {content.quickCredentialCta}
              </Link>
            </div>
          </article>
          <article className="rounded-[1.25rem] border border-line bg-white/80 p-4">
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-base font-semibold text-foreground">{content.quickCallbackTitle}</h3>
              <StatusBadge tone={hasConfiguredBusinessCallback ? "success" : "neutral"}>
                {hasConfiguredBusinessCallback ? content.readyStatus : content.optionalStatus}
              </StatusBadge>
            </div>
            <p className="mt-3 text-sm leading-7 text-muted">
              {hasConfiguredBusinessCallback ? content.quickCallbackReadyDesc : content.quickCallbackPendingDesc}
            </p>
            <div className="mt-4">
              <Link href="/merchant#merchant-profile-settings" className={subtleButtonClass}>
                {content.quickCallbackCta}
              </Link>
            </div>
          </article>
          <article className="rounded-[1.25rem] border border-line bg-white/80 p-4">
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-base font-semibold text-foreground">{content.quickOfficialChannelsTitle}</h3>
              <StatusBadge tone={hasEnabledChannelAccount ? "success" : "warning"}>
                {hasEnabledChannelAccount ? content.readyStatus : content.pendingStatus}
              </StatusBadge>
            </div>
            <p className="mt-3 text-sm leading-7 text-muted">
              {hasAnyChannelAccount ? content.quickOfficialChannelsReadyDesc : content.quickOfficialChannelsPendingDesc}
            </p>
            <div className="mt-4">
              <Link href="/merchant/channels" className={subtleButtonClass}>
                {content.quickOfficialChannelsCta}
              </Link>
            </div>
          </article>
        </div>
      </section>

      {!isProfileComplete ? (
        <section className="rounded-[1.5rem] border border-[#f3d1ab] bg-[#fff4e7] p-5 text-sm text-[#8a4d18]">
          <div className="flex flex-wrap items-center gap-3">
            <StatusBadge tone="warning">{content.profileIncompleteTitle}</StatusBadge>
            <span>{content.profileIncompleteDesc}</span>
          </div>
          <p className="mt-3 leading-7">
            {content.profileIncompleteFields}
            {locale === "en" ? ": " : "："}
            {profileMissingFields.join(locale === "en" ? ", " : "、")}
          </p>
          <p className="mt-2 leading-7">{content.profileIncompleteHint}</p>
        </section>
      ) : null}

      {merchant.status !== "APPROVED" ? (
        <section className="rounded-[1.5rem] border border-[#f3d1ab] bg-[#fff4e7] p-5 text-sm text-[#8a4d18]">
          <div className="flex flex-wrap items-center gap-3">
            <StatusBadge tone={getMerchantStatusTone(merchant.status)}>
              {getMerchantStatusLabel(merchant.status, locale)}
            </StatusBadge>
            <span>{content.pendingApproval}</span>
          </div>
          {merchant.reviewNote ? (
            <p className="mt-3 leading-7">
              {content.reviewNote}
              {locale === "en" ? ": " : "："}
              {merchant.reviewNote}
            </p>
          ) : null}
        </section>
      ) : null}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-8">
        <StatCard
          label={content.statStatus}
          value={getMerchantStatusLabel(merchant.status, locale)}
          detail={content.statStatusDetail}
        />
        <StatCard label={content.statOrders} value={merchant._count.paymentOrders} detail={content.statOrdersDetail} />
        <StatCard
          label={content.statChannels}
          value={activeChannelAccountCount}
          detail={content.statChannelsDetail}
        />
        <StatCard
          label={content.statApiKeys}
          value={activeCredentialCount}
          detail={content.statApiKeysDetail}
        />
        <StatCard label={content.statSuccessRate} value={successRate} detail={content.statSuccessRateDetail} />
        <StatCard
          label={content.statGmv}
          value={formatMoney(totalPaidAmount._sum.amount?.toString() ?? 0, "CNY", locale)}
          detail={content.statGmvDetail}
        />
        <StatCard
          label={content.statRefunds}
          value={successfulRefunds}
          detail={content.statRefundsDetail}
        />
        <StatCard
          label={content.statNet}
          value={formatMoney(
            Number(totalPaidAmount._sum.amount?.toString() ?? 0) -
              Number(totalRefundAmount._sum.amount?.toString() ?? 0),
            "CNY",
            locale,
          )}
          detail={content.statNetDetail}
        />
      </section>

      <section className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <article id="merchant-profile-settings" className={`${panelClass} min-w-0 p-5 sm:p-6`}>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.22em] text-muted">{content.profileEyebrow}</p>
              <h2 className="mt-2 text-2xl font-semibold text-foreground">{content.profileTitle}</h2>
            </div>
            <div className="flex flex-wrap gap-2">
              <StatusBadge tone={getMerchantStatusTone(merchant.status)}>
                {getMerchantStatusLabel(merchant.status, locale)}
              </StatusBadge>
              <StatusBadge tone={merchant.callbackEnabled ? "success" : "danger"}>
                {merchant.callbackEnabled ? content.callbackEnabledStatus : content.callbackDisabledStatus}
              </StatusBadge>
            </div>
          </div>

          {!canEditProfile ? (
            <div className="mt-6 rounded-[1.25rem] border border-[#f3d1ab] bg-[#fff4e7] p-4 text-sm text-[#8a4d18]">
              {content.readOnlyProfile}
            </div>
          ) : null}

          <div className="mt-6 rounded-[1.25rem] border border-[#d8e4f5] bg-[#f7fbff] p-4 text-sm text-[#36506f]">
            <div className="flex flex-wrap items-center gap-3">
              <StatusBadge tone="info">{content.profileIntroTitle}</StatusBadge>
              <span>{content.profileIntroDesc}</span>
            </div>
            <p className="mt-3 leading-7">
              {content.profileCoreFieldsTitle}
              {locale === "en" ? ": " : "："}
              {content.profileCoreFields}
            </p>
            <p className="mt-2 leading-7">
              {content.profileAdvancedFieldsTitle}
              {locale === "en" ? ": " : "："}
              {content.profileAdvancedFields}
            </p>
          </div>

          <form action={updateMerchantProfileAction} className="mt-6 grid gap-4">
            <input type="hidden" name="redirectTo" value="/merchant" />

            <div className="grid gap-4 sm:grid-cols-2">
              <LabeledField label={content.merchantNameLabel}>
                <input
                  name="merchantName"
                  defaultValue={getMerchantEditableName(merchant.name)}
                  className={inputClass}
                />
              </LabeledField>
              <LabeledField label={content.legalNameLabel}>
                <input name="legalName" defaultValue={merchant.legalName ?? ""} className={inputClass} />
              </LabeledField>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <LabeledField label={content.merchantCodeLabel}>
                <input value={merchant.code} disabled className={`${inputClass} bg-[#f6f1ea] text-muted`} />
              </LabeledField>
              <LabeledField label={content.registrationIdLabel}>
                <input
                  name="companyRegistrationId"
                  defaultValue={merchant.companyRegistrationId ?? ""}
                  className={inputClass}
                />
              </LabeledField>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <LabeledField label={content.contactNameLabel}>
                <input name="contactName" defaultValue={merchant.contactName ?? ""} className={inputClass} />
              </LabeledField>
              <LabeledField label={content.contactEmailLabel}>
                <input
                  name="contactEmail"
                  defaultValue={merchant.contactEmail ?? ""}
                  className={inputClass}
                />
              </LabeledField>
              <LabeledField label={content.contactPhoneLabel}>
                <input
                  name="contactPhone"
                  defaultValue={merchant.contactPhone ?? ""}
                  className={inputClass}
                />
              </LabeledField>
            </div>

            <LabeledField label={content.websiteLabel}>
              <input
                name="website"
                defaultValue={merchant.website ?? ""}
                placeholder={content.websitePlaceholder}
                className={inputClass}
              />
            </LabeledField>

            <LabeledField label={content.callbackBaseLabel} hint={content.callbackBaseHint}>
              <input
                name="callbackBase"
                defaultValue={merchant.callbackBase ?? ""}
                placeholder={content.callbackBasePlaceholder}
                className={inputClass}
              />
            </LabeledField>

            <LabeledField
              label={content.ipWhitelistLabel}
              hint={content.ipWhitelistHint}
            >
              <textarea
                name="apiIpWhitelist"
                defaultValue={merchant.apiIpWhitelist ?? ""}
                className={`${textareaClass} min-h-[110px] font-sans text-sm`}
              />
            </LabeledField>

            <div className="rounded-[1.25rem] border border-line bg-white/65 p-4">
              <label className="flex items-center gap-3 text-sm font-medium text-foreground">
                <input
                  type="checkbox"
                  name="callbackEnabled"
                  defaultChecked={merchant.callbackEnabled}
                  className="h-4 w-4 rounded border-line"
                />
                {content.callbackToggleLabel}
              </label>
            </div>

            <input type="hidden" name="notifySecretStrategy" value="preserve_if_blank" />
            <LabeledField
              label="notifySecret"
              hint={
                merchant.notifySecret ? content.notifySecretHintConfigured : content.notifySecretHintEmpty
              }
            >
              <textarea
                name="notifySecret"
                defaultValue=""
                className={`${textareaClass} min-h-[110px] font-sans text-sm`}
              />
            </LabeledField>

            <LabeledField label={content.onboardingNoteLabel} hint={content.onboardingNoteHint}>
              <textarea
                name="onboardingNote"
                defaultValue={merchant.onboardingNote ?? ""}
                className={`${textareaClass} min-h-[110px] font-sans text-sm`}
              />
            </LabeledField>

            <div className="flex flex-wrap gap-3 text-xs text-muted">
              <span className="rounded-full border border-line bg-white px-3 py-1">
                {content.createdAt} {formatDateTime(merchant.createdAt, locale)}
              </span>
              <span className="rounded-full border border-line bg-white px-3 py-1">
                {content.updatedAt} {formatDateTime(merchant.updatedAt, locale)}
              </span>
              <span className="rounded-full border border-line bg-white px-3 py-1">
                {content.statusChangedAt} {formatDateTime(merchant.statusChangedAt, locale)}
              </span>
            </div>

            <div>
              {canEditProfile ? (
                <button type="submit" className={actionButtonClass}>
                  {content.saveProfile}
                </button>
              ) : null}
            </div>
          </form>
        </article>

        <article className={`${panelClass} min-w-0 p-5 sm:p-6`}>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.22em] text-muted">{content.routingEyebrow}</p>
              <h2 className="mt-2 text-2xl font-semibold text-foreground">{content.routingTitle}</h2>
            </div>
            <span className="rounded-full border border-line bg-white px-3 py-1 text-xs text-muted">
              {merchant._count.channelAccounts > 0 ? content.routingStatusReady : content.routingStatusEmpty}
            </span>
          </div>
          <p className="mt-4 text-sm leading-7 text-muted">
            {content.routingDesc}
          </p>
          {canReadChannels ? (
            <div className="mt-4">
              <Link href="/merchant/channels" className={actionButtonClass}>
                {content.routingButton}
              </Link>
            </div>
          ) : null}

          {merchant.channelBindings.length === 0 ? (
            <div className="mt-6 rounded-[1.25rem] border border-dashed border-line p-6 text-sm leading-7 text-muted">
              {merchant._count.channelAccounts > 0
                ? content.noBindingsWithAccounts
                : content.noBindingsWithoutAccounts}
            </div>
          ) : (
            <>
              <div className="mt-6 grid gap-4 md:hidden">
                {merchant.channelBindings.map((binding) => (
                  <article key={binding.id} className={mobileCardClass}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-mono text-xs text-muted">{content.channelCol}</p>
                        <p className="mt-1 font-mono text-sm text-foreground">{binding.channelCode}</p>
                      </div>
                      <StatusBadge tone={binding.enabled ? "success" : "danger"}>
                        {binding.enabled ? content.enabled : content.disabled}
                      </StatusBadge>
                    </div>
                    <div className="mt-4 grid gap-3 text-sm text-muted">
                      <div>
                        <p className="text-[11px] uppercase tracking-[0.18em]">{content.targetCol}</p>
                        {binding.merchantChannelAccount ? (
                          <>
                            <p className="mt-1 text-foreground">
                              {content.merchantInstancePrefix} · {binding.merchantChannelAccount.displayName}
                            </p>
                            <p className="mt-1 break-all font-mono text-xs">
                              {binding.merchantChannelAccount.callbackToken}
                            </p>
                          </>
                        ) : binding.providerAccount ? (
                          <>
                            <p className="mt-1 text-[#9b3d18]">
                              {content.legacyPrefix} · {binding.providerAccount.displayName}
                            </p>
                            <p className="mt-1 text-xs">{content.migrateHint}</p>
                          </>
                        ) : (
                          <p className="mt-1">{content.autoRoute}</p>
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <p className="text-[11px] uppercase tracking-[0.18em]">{content.minAmount}</p>
                          <p className="mt-1 text-foreground">
                            {formatMoney(binding.minAmount?.toString() ?? null, "CNY", locale)}
                          </p>
                        </div>
                        <div>
                          <p className="text-[11px] uppercase tracking-[0.18em]">{content.maxAmount}</p>
                          <p className="mt-1 text-foreground">
                            {formatMoney(binding.maxAmount?.toString() ?? null, "CNY", locale)}
                          </p>
                        </div>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
              <div className={`mt-6 hidden md:block ${tableWrapperClass}`}>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-left text-sm">
                    <thead className="bg-[#f3e7d7] text-xs uppercase tracking-[0.18em] text-muted">
                      <tr>
                        <th className="px-4 py-3">{content.channelCol}</th>
                        <th className="px-4 py-3">{content.targetCol}</th>
                        <th className="px-4 py-3">{content.rangeCol}</th>
                        <th className="px-4 py-3">{content.statusCol}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {merchant.channelBindings.map((binding) => (
                        <tr key={binding.id} className="border-t border-line/70">
                          <td className="px-4 py-4 font-mono text-xs text-foreground">
                            {binding.channelCode}
                          </td>
                          <td className="px-4 py-4 text-xs text-muted">
                            {binding.merchantChannelAccount ? (
                              <>
                                <p className="text-foreground">
                                  {content.merchantInstancePrefix} · {binding.merchantChannelAccount.displayName}
                                </p>
                                <p className="mt-1 font-mono">
                                  {binding.merchantChannelAccount.callbackToken}
                                </p>
                              </>
                            ) : binding.providerAccount ? (
                              <>
                                <p className="text-[#9b3d18]">
                                  {content.legacyPrefix} · {binding.providerAccount.displayName}
                                </p>
                                <p className="mt-1">{content.migrateHint}</p>
                              </>
                            ) : (
                              content.autoRoute
                            )}
                          </td>
                          <td className="px-4 py-4 text-xs text-muted">
                            <p>{content.minAmount} {formatMoney(binding.minAmount?.toString() ?? null, "CNY", locale)}</p>
                            <p className="mt-1">{content.maxAmount} {formatMoney(binding.maxAmount?.toString() ?? null, "CNY", locale)}</p>
                          </td>
                          <td className="px-4 py-4">
                            <StatusBadge tone={binding.enabled ? "success" : "danger"}>
                              {binding.enabled ? content.enabled : content.disabled}
                            </StatusBadge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </article>
      </section>

      <section id="merchant-api-credentials" className={`${panelClass} min-w-0 p-5 sm:p-6`}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.22em] text-muted">{content.credentialsEyebrow}</p>
            <h2 className="mt-2 text-2xl font-semibold text-foreground">{content.credentialsTitle}</h2>
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
            <input type="hidden" name="redirectTo" value="/merchant" />
            <h3 className="text-lg font-semibold text-foreground">{content.createCredentialTitle}</h3>
            {!canManageCredentials ? (
              <p className="mt-3 rounded-[1rem] border border-[#f3d1ab] bg-[#fff4e7] px-4 py-3 text-sm text-[#8a4d18]">
                {content.noCredentialPermission}
              </p>
            ) : null}
            <div className="mt-4 grid gap-4">
              <LabeledField label={content.credentialLabel}>
                <input name="label" placeholder={content.credentialLabelPlaceholder} className={inputClass} />
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
                  <form
                    key={credential.id}
                    action={updateMerchantSelfServiceApiCredentialAction}
                    className="rounded-[1.25rem] border border-line bg-[#faf7f1] p-4"
                  >
                    <input type="hidden" name="id" value={credential.id} />
                    <input type="hidden" name="redirectTo" value="/merchant" />
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-foreground">{credential.label}</p>
                        <p className="mt-1 break-all font-mono text-xs text-muted">{credential.keyId}</p>
                        <p className="mt-1 text-xs text-muted">
                          {content.secretPreview}：{credential.secretPreview}
                        </p>
                      </div>
                      <StatusBadge tone={credential.enabled ? "success" : "danger"}>
                        {credential.enabled ? content.enabled : content.disabled}
                      </StatusBadge>
                    </div>
                    <div className="mt-4 grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
                      <LabeledField label={content.expiresAtLabel}>
                        <input
                          name="expiresAt"
                          type="datetime-local"
                          defaultValue={
                            credential.expiresAt
                              ? new Date(credential.expiresAt.getTime() - credential.expiresAt.getTimezoneOffset() * 60000)
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
                      <span>{content.credentialCreatedAt} {formatDateTime(credential.createdAt, locale)}</span>
                      <span>{content.credentialLastUsedAt} {formatDateTime(credential.lastUsedAt, locale)}</span>
                      <span>{content.credentialExpiresAt} {formatDateTime(credential.expiresAt, locale)}</span>
                    </div>
                    <div className="mt-4">
                      {canManageCredentials ? (
                        <button type="submit" className={actionButtonClass}>
                          {content.saveCredential}
                        </button>
                      ) : null}
                    </div>
                  </form>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      <section className={`${panelClass} min-w-0 p-5 sm:p-6`}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.22em] text-muted">{content.recentOrdersEyebrow}</p>
            <h2 className="mt-2 text-2xl font-semibold text-foreground">{content.recentOrdersTitle}</h2>
          </div>
          <div className="flex flex-col gap-3 sm:items-end">
            <p className="max-w-xl text-sm leading-7 text-muted">{content.recentOrdersDesc}</p>
            <Link href="/merchant/orders" className={secondaryActionButtonClass}>
              {content.recentOrdersButton}
            </Link>
          </div>
        </div>

        {merchant.paymentOrders.length === 0 ? (
          <div className="mt-6 rounded-[1.25rem] border border-dashed border-line p-6 text-center text-sm leading-7 text-muted">
            {content.noOrders}
          </div>
        ) : (
          <>
            <div className="mt-6 grid gap-4 md:hidden">
              {merchant.paymentOrders.map((order) => (
                <article key={order.id} className={mobileCardClass}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-foreground">{order.externalOrderId}</p>
                      <p className="mt-1 break-all font-mono text-xs text-muted">{order.id}</p>
                    </div>
                    <p className="font-mono text-[11px] text-muted">{order.channelCode}</p>
                  </div>
                  <div className="mt-4 grid gap-3">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-[11px] uppercase tracking-[0.18em] text-muted">{content.amountCol}</span>
                      <span className="text-sm font-medium text-foreground">
                        {formatMoney(order.amount.toString(), "CNY", locale)}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <StatusBadge tone={getPaymentStatusTone(order.status)}>
                        {getPaymentStatusLabel(order.status, locale)}
                      </StatusBadge>
                      <StatusBadge tone={getCallbackStatusTone(order.callbackStatus)}>
                        {getCallbackStatusLabel(order.callbackStatus, locale)}
                      </StatusBadge>
                    </div>
                    <div className="grid gap-1 text-xs text-muted">
                      <p>{content.createdPrefix} {formatDateTime(order.createdAt, locale)}</p>
                      <p>{content.paidPrefix} {formatDateTime(order.paidAt, locale)}</p>
                    </div>
                  </div>
                </article>
              ))}
            </div>
            <div className={`mt-6 hidden md:block ${tableWrapperClass}`}>
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-[#f3e7d7] text-xs uppercase tracking-[0.18em] text-muted">
                    <tr>
                      <th className="px-4 py-3">{content.orderIdCol}</th>
                      <th className="px-4 py-3">{content.channelCol}</th>
                      <th className="px-4 py-3">{content.amountCol}</th>
                      <th className="px-4 py-3">{content.paymentStatusCol}</th>
                      <th className="px-4 py-3">{content.callbackStatusCol}</th>
                      <th className="px-4 py-3">{content.timeCol}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {merchant.paymentOrders.map((order) => (
                      <tr key={order.id} className="border-t border-line/70">
                        <td className="px-4 py-4">
                          <p className="font-medium text-foreground">{order.externalOrderId}</p>
                          <p className="mt-1 font-mono text-xs text-muted">{order.id}</p>
                        </td>
                        <td className="px-4 py-4 font-mono text-xs text-foreground">
                          {order.channelCode}
                        </td>
                        <td className="px-4 py-4 text-sm text-foreground">
                          {formatMoney(order.amount.toString(), "CNY", locale)}
                        </td>
                        <td className="px-4 py-4">
                          <StatusBadge tone={getPaymentStatusTone(order.status)}>
                            {getPaymentStatusLabel(order.status, locale)}
                          </StatusBadge>
                        </td>
                        <td className="px-4 py-4">
                          <StatusBadge tone={getCallbackStatusTone(order.callbackStatus)}>
                            {getCallbackStatusLabel(order.callbackStatus, locale)}
                          </StatusBadge>
                        </td>
                        <td className="px-4 py-4 text-xs text-muted">
                          <p>{content.createdPrefix} {formatDateTime(order.createdAt, locale)}</p>
                          <p className="mt-1">{content.paidPrefix} {formatDateTime(order.paidAt, locale)}</p>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </section>

      {canReadRefunds ? (
        <section className={`${panelClass} min-w-0 p-5 sm:p-6`}>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.22em] text-muted">{content.recentRefundsEyebrow}</p>
              <h2 className="mt-2 text-2xl font-semibold text-foreground">{content.recentRefundsTitle}</h2>
            </div>
            <div className="flex flex-col gap-3 sm:items-end">
              <p className="max-w-xl text-sm leading-7 text-muted">{content.recentRefundsDesc}</p>
              <Link href="/merchant/refunds" className={secondaryActionButtonClass}>
                {content.recentRefundsButton}
              </Link>
            </div>
          </div>

          {merchant.paymentRefunds.length === 0 ? (
            <div className="mt-6 rounded-[1.25rem] border border-dashed border-line p-6 text-center text-sm leading-7 text-muted">
              {content.noRefunds}
            </div>
          ) : (
            <>
              <div className="mt-6 grid gap-4 md:hidden">
                {merchant.paymentRefunds.map((refund) => (
                  <article key={refund.id} className={mobileCardClass}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-foreground">{refund.externalRefundId}</p>
                        <p className="mt-1 break-all font-mono text-xs text-muted">{refund.id}</p>
                      </div>
                      <span className="text-xs text-muted">{refund.paymentOrder.externalOrderId}</span>
                    </div>
                    <div className="mt-4 grid gap-3">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-[11px] uppercase tracking-[0.18em] text-muted">{content.amountCol}</span>
                        <span className="text-sm font-medium text-foreground">
                          {formatMoney(refund.amount.toString(), "CNY", locale)}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <StatusBadge
                          tone={
                            refund.status === "SUCCEEDED"
                              ? "success"
                              : refund.status === "FAILED"
                                ? "danger"
                                : "warning"
                          }
                        >
                          {getRefundStatusLabel(refund.status, locale)}
                        </StatusBadge>
                      </div>
                      <p className="text-xs text-muted">{refund.providerStatus ?? content.providerPending}</p>
                      <div className="grid gap-1 text-xs text-muted">
                        <p>{content.refundCreatedPrefix} {formatDateTime(refund.createdAt, locale)}</p>
                        <p>{content.refundedPrefix} {formatDateTime(refund.refundedAt, locale)}</p>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
              <div className={`mt-6 hidden md:block ${tableWrapperClass}`}>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-left text-sm">
                    <thead className="bg-[#f3e7d7] text-xs uppercase tracking-[0.18em] text-muted">
                      <tr>
                        <th className="px-4 py-3">{content.refundIdCol}</th>
                        <th className="px-4 py-3">{content.relatedOrderCol}</th>
                        <th className="px-4 py-3">{content.amountCol}</th>
                        <th className="px-4 py-3">{content.refundStatusCol}</th>
                        <th className="px-4 py-3">{content.timeCol}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {merchant.paymentRefunds.map((refund) => (
                        <tr key={refund.id} className="border-t border-line/70">
                          <td className="px-4 py-4">
                            <p className="font-medium text-foreground">{refund.externalRefundId}</p>
                            <p className="mt-1 font-mono text-xs text-muted">{refund.id}</p>
                          </td>
                          <td className="px-4 py-4 text-xs text-muted">
                            {refund.paymentOrder.externalOrderId}
                          </td>
                          <td className="px-4 py-4 text-sm text-foreground">
                            {formatMoney(refund.amount.toString(), "CNY", locale)}
                          </td>
                          <td className="px-4 py-4">
                            <StatusBadge
                              tone={
                                refund.status === "SUCCEEDED"
                                  ? "success"
                                  : refund.status === "FAILED"
                                    ? "danger"
                                    : "warning"
                              }
                            >
                              {getRefundStatusLabel(refund.status, locale)}
                            </StatusBadge>
                            <p className="mt-1 text-xs text-muted">{refund.providerStatus ?? content.providerPending}</p>
                          </td>
                          <td className="px-4 py-4 text-xs text-muted">
                            <p>{content.refundCreatedPrefix} {formatDateTime(refund.createdAt, locale)}</p>
                            <p className="mt-1">{content.refundedPrefix} {formatDateTime(refund.refundedAt, locale)}</p>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </section>
      ) : null}
    </div>
  );
}
