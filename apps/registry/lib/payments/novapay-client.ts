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

  private signRequest(rawBody: string, timestamp: string, nonce: string) {
    return createHmac("sha256", this.config.apiKeySecret)
      .update(`${timestamp}.${nonce}.${rawBody}`)
      .digest("hex");
  }

  async createPaymentOrder(input: CreateOrderInput): Promise<CreateOrderResult> {
    const path = "/api/payment-orders";
    const body = JSON.stringify({
      merchantCode: this.config.merchantId,
      externalOrderId: input.externalOrderId,
      amount: (input.amountCents / 100).toFixed(2),
      currency: "CNY",
      subject: input.subject,
      channelCode: input.channelCode,
      callbackUrl: input.callbackUrl,
      returnUrl: input.returnUrl,
      metadata: input.metadata ?? {},
    });
    const timestamp = new Date().toISOString();
    const nonce = `registry_${Date.now().toString(36)}`;
    const signature = this.signRequest(body, timestamp, nonce);

    const response = await fetch(`${this.config.baseUrl}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-novapay-key": this.config.apiKeyId,
        "x-novapay-timestamp": timestamp,
        "x-novapay-nonce": nonce,
        "x-novapay-signature": signature,
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
      order: {
        id: string;
        hostedCheckoutUrl: string | null;
        status: string;
      };
    };

    return {
      novapayOrderId: data.order.id,
      checkoutUrl: data.order.hostedCheckoutUrl ?? `${this.config.baseUrl}/pay/${data.order.id}`,
      status: data.order.status,
    };
  }

  /**
   * Verifies the HMAC signature on an incoming callback payload. Uses
   * timing-safe comparison to avoid leaking the secret via response time
   * differences.
   */
  verifyCallbackSignature(payload: Omit<CallbackPayload, "signature">, signature: string): boolean {
    const body = JSON.stringify(payload);
    const expected = createHmac("sha256", this.config.apiKeySecret)
      .update(`${payload.timestamp}.${body}`)
      .digest("hex");

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
