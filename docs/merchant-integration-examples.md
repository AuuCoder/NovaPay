# Merchant Integration Examples

商户接入 NovaPay 时的核心流程：拿到 API Key / Secret → 在自己服务里生成签名 → 调 `POST /api/payment-orders` → 处理 NovaPay 的业务回调 → 必要时主动查单。

下面给出最小可运行的端到端示例。

---

## 1. 创建订单签名

商户创建订单时使用专属 API 凭证生成签名：

```text
hex(hmac_sha256(apiSecret, "{timestamp}.{nonce}.{rawBody}"))
```

请求体保持单行 JSON 不要含多余空白；timestamp、nonce、rawBody 三段必须和参与签名时完全一致。

示例请求体：

```json
{"merchantCode":"merchant-prod-cn-001","channelCode":"alipay.page","externalOrderId":"ORDER-20260410-001","amount":"88.00","subject":"NovaPay Production Order","description":"Alipay page payment"}
```

接口行为说明：

- 商户不需要也不能传 `notifyUrl`
- 上游支付机构回调地址由 NovaPay 根据当前商户通道实例自动分配
- 不要在平台 `.env` 中填写 `ALIPAY_*` / `WXPAY_*` 商户支付参数，改为在商户控制台的通道实例里维护
- 商户业务回调地址建议配置在「默认业务回调」上；单笔订单需要覆盖时传 `callbackUrl`
- `returnUrl` 只用于浏览器跳回；不传时使用 NovaPay 的托管结果页
- 最终结果以 NovaPay 的业务回调或主动查单为准，不要只看浏览器跳回

完整示例命令：

```bash
RAW_BODY='{"merchantCode":"merchant-prod-cn-001","channelCode":"alipay.page","externalOrderId":"ORDER-20260410-001","amount":"88.00","subject":"NovaPay Production Order","description":"Alipay page payment"}'
TIMESTAMP="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
NONCE="order_$(date +%s)_$(openssl rand -hex 4)"
API_KEY="你的商户API Key"
API_SECRET="你的商户API Secret"
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

补充说明：

- `x-novapay-nonce` 用于防重放，每次请求都应重新生成
- `Idempotency-Key` 用于业务安全重试；同一业务重试时应保持不变
- 本地开发把 URL 换成 `http://localhost:3000`，生产换成商户接入文档里给的真实域名

---

## 2. 各通道下单要点

### 支付宝网页支付（`alipay.page`）

- 响应里 `paymentMode` 为 `redirect`、`checkoutUrl` 是支付宝收银台地址
- 用户在支付宝完成支付后会跳回 `returnUrl`（默认是 NovaPay 托管页）
- 异步通知由支付宝直接发到 `/api/payments/callback/alipay/{accountId}/{token}`，验签后由 NovaPay 转发给商户

商户后台在通道实例里需要填写：

- `appId`
- `应用私钥`
- `支付宝公钥`

### 微信 Native 扫码支付（`wxpay.native`）

- 已接入真实微信支付 API v3：参考 [`lib/payments/providers/wxpay-native.ts`](../lib/payments/providers/wxpay-native.ts)
- 响应里 `paymentMode` 为 `qr_code`、`checkoutUrl` 和 `providerPayload.codeUrl` 都是同一个 `weixin://` 链接
- 前端拿到 `codeUrl` 后自行渲染二维码给用户扫码
- 回调入口按通道实例动态生成：`/api/payments/callback/wxpay/{accountId}/{token}`

商户后台在通道实例里需要填写：

- `appId`
- 商户号
- 商户证书序列号
- API v3 Key
- 平台公钥

### USDT 链上支付（`usdt.bsc` / `usdt.base` / `usdt.sol`）

把 `channelCode` 改成具体链路：

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

响应除常规字段外重点关注：

- `hostedCheckoutUrl`：NovaPay 托管支付页地址
- `payableAmount`：本次应付的精确 USDT 金额
- `payableCurrency`：通常为 `USDT`
- `quoteRate`：本次锁定的 USDT/CNY 汇率
- `quoteSource`：汇率来源（CoinGecko / CoinPaprika / 固定回退）
- `quoteExpiresAt`：报价失效时间
- `providerPayload.receivingAddress`：本次收款地址
- `providerPayload.networkLabel`：链路名称

商户接入注意：

