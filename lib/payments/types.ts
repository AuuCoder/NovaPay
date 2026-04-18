import type { Merchant } from "@/generated/prisma/client";

export type PaymentChannelCode =
  | "alipay.page"
  | "wxpay.native"
  | "usdt.bsc"
  | "usdt.base"
  | "usdt.sol";

export type PaymentCapability =
  | "page_redirect"
  | "native_qr"
  | "notify_callback"
  | "return_url"
  | "quote_lock"
  | "rsa2_signature"
  | "order_query"
  | "order_close"
  | "refund"
  | "refund_query";

export interface PaymentChannelSummary {
  code: PaymentChannelCode;
  provider: "alipay" | "wxpay" | "crypto";
  displayName: string;
  description: string;
  configured: boolean;
  implementationStatus?: "ready" | "skeleton";
  capabilities: PaymentCapability[];
}

export interface ProviderAccountConfig {
  id: string;
  providerKey: string;
  channelCode: string;
  displayName: string;
  sourceType?: "merchant";
  merchantId?: string | null;
  callbackToken?: string | null;
  config: Record<string, string>;
  limits?: Record<string, unknown> | null;
}

export interface CreatePaymentInput {
  orderId: string;
  merchant: Pick<Merchant, "id" | "code" | "name" | "callbackBase">;
  amount: string;
  currency: string;
  subject: string;
  clientIp?: string | null;
  description?: string | null;
  notifyUrl?: string | null;
  returnUrl?: string | null;
  expireAt?: Date | null;
  metadata?: Record<string, unknown>;
  account?: ProviderAccountConfig | null;
}

export interface PaymentOperationInput {
  orderId: string;
  gatewayOrderId?: string | null;
  merchant: Pick<Merchant, "id" | "code" | "name" | "callbackBase">;
  amount: string;
  currency: string;
  subject: string;
  description?: string | null;
  metadata?: Record<string, unknown>;
  account?: ProviderAccountConfig | null;
}

export interface CreateRefundInput extends PaymentOperationInput {
  refundId: string;
  refundAmount: string;
  reason?: string | null;
}

export interface QueryRefundInput extends PaymentOperationInput {
  refundId: string;
  gatewayRefundId?: string | null;
}

export type CreatePaymentMode = "redirect" | "qr_code";

export interface CreatePaymentResult {
  status: "requires_action" | "processing";
  mode: CreatePaymentMode;
  checkoutUrl: string;
  gatewayOrderId?: string | null;
  providerStatus?: string | null;
  providerPayload: Record<string, unknown>;
}

export interface PaymentNotification {
  orderId: string;
  gatewayOrderId?: string | null;
  providerStatus: string;
  amount?: string;
  paidAt?: Date | null;
  succeeds: boolean;
  rawPayload: Record<string, unknown>;
}

export interface PaymentRefundNotification {
  orderId: string;
  refundId: string;
  gatewayOrderId?: string | null;
  gatewayRefundId?: string | null;
  providerStatus: string;
  amount?: string;
  refundedAt?: Date | null;
  succeeds: boolean;
  rawPayload: Record<string, unknown>;
}

export interface PaymentProvider {
  getSummary(): PaymentChannelSummary;
  isConfigured(account?: ProviderAccountConfig | null): boolean;
  createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult>;
  queryPayment?(input: PaymentOperationInput): Promise<PaymentNotification>;
  closePayment?(input: PaymentOperationInput): Promise<PaymentNotification>;
  createRefund?(input: CreateRefundInput): Promise<PaymentRefundNotification>;
  queryRefund?(input: QueryRefundInput): Promise<PaymentRefundNotification>;
  parseNotification?(
    params: Record<string, unknown>,
    account?: ProviderAccountConfig | null,
  ): PaymentNotification;
}
