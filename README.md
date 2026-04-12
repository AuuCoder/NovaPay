# NovaPay

面向正式业务场景的多商户支付网关基础工程，技术栈为 `Next.js 16 + App Router`、`TypeScript 5`、`React 19`、`Tailwind CSS 4`、`Prisma 7 (adapter-pg)`、`PostgreSQL 16`。

当前版本已包含：

- 多商户后台与商户自助门户
- 管理员账号体系、RBAC、审计日志
- 商户自注册、审核、启停用流程
- 商户自助支付通道实例与专属上游回调地址
- 商户独立 API 凭证与签名校验
- 商户 API `nonce` 防重放与 IP 白名单
- 支付通道绑定与商户实例路由
- 支付宝 `alipay.page`
- 微信支付 `wxpay.native`
- 订单创建、查询、关闭、退款、退款查询
- 商户回调重试 worker
- 对账日报、资金流水、结算单、余额快照
- OpenAPI 文档页与原始规范输出

## 安全与开源发布

如果要上传到公开 GitHub 仓库，请只发布代码框架、数据库结构和示例配置，不要上传真实环境变量、数据库导出、支付证书或商户生产数据。

公开发布前请先检查：[SECURITY.md](/Users/chole/项目/NovaPay/SECURITY.md)

## 本地开发

1. 安装依赖

```bash
npm install
```

2. 启动本地 PostgreSQL

```bash
docker compose up -d
```

3. 复制环境变量

```bash
cp .env.example .env
```

4. 至少补齐以下核心配置

```bash
DATABASE_URL="postgresql://DB_USER:DB_PASSWORD@DB_HOST:5432/DB_NAME?schema=public"
NOVAPAY_PUBLIC_BASE_URL="http://localhost:3000"
NOVAPAY_DATA_ENCRYPTION_KEY="请替换为长度足够的随机密钥"
ADMIN_BOOTSTRAP_EMAIL="admin@example.com"
ADMIN_BOOTSTRAP_PASSWORD="请替换为强密码"
ADMIN_BOOTSTRAP_NAME="Platform Administrator"
```

说明：

- `.env` 只保留平台级配置，不再填写 `ALIPAY_*` / `WXPAY_*` 这类商户支付参数
- 支付宝、微信支付参数和上游回调地址都由商户登录控制台后按通道实例维护

5. 生成 Prisma Client 并同步开发数据库

```bash
npm run db:generate
npm run db:push
```

6. 启动开发环境

```bash
npm run dev
```

7. 如需验证完整回调与财务链路，再开两个 worker

```bash
npm run callbacks:worker
npm run finance:worker
```

8. 打开系统入口

```text
http://localhost:3000/docs
http://localhost:3000/admin/login
http://localhost:3000/merchant/register
http://localhost:3000/merchant/login
```

## 生产部署

生产环境不要再使用 `db:push` 或 `migrate dev`，推荐流程：

1. 安装依赖

```bash
npm ci
```

2. 执行正式迁移

```bash
npm run db:migrate:deploy
```

3. 构建并启动应用

```bash
npm run build
npm run start
```

4. 常驻运行两个后台 worker

```bash
npm run callbacks:worker
npm run finance:worker
```

反向代理务必正确透传 `x-forwarded-for`，否则商户 API 的 IP 白名单校验无法生效。

更完整的生产说明见：[docs/production-runbook.md](/Users/chole/项目/NovaPay/docs/production-runbook.md)

## 当前接口与模块

- OpenAPI 文档页：`/docs`
- OpenAPI JSON：`/api/openapi`
- 健康检查：`GET /api/health`
- 通道列表：`GET /api/channels`
- 创建订单：`POST /api/payment-orders`
- 查询订单：`POST /api/payment-orders/{orderReference}`
- 关闭订单：`POST /api/payment-orders/{orderReference}/close`
- 创建退款：`POST /api/payment-orders/{orderReference}/refunds`
- 查询退款：`POST /api/payment-refunds/{refundReference}`
- 管理员后台：`/admin/login`
- 商户注册与门户：`/merchant/register`、`/merchant/login`

说明：

- 商户现在可以在 `/merchant/channels` 自助创建自己的支付宝或微信支付实例
- 每个商户通道实例都会生成专属上游回调地址和 `callbackToken` 特征码
- 支付机构回调地址不是固定公共地址，而是按商户实例动态生成，例如 `/api/payments/callback/alipay/{accountId}/{token}`
- 订单与退款接口响应会返回 `merchantChannelAccountId` 与 `channelAccountSource`
- 旧版 `/api/payments/...` 动作型路径继续兼容，但新接入建议统一使用 REST 风格路径

## 商户下单签名

商户调用 `POST /api/payment-orders` 时，必须使用独立 API 凭证，并带上以下请求头：

- `x-novapay-key`
- `x-novapay-timestamp`
- `x-novapay-nonce`
- `x-novapay-signature`
- `Idempotency-Key`（写接口强烈建议传入，用于安全重试）

签名算法：

```text
hex(hmac_sha256(apiSecret, "{timestamp}.{nonce}.{rawBody}"))
```

请求体示例：

```json
{
  "merchantCode": "merchant-prod-cn-001",
  "channelCode": "alipay.page",
  "externalOrderId": "ORDER-20260410-001",
  "amount": "88.00",
  "subject": "NovaPay Production Order",
  "description": "Alipay page payment"
}
```

说明：

- 商户必须已审核通过，才允许正式创建订单
- `x-novapay-nonce` 必须单次请求唯一，重复使用会被直接拒绝
- 商户不需要也不能传 `notifyUrl`，支付机构回调地址由系统根据商户通道实例自动分配
- 如需覆盖商户业务回调，请使用 `callbackUrl`
- `alipay.page` 返回跳转支付地址
- `wxpay.native` 返回 `checkoutUrl` 与 `providerPayload.codeUrl`，前端需自行渲染二维码
- 为避免支付宝长链接被中间页截断，响应中还会返回 `hostedCheckoutUrl`
- 订单与退款响应已包含 `feeRate`、`feeAmount`、`netAmount` 等财务快照字段

更完整的签名与 `curl` 示例见：[docs/merchant-integration-examples.md](/Users/chole/项目/NovaPay/docs/merchant-integration-examples.md)

## 管理后台与商户后台

后台使用管理员会话登录。

管理员职责：

- 审核商户注册申请
- 审核与检查商户通道实例、维护通道路由
- 管理商户 API 凭证
- 查看订单、回调、审计日志
- 查看对账、资金流水、结算单与余额快照

商户职责：

- 自助注册与登录
- 自助录入支付宝或微信支付参数
- 维护企业资料、回调地址与 API 白名单
- 查看自身订单与退款
- 管理自己的 API 凭证接入服务端
- 管理自己的支付通道实例、默认实例与专属回调地址

注意：

- NovaPay 不提供平台代收款账号
- 新订单只能走商户自己的 `MerchantChannelAccount`
- 商户支付参数不再通过平台 `.env` 统一注入，联调前请先在商户后台创建并启用通道实例
- 如历史数据仍存在平台账号绑定，请在后台绑定页迁移为商户自有实例

## 测试与常用命令

```bash
npm run dev
npm run build
npm run lint
npm run test
npm run db:generate
npm run db:push
npm run db:migrate
npm run db:migrate:deploy
npm run db:status
npm run db:studio
npm run callbacks:retry-once
npm run callbacks:worker
npm run finance:sync-once
npm run finance:worker
```

## 参考文档

- 生产部署：[docs/production-runbook.md](/Users/chole/项目/NovaPay/docs/production-runbook.md)