1. 页面必须引导用户按「精确金额 + 正确链路」付款
2. 最终结果以 NovaPay 回调或主动查单为准，不要只看钱包是否广播
3. 同一商户支持多条 `usdt.*` 时前端可合并为一个「USDT」分组，但下单 `channelCode` 必须是具体链路
4. 商户的 USDT 收款地址在商户控制台的通道实例里维护，不要在 `.env` 里
5. 平台必须运行 `onchain-worker`，否则到账无法自动匹配

---

## 3. 验证 NovaPay 业务回调

NovaPay 回调商户时使用 `notifySecret` 签名：

```text
hex(hmac_sha256(notifySecret, "{timestamp}.{rawBody}"))
```

商户服务端校验顺序：

1. `x-novapay-timestamp` 是否在允许时间窗口（默认 5 分钟，可由 `MERCHANT_SIGNATURE_MAX_AGE_SECONDS` 调整）
2. `x-novapay-signature` 是否与本地重算结果一致
3. 验签通过后再信任回调内容

本地验证示例：

```bash
CALLBACK_BODY='{"event":"payment.order.updated","orderId":"pay_xxx","status":"PAID"}'
TIMESTAMP="2026-04-10T12:00:00Z"
NOTIFY_SECRET="你的notifySecret"
RECEIVED_SIGNATURE="回调请求头里的x-novapay-signature"
EXPECTED_SIGNATURE="$(node -e 'const crypto=require("node:crypto"); const [timestamp, body, secret] = process.argv.slice(1); process.stdout.write(crypto.createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex"));' "$TIMESTAMP" "$CALLBACK_BODY" "$NOTIFY_SECRET")"

test "$EXPECTED_SIGNATURE" = "$RECEIVED_SIGNATURE" && echo "valid" || echo "invalid"
```

回调送达策略：

- 失败会按指数退避重试，最多 `CALLBACK_MAX_ATTEMPTS` 次（默认 6）
- 单次超时 `CALLBACK_TIMEOUT_MS`（默认 10s）
- 重试间隔 `CALLBACK_RETRY_INTERVAL_SECONDS`（默认 60s）
- 必须运行 `callbacks-worker` 进程才会有重试

商户业务侧应当：

- 处理同一笔订单的重复回调（用 `orderId` + `status` 做幂等）
- 收到 `2xx` 才算消费成功；其他状态码或非 `success` 文本会触发重试

---

## 4. 主动查单（强烈建议）

不要只依赖回调。每次需要确认状态时主动查一下：

```bash
curl -X POST "https://pay.example.com/api/payment-orders/ORDER-20260410-001" \
  -H "content-type: application/json" \
  -H "x-novapay-key: $API_KEY" \
  -H "x-novapay-timestamp: $TIMESTAMP" \
  -H "x-novapay-nonce: $NONCE" \
  -H "x-novapay-signature: $SIGNATURE" \
  --data-raw '{"merchantCode":"merchant-prod-cn-001"}'
```

返回最新状态，包括上游交易号、支付时间、退款记录等。

---

## 5. 退款

```json
POST /api/payment-orders/{orderReference}/refunds
{
  "merchantCode": "merchant-prod-cn-001",
  "refundReference": "REFUND-20260410-001",
  "amount": "20.00",
  "reason": "user requested"
}
```

注意：

- `amount` 不能超过订单可退余额
- `refundReference` 必须唯一（同一商户内）
- 退款回调走的也是同一套业务回调通道，但 `event` 会变成 `payment.refund.updated`

---

## 6. 完整 SDK 思路（伪代码）

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

可参考：

- 已有 [Registry → NovaPay client](../apps/registry/lib/payments/novapay-client.ts) 的实现思路
- OpenAPI 规范：`http://localhost:3000/api/openapi`

---

## 7. 故障排查清单

- **签名失败**：检查 `timestamp` 是否 ISO 格式、`rawBody` 是否原始字符串（不要重新 stringify）
- **403 IP 拒绝**：检查商户 IP 白名单 + 反向代理是否透传 `x-forwarded-for`
- **422 渠道未配置**：商户在控制台没有创建对应 `channelCode` 的通道实例
- **422 渠道未启用**：通道实例存在但 `enabled=false`，或 binding 被关掉
- **回调没收到**：`callbacks-worker` 没运行 / 商户回调返回非 2xx / 防火墙拦截
- **USDT 不到账**：`onchain-worker` 没运行 / 链 RPC 异常 / 用户付款金额不精确

更多排查项见 [`docs/production-runbook.md`](./production-runbook.md)。
