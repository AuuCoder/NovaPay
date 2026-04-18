# NovaPay

NovaPay 是一个面向正式业务场景的多商户支付网关与托管收银台。  
NovaPay is a multi-merchant payment gateway and hosted checkout system designed for production-grade business workflows.

它的目标不是做“平台统一代收款”，而是让每个商户维护自己的支付宝、微信支付等上游参数，由平台提供统一的订单 API、签名验证、回调路由、退款能力、后台管理与审计能力。  
Its goal is not to act as a single pooled platform wallet. Instead, each merchant manages its own upstream payment credentials while the platform provides a unified order API, request signing, callback routing, refund support, admin tooling, and auditability.

## 项目定位 / What NovaPay Is

NovaPay 适合这些场景：  
NovaPay is a good fit for:

- 多商户平台  
  Multi-merchant platforms
- 商户自有支付参数、自有回调、自有 API 凭证  
  Merchant-owned payment credentials, callbacks, and API credentials
- 平台希望统一支付接口，但不希望把所有商户塞进一套共享收款账号  
  Platforms that want one unified payment API without forcing every merchant into a shared collection account
- 商城、SaaS、数字商品系统需要独立的支付中台  
  Commerce, SaaS, or digital goods systems that need an independent payment layer

如果把整套系统拆开来看：  
If you view the whole stack as separate systems:

- `NovaPay` 负责支付网关、签名 API、通道实例、回调、退款、财务流水  
  `NovaPay` owns the payment gateway, signed APIs, channel instances, callbacks, refunds, and payment operations
- `NoveShop` 负责商品、店铺、订单、库存和自动发卡  
  `NoveShop` owns products, storefronts, orders, inventory, and digital fulfillment

## 当前能力 / Current Capabilities

- 管理员后台与商户自助门户  
  Admin console and merchant self-service console
- 管理员账号体系、商户审核、RBAC、审计日志  
  Admin accounts, merchant approval flow, RBAC, and audit logs
- 商户自助创建支付通道实例与专属上游回调地址  
  Merchant-managed payment channel instances with dedicated upstream callback URLs
- 商户独立 API Key / Secret 与签名校验  
  Merchant-specific API Key / Secret and request signing
- `nonce` 防重放、Idempotency-Key、安全重试  
  Nonce-based replay protection and Idempotency-Key support
- 商户 API IP 白名单  
  Merchant API IP allowlists
- 通道绑定、实例路由、托管支付页  
  Channel bindings, instance routing, and hosted checkout pages
- 支付订单创建、查询、关闭  
  Payment order creation, query, and close flows
- 退款创建、查询  
  Refund creation and query flows
- 商户回调重试 worker  
  Merchant callback retry worker
- 财务流水、余额快照、结算视图  
  Finance ledgers, balance snapshots, and settlement-facing views
- OpenAPI 文档页与 JSON 输出  
  OpenAPI docs page and raw JSON schema output

## 当前支持的支付方式 / Currently Supported Channels

- `alipay.page`
- `wxpay.native`

说明 / Notes:

- 支付通道参数不再放在平台 `.env` 中统一维护  
  Channel credentials are no longer maintained centrally in the platform `.env`
- 每个商户都应该在自己的后台维护各自的支付实例  
  Each merchant is expected to manage its own payment instances in the merchant console
- 系统会为每个通道实例生成独立的上游支付回调地址  
  The system generates a distinct upstream payment callback URL for each channel instance

## 设计原则 / Design Principles

- 商户自有支付参数优先  
  Merchant-owned payment credentials first
- 平台不代持商户收款能力  
  The platform should not hold merchant collection capability on their behalf
- 平台统一支付接口，但不强行统一商户上游账号  
  Unified payment API, without forcing merchants into shared upstream accounts
- 浏览器返回页与服务端回调分离  
  Browser return flows and server-side callbacks are treated as separate concerns
- 写接口默认按正式业务场景处理幂等与审计  
  Write APIs are designed with idempotency and auditability in mind

## 技术栈 / Tech Stack

