# Merchant Integration Examples

## Create Order Signature

商户创建订单时，请使用独立 API 凭证生成签名：

```text
hex(hmac_sha256(apiSecret, "{timestamp}.{nonce}.{rawBody}"))
```

示例请求体：

```json
{"merchantCode":"merchant-prod-cn-001","channelCode":"alipay.page","externalOrderId":"ORDER-20260410-001","amount":"88.00","subject":"NovaPay Production Order","description":"Alipay page payment"}
```

说明：

- 商户不需要也不能传 `notifyUrl`
- 支付机构回调地址由 NovaPay 根据当前商户通道实例自动分配
- 不要在平台 `.env` 中填写 `ALIPAY_*` / `WXPAY_*` 商户支付参数，改为在商户控制台的通道实例里维护
- 商户自己的业务通知地址建议配置在商户资料的“默认业务回调地址”，单笔订单如需覆盖可传 `callbackUrl`
- `returnUrl` 只用于支付完成后的浏览器跳转；如不传，系统默认回到 NovaPay 托管结果页
- 最终支付结果请以 NovaPay 的业务回调或主动查单结果为准，不要只依赖浏览器跳回

示例命令：

```bash
RAW_BODY='{"merchantCode":"merchant-prod-cn-001","channelCode":"alipay.page","externalOrderId":"ORDER-20260410-001","amount":"88.00","subject":"NovaPay Production Order","description":"Alipay page payment"}'
TIMESTAMP="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
NONCE="order_$(date +%s)_$(openssl rand -hex 4)"
API_KEY="你的商户API Key"
API_SECRET="你的商户API Secret"
IDEMPOTENCY_KEY="order_20260410_001"
SIGNATURE="$(node -e 'const crypto=require("node:crypto"); const [timestamp, nonce, body, secret] = process.argv.slice(1); process.stdout.write(crypto.createHmac("sha256", secret).update(`${timestamp}.${nonce}.${body}`).digest("hex"));' "$TIMESTAMP" "$NONCE" "$RAW_BODY" "$API_SECRET")"

curl -X POST "http://localhost:3000/api/payment-orders" \
  -H "content-type: application/json" \
  -H "x-novapay-key: $API_KEY" \
  -H "x-novapay-timestamp: $TIMESTAMP" \
  -H "x-novapay-nonce: $NONCE" \
  -H "x-novapay-signature: $SIGNATURE" \
  -H "Idempotency-Key: $IDEMPOTENCY_KEY" \
  --data-raw "$RAW_BODY"
```

说明补充：

- `x-novapay-nonce` 用于防重放，每次请求都应重新生成
- `Idempotency-Key` 用于业务安全重试；同一业务重试时应保持不变

## Verify Merchant Callback

NovaPay 回调商户时使用 `notifySecret` 进行签名：

```text
hex(hmac_sha256(notifySecret, "{timestamp}.{rawBody}"))
```

商户服务端应校验：

1. `x-novapay-timestamp` 在允许的时间窗口内
2. `x-novapay-signature` 与本地重算值一致
3. 校验通过后再信任回调内容

本地验证示例：

```bash
CALLBACK_BODY='{"event":"payment.order.updated","orderId":"pay_xxx","status":"PAID"}'
TIMESTAMP="2026-04-10T12:00:00Z"
NOTIFY_SECRET="你的notifySecret"
RECEIVED_SIGNATURE="回调请求头里的x-novapay-signature"
EXPECTED_SIGNATURE="$(node -e 'const crypto=require("node:crypto"); const [timestamp, body, secret] = process.argv.slice(1); process.stdout.write(crypto.createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex"));' "$TIMESTAMP" "$CALLBACK_BODY" "$NOTIFY_SECRET")"

test "$EXPECTED_SIGNATURE" = "$RECEIVED_SIGNATURE" && echo "valid" || echo "invalid"
```

## WeChat Pay Native

`wxpay.native` 已接入真实微信支付 API v3：

- 下单实现：[lib/payments/providers/wxpay-native.ts](/Users/chole/项目/NovaPay/lib/payments/providers/wxpay-native.ts)
- 回调入口按商户实例动态生成，例如 `/api/payments/callback/wxpay/{accountId}/{token}`
- 商户自己的 `appId`、商户号、API v3 Key、平台公钥等参数都应填写在当前通道实例配置里，而不是平台环境变量

订单创建成功后会返回：

- `paymentMode: "qr_code"`
- `checkoutUrl`
- `providerPayload.codeUrl`

前端拿到 `codeUrl` 后，需要自行渲染二维码给用户扫码支付。
