/**
 * NovaPay merchant SDK client used by the Registry to dogfood its own
 * payment infrastructure (Req 13.1, 13.2).
 *
 * The Registry registers itself as a NovaPay merchant. When a developer
 * marks a plugin as PAID, customers go through:
 *   1. Registry creates an Order
 *   2. Registry calls NovaPay openapi to create a payment order
 *   3. Customer completes payment on NovaPay
 *   4. NovaPay posts a signed callback to the Registry
 *   5. Registry validates the callback signature, marks Order.state=PAID,
 *      and triggers License issuance
 *
 * Phase 3 keeps this as a thin client that talks HTTP and HMAC-SHA256-signs
 * outgoing requests using the merchant secret. Production callers must store
 * the secret via Vault/KMS, not in plaintext env vars.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

export interface NovaPayClientConfig {
  baseUrl: string;
  merchantId: string;
  apiKeyId: string;
  apiKeySecret: string;
}

export interface CreateOrderInput {
  externalOrderId: string;
  amountCents: number;
  currency: string;
  subject: string;
  channelCode?: string;
  callbackUrl: string;
  returnUrl?: string;
  metadata?: Record<string, unknown>;
}

export interface CreateOrderResult {
  novapayOrderId: string;
  checkoutUrl: string;
  status: string;
}

export interface CallbackPayload {
  externalOrderId: string;
  novapayOrderId: string;
  status: "PAID" | "FAILED" | "CANCELLED" | "REFUNDED";
  amountCents: number;
  paidAt?: string;
  signature: string;
  timestamp: string;
}

export class NovaPayClient {
  constructor(private readonly config: NovaPayClientConfig) {}

  private signRequest(method: string, path: string, body: string, timestamp: string) {
    const stringToSign = `${method}\n${path}\n${timestamp}\n${body}`;
    return createHmac("sha256", this.config.apiKeySecret)
      .update(stringToSign)
      .digest("hex");
  }

  async createPaymentOrder(input: CreateOrderInput): Promise<CreateOrderResult> {
    const path = "/openapi/v1/payment-orders";
    const body = JSON.stringify({
      external_order_id: input.externalOrderId,
      amount: input.amountCents,
      currency: input.currency,
      subject: input.subject,
      channel_code: input.channelCode,
      callback_url: input.callbackUrl,
      return_url: input.returnUrl,
      metadata: input.metadata ?? {},
    });
    const timestamp = new Date().toISOString();
    const signature = this.signRequest("POST", path, body, timestamp);

    const response = await fetch(`${this.config.baseUrl}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-NovaPay-Merchant-Id": this.config.merchantId,
        "X-NovaPay-Key-Id": this.config.apiKeyId,
        "X-NovaPay-Timestamp": timestamp,
        "X-NovaPay-Signature": signature,
      },
      body,
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `NovaPay createPaymentOrder failed: ${response.status} ${errorText}`,
      );
    }

    const data = (await response.json()) as {
      novapay_order_id: string;
      checkout_url: string;
      status: string;
    };

    return {
      novapayOrderId: data.novapay_order_id,
      checkoutUrl: data.checkout_url,
      status: data.status,
    };
  }

  /**
   * Verifies the HMAC signature on an incoming callback payload. Uses
   * timing-safe comparison to avoid leaking the secret via response time
   * differences.
   */
  verifyCallbackSignature(payload: Omit<CallbackPayload, "signature">, signature: string): boolean {
    const path = "/registry/payments/callback"; // canonical path
    const body = JSON.stringify(payload);
    const expected = this.signRequest("POST", path, body, payload.timestamp);

    try {
      const expectedBuf = Buffer.from(expected, "hex");
      const providedBuf = Buffer.from(signature, "hex");
      if (expectedBuf.length !== providedBuf.length) return false;
      return timingSafeEqual(expectedBuf, providedBuf);
    } catch {
      return false;
    }
  }
}