- Next.js 16 + App Router
- React 19
- TypeScript 5
- Prisma 7
- PostgreSQL 16

## 快速开始 / Quick Start

### 1. 安装依赖 / Install dependencies

```bash
npm install
```

### 2. 复制环境变量 / Copy environment variables

```bash
cp .env.example .env
```

### 3. 启动本地 PostgreSQL / Start local PostgreSQL

```bash
docker compose up -d
```

### 4. 至少补齐这些核心配置 / At minimum, fill in these core settings

```bash
DATABASE_URL="postgresql://DB_USER:DB_PASSWORD@DB_HOST:5432/DB_NAME?schema=public"
NOVAPAY_PUBLIC_BASE_URL="http://localhost:3000"
NOVAPAY_DATA_ENCRYPTION_KEY="replace-with-a-long-random-secret"

ADMIN_BOOTSTRAP_EMAIL="admin@example.com"
ADMIN_BOOTSTRAP_PASSWORD="replace-with-a-strong-password"
ADMIN_BOOTSTRAP_NAME="Platform Administrator"
```

关键说明 / Notes:

- `NOVAPAY_PUBLIC_BASE_URL` 在生产环境必须是对外可访问的真实域名，不能是 `localhost`  
  `NOVAPAY_PUBLIC_BASE_URL` must be a real public URL in production and must not point to `localhost`
- `.env` 只保留平台级配置，不应再写入商户的支付宝 / 微信支付生产参数  
  `.env` should only contain platform-level settings, not merchant production payment secrets
- 商户支付参数和上游回调地址由商户后台按通道实例维护  
  Merchant payment settings and upstream callback URLs are managed per channel instance in the merchant console

### 5. 初始化开发数据库 / Initialize the development database

```bash
npm run db:generate
npm run db:push
```

### 6. 启动开发环境 / Start development mode

```bash
npm run dev
```

### 7. 如需验证完整回调与财务链路，再启动两个 worker / Start workers if you need full callback and finance flows

```bash
npm run callbacks:worker
npm run finance:worker
```

### 8. 打开这些入口 / Open these entry points

```text
http://localhost:3000/docs
http://localhost:3000/admin/login
http://localhost:3000/merchant/register
http://localhost:3000/merchant/login
```

## 管理端与商户端分工 / Admin vs Merchant Responsibilities

管理员负责：  
Admins are responsible for:

- 审核商户注册  
  Reviewing merchant registrations
- 查看订单、退款、回调、审计日志  
  Inspecting orders, refunds, callbacks, and audit logs
- 管理系统参数与通道路由  
  Managing system config and channel routing
- 检查财务流水、余额与结算数据  
  Inspecting finance ledgers, balances, and settlement-facing data

商户负责：  
Merchants are responsible for:

- 自助注册、登录、维护资料  
  Registering, signing in, and maintaining profile data
- 创建自己的支付宝 / 微信支付实例  
  Creating their own Alipay / WeChat Pay instances
- 配置 API 白名单、回调地址、API 凭证  
  Configuring IP allowlists, business callbacks, and API credentials
- 查看自己的订单、退款和支付通道状态  
  Monitoring their own orders, refunds, and payment channel status

## REST API 概览 / REST API Overview

主要入口 / Main entry points:

- OpenAPI 文档页 / Docs page: `/docs`
- OpenAPI JSON / Raw schema: `/api/openapi`
- 健康检查 / Health: `GET /api/health`
- 支付通道列表 / Channel list: `GET /api/channels`
- 创建订单 / Create order: `POST /api/payment-orders`
- 查询订单 / Query order: `POST /api/payment-orders/{orderReference}`
- 关闭订单 / Close order: `POST /api/payment-orders/{orderReference}/close`
- 创建退款 / Create refund: `POST /api/payment-orders/{orderReference}/refunds`
- 查询退款 / Query refund: `POST /api/payment-refunds/{refundReference}`

商户调用 `POST /api/payment-orders` 时，必须带上：  
When a merchant calls `POST /api/payment-orders`, it must include:

