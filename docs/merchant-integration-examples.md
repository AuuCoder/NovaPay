[简体中文](./merchant-integration-examples.zh-CN.md)

# Merchant Integration Examples

Core integration flow: receive an API Key / Secret → sign the request body in your service → call `POST /api/payment-orders` → handle NovaPay's business callback → poll the order on demand.

The minimum end-to-end example follows.

---

## 1. Order signature

Sign the request with the merchant's API Secret:

```text
hex(hmac_sha256(apiSecret, "{timestamp}.{nonce}.{rawBody}"))
```

The body must be a single-line JSON without extra whitespace; the same `timestamp`, `nonce`, and `rawBody` you used for signing must be sent verbatim.

Sample body:

```json
{"merchantCode":"merchant-prod-cn-001","channelCode":"alipay.page","externalOrderId":"ORDER-20260410-001","amount":"88.00","subject":"NovaPay Production Order","description":"Alipay page payment"}
```

Behaviour notes:

- Merchants do not need to and must not send `notifyUrl`
- Upstream callback URLs are auto-generated per channel instance
- Do not put `ALIPAY_*` / `WXPAY_*` credentials into the platform `.env` — manage them inside the merchant channel instance
- Configure the merchant business callback in the profile under "Default callback URL"; per-order overrides go in `callbackUrl`
- `returnUrl` only controls the browser bounce; if omitted, NovaPay's hosted return page is used
- The authoritative source of truth is the NovaPay business callback or active polling — never the browser bounce alone

Full example:

```bash
RAW_BODY='{"merchantCode":"merchant-prod-cn-001","channelCode":"alipay.page","externalOrderId":"ORDER-20260410-001","amount":"88.00","subject":"NovaPay Production Order","description":"Alipay page payment"}'
TIMESTAMP="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
NONCE="order_$(date +%s)_$(openssl rand -hex 4)"
API_KEY="your_merchant_api_key"
API_SECRET="your_merchant_api_secret"
IDEMPOTENCY_KEY="order_20260410_001"
SIGNATURE="$(node -e 'const crypto=require("node:crypto"); const [timestamp, nonce, body, secret] = process.argv.slice(1); process.stdout.write(crypto.createHmac("sha256", secret).update(`${timestamp}.${nonce}.${body}`).digest("hex"));' "$TIMESTAMP" "$NONCE" "$RAW_BODY" "$API_SECRET")"

curl -X POST "https://pay.example.com/api/payment-orders" \
  -H "content-type: application/json" \
  -H "x-novapay-key: $API_KEY" \
  -H "x-novapay-timestamp: $TIMESTAMP" \
  -H "x-novapay-nonce: $NONCE" \
  -H "x-novapay-signature: $SIGNATURE" \
  -H "Idempotency-Key: $IDEMPOTENCY_KEY" \
  --data-raw "$RAW_BODY"
```

Notes:

- `x-novapay-nonce` is a replay guard; regenerate it for every request
- `Idempotency-Key` enables safe retries; keep it stable for the same business order
- Use `http://localhost:3000` for local dev; for production, use the URL provided in your merchant onboarding doc

---

## 2. Channel-specific notes

### Alipay web payment (`alipay.page`)

- Response carries `paymentMode: "redirect"` and `checkoutUrl` pointing to the Alipay cashier
- Browser bounces back to `returnUrl` (defaults to NovaPay's hosted return page)
- Async notifications hit `/api/payments/callback/alipay/{accountId}/{token}`; NovaPay verifies signatures and forwards to the merchant

The merchant channel instance must contain:

- `appId`
- Application private key
- Alipay public key

### WeChat Pay Native QR (`wxpay.native`)

- Wired against the real WeChat Pay v3 API; see [`lib/payments/providers/wxpay-native.ts`](../lib/payments/providers/wxpay-native.ts)
- Response: `paymentMode: "qr_code"`, `checkoutUrl` and `providerPayload.codeUrl` are both the same `weixin://` URL
- The frontend renders that URL as a QR code
- Callback path: `/api/payments/callback/wxpay/{accountId}/{token}`

The merchant channel instance must contain:

- `appId`
- Merchant ID
- Merchant certificate serial number
- API v3 key
- Platform public key

### USDT on-chain (`usdt.bsc` / `usdt.base` / `usdt.sol`)

Set `channelCode` to a specific chain:

```json
{
  "merchantCode": "merchant-prod-cn-001",
  "channelCode": "usdt.bsc",
  "externalOrderId": "ORDER-20260418-001",
  "amount": "88.00",
  "subject": "NovaPay USDT Order",
  "description": "USDT on BSC"
}
```

Beyond the standard fields, watch:

- `hostedCheckoutUrl` — NovaPay's hosted on-chain checkout page
- `payableAmount` — the exact USDT amount the buyer must transfer
- `payableCurrency` — typically `USDT`
- `quoteRate` — locked USDT/CNY rate
- `quoteSource` — rate origin (CoinGecko / CoinPaprika / fallback)
- `quoteExpiresAt` — quote validity
- `providerPayload.receivingAddress` — the receiving address
- `providerPayload.networkLabel` — chain label

Integration tips:

1. The frontend must walk the user through the exact-amount + correct-chain flow
2. Trust NovaPay callbacks or polling, not "wallet broadcasted"
3. If the merchant supports multiple `usdt.*` chains, the frontend may show a single `USDT` group, but the order must carry the specific `channelCode`
4. USDT receiving addresses live in the merchant channel instance, not in `.env`
5. The platform must run `onchain-worker`, otherwise deposits never match

---

## 3. Verifying the NovaPay business callback

NovaPay signs callbacks with `notifySecret`:

```text
hex(hmac_sha256(notifySecret, "{timestamp}.{rawBody}"))
```

Verification order on the merchant side:

1. `x-novapay-timestamp` is within the allowed window (default 5 min, tunable via `MERCHANT_SIGNATURE_MAX_AGE_SECONDS`)
2. `x-novapay-signature` matches the locally recomputed value
3. Only after both checks succeed should you trust the body

Local verification example:

```bash
CALLBACK_BODY='{"event":"payment.order.updated","orderId":"pay_xxx","status":"PAID"}'
TIMESTAMP="2026-04-10T12:00:00Z"
NOTIFY_SECRET="your_notify_secret"
RECEIVED_SIGNATURE="value of x-novapay-signature header"
EXPECTED_SIGNATURE="$(node -e 'const crypto=require("node:crypto"); const [timestamp, body, secret] = process.argv.slice(1); process.stdout.write(crypto.createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex"));' "$TIMESTAMP" "$CALLBACK_BODY" "$NOTIFY_SECRET")"

test "$EXPECTED_SIGNATURE" = "$RECEIVED_SIGNATURE" && echo "valid" || echo "invalid"
```

Delivery semantics:

- Failed deliveries retry with exponential backoff up to `CALLBACK_MAX_ATTEMPTS` (default 6)
- Per-attempt timeout: `CALLBACK_TIMEOUT_MS` (default 10s)
- Retry interval seed: `CALLBACK_RETRY_INTERVAL_SECONDS` (default 60s)
- Requires `callbacks-worker` running

The merchant should:

- De-duplicate by `orderId` + `status` (callbacks may arrive multiple times)
- Return `2xx` only on successful processing; anything else triggers retries

---

## 4. Active polling (recommended)

Don't rely on callbacks alone. Poll whenever you need to confirm:

```bash
curl -X POST "https://pay.example.com/api/payment-orders/ORDER-20260410-001" \
  -H "content-type: application/json" \
  -H "x-novapay-key: $API_KEY" \
  -H "x-novapay-timestamp: $TIMESTAMP" \
  -H "x-novapay-nonce: $NONCE" \
  -H "x-novapay-signature: $SIGNATURE" \
  --data-raw '{"merchantCode":"merchant-prod-cn-001"}'
```

Returns the latest state, upstream transaction id, paid-at, and refund history.

---

## 5. Refunds

```json
POST /api/payment-orders/{orderReference}/refunds
{
  "merchantCode": "merchant-prod-cn-001",
  "refundReference": "REFUND-20260410-001",
  "amount": "20.00",
  "reason": "user requested"
}
```

Notes:

- `amount` cannot exceed the refundable balance
- `refundReference` must be unique per merchant
- Refund callbacks reuse the same business callback channel but with `event: "payment.refund.updated"`

---

## 6. SDK shape (pseudo-code)

```ts
class NovaPayClient {
  constructor(opts: {
    baseUrl: string;
    merchantCode: string;
    apiKey: string;
    apiSecret: string;
    notifySecret: string;
  }) { ... }

  async createOrder(input: CreateOrderInput) {
    const body = JSON.stringify(input);
    const timestamp = new Date().toISOString();
    const nonce = randomNonce();
    const signature = hmacSha256Hex(this.apiSecret, `${timestamp}.${nonce}.${body}`);
    return fetchJson(this.baseUrl + "/api/payment-orders", { method: "POST", headers: signedHeaders(...), body });
  }

  verifyCallback(rawBody: string, headers: Headers): boolean {
    const ts = headers.get("x-novapay-timestamp");
    const sig = headers.get("x-novapay-signature");
    if (Math.abs(Date.now()/1000 - Date.parse(ts)/1000) > 300) return false;
    const expected = hmacSha256Hex(this.notifySecret, `${ts}.${rawBody}`);
    return timingSafeEqual(expected, sig);
  }
}
```

References:

- The Registry's own [NovaPay client](../apps/registry/lib/payments/novapay-client.ts)
- The OpenAPI spec at `http://localhost:3000/api/openapi`

---

## 7. Troubleshooting checklist

- **Signature failure** — check that `timestamp` is ISO 8601 and the `rawBody` you signed is byte-for-byte the body you send (don't `JSON.stringify` again)
- **403 IP rejected** — verify the merchant's IP allowlist; make sure the reverse proxy forwards `x-forwarded-for`
- **422 channel not configured** — the merchant has not created a channel instance for the requested `channelCode`
- **422 channel disabled** — the channel exists but is disabled, or its binding is off
- **Callback never arrives** — `callbacks-worker` not running / merchant returns non-2xx / firewall drops
- **USDT deposit not credited** — `onchain-worker` not running / RPC outage / amount mismatch (must be exact)

For deeper troubleshooting see [`docs/production-runbook.md`](./production-runbook.md).