- `x-novapay-key`
- `x-novapay-timestamp`
- `x-novapay-nonce`
- `x-novapay-signature`
- `Idempotency-Key`（强烈建议 / strongly recommended）

签名算法 / Signature algorithm:

```text
hex(hmac_sha256(apiSecret, "{timestamp}.{nonce}.{rawBody}"))
```

请求体示例 / Example request body:

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

接口行为说明 / Behavioral notes:

- 商户必须处于已审核通过状态  
  The merchant must already be approved
- `x-novapay-nonce` 必须全局唯一，重复会被拒绝  
  `x-novapay-nonce` must be unique; replayed values are rejected
- 商户不需要也不能主动传 `notifyUrl`  
  Merchants do not need to and must not send `notifyUrl`
- 上游支付回调地址会按商户通道实例自动生成  
  Upstream payment callback URLs are assigned automatically per merchant channel instance
- 如需业务通知覆盖，请传 `callbackUrl`  
  Use `callbackUrl` if you need to override the merchant business callback
- 如未传 `returnUrl`，系统会使用 NovaPay 自己的托管返回页  
  If `returnUrl` is omitted, NovaPay will use its own hosted browser return page

更完整的签名和接入示例见：  
For more complete signing and integration examples, see:

- [商户接入示例 / Merchant Integration Examples](./docs/merchant-integration-examples.md)
- [sub2apipay 迁移说明 / sub2apipay Migration Notes](./docs/sub2apipay-to-novapay.md)

## 常用命令 / Common Commands

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

npm run env:check:prod
```

## 生产部署 / Production Deployment

正式环境推荐流程：  
Recommended production flow:

1. `npm ci`
2. `npm run db:migrate:deploy`
3. `npm run env:check:prod`
4. `npm run build`
5. `npm run start`
6. 额外常驻运行 / also run continuously:
   `npm run callbacks:worker`
   `npm run finance:worker`

生产注意事项 / Production notes:

- `NOVAPAY_PUBLIC_BASE_URL` 必须是公开域名，例如 `https://pay.example.com`  
  `NOVAPAY_PUBLIC_BASE_URL` must be a public domain such as `https://pay.example.com`
- 反向代理要正确透传 `x-forwarded-for`  
  Your reverse proxy must forward `x-forwarded-for` correctly
- 不要在生产环境使用 `db:push` 或 `migrate dev`  
  Do not use `db:push` or `migrate dev` in production
- 商户支付参数应只存放在数据库的商户实例配置中  
  Merchant payment credentials should live only in merchant instance records in the database

完整部署说明见：  
For the full deployment guide:

- [生产运行手册 / Production Runbook](./docs/production-runbook.md)

## 开源发布与安全 / Open Source and Security

公开仓库只应该发布这些内容：  
Public repositories should only include:

- 代码框架  
  Application code
- 数据库结构  
  Database schema
- 示例配置  
  Example configuration
- 文档与测试  
  Docs and tests

不要提交以下内容：  
Do not commit:

- 真实 `.env`  
  Real `.env` files
- 真实支付证书、平台公钥、商户私钥  
  Real payment certificates, platform keys, or merchant private keys
- 数据库导出  
  Database dumps
- 商户生产数据  
  Merchant production data
- API 密钥、白名单、回调密钥  
  API secrets, allowlists, or callback secrets

安全发布前请先阅读：  
Before publishing publicly, read:

- [SECURITY.md](./SECURITY.md)

## 项目边界 / Project Boundaries

NovaPay 当前不做这些事情：  
NovaPay intentionally does not do the following:

- 平台统一代收全部商户款项  
  Act as a single shared platform collection account for all merchants
- 平台 `.env` 直接注入所有商户支付参数  
  Inject all merchant payment credentials from one central platform `.env`
- 用一个固定公共上游回调地址服务所有商户  
  Force every merchant through one fixed shared upstream callback URL

它的边界更偏向“多商户支付基础设施”，而不是“单账号聚合收款脚本”。  
Its boundary is closer to a multi-merchant payment infrastructure layer than to a single-account aggregation script.
