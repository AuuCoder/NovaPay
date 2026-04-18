[English](./README.md)

# NovaPay

NovaPay 是一个面向正式业务场景的多商户支付网关与托管收银台。

它的目标不是做“平台统一代收款”，而是让每个商户维护自己的支付宝、微信支付等上游参数，由平台提供统一的订单 API、签名验证、回调路由、退款能力、后台管理与审计能力。

## 项目定位

NovaPay 适合这些场景：

- 多商户平台
- 商户自有支付参数、自有回调、自有 API 凭证
- 平台希望统一支付接口，但不希望把所有商户塞进一套共享收款账号
- 商城、SaaS、数字商品系统需要独立的支付中台

如果把整套系统拆开来看：

- `NovaPay` 负责支付网关、签名 API、通道实例、回调、退款、财务流水
- `NoveShop` 负责商品、店铺、订单、库存和自动发卡

## 当前能力

- 管理员后台与商户自助门户
- 管理员账号体系、商户审核、RBAC、审计日志
- 商户自助创建支付通道实例与专属上游回调地址
- 商户独立 API Key / Secret 与签名校验
- `nonce` 防重放、Idempotency-Key、安全重试
- 商户 API IP 白名单
- 通道绑定、实例路由、托管支付页
- 支付订单创建、查询、关闭
- 退款创建、查询
- 商户回调重试 worker
- 财务流水、余额快照、结算视图
- OpenAPI 文档页与 JSON 输出

## 当前支持的支付方式

- `alipay.page`
- `wxpay.native`

说明：

- 支付通道参数不再放在平台 `.env` 中统一维护。
- 每个商户都应该在自己的后台维护各自的支付实例。
- 系统会为每个通道实例生成独立的上游支付回调地址。

## 设计原则

- 商户自有支付参数优先
- 平台不代持商户收款能力
- 平台统一支付接口，但不强行统一商户上游账号
- 浏览器返回页与服务端回调分离
- 写接口默认按正式业务场景处理幂等与审计

## 技术栈

- Next.js 16 + App Router
- React 19
- TypeScript 5
- Prisma 7
- PostgreSQL 16

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 复制环境变量

```bash
cp .env.example .env
```

### 3. 启动本地 PostgreSQL

```bash
docker compose up -d
```

### 4. 至少补齐这些核心配置

```bash
DATABASE_URL="postgresql://DB_USER:DB_PASSWORD@DB_HOST:5432/DB_NAME?schema=public"
NOVAPAY_PUBLIC_BASE_URL="http://localhost:3000"
NOVAPAY_DATA_ENCRYPTION_KEY="replace-with-a-long-random-secret"

ADMIN_BOOTSTRAP_EMAIL="admin@example.com"
ADMIN_BOOTSTRAP_PASSWORD="replace-with-a-strong-password"
ADMIN_BOOTSTRAP_NAME="Platform Administrator"
```

说明：

- `NOVAPAY_PUBLIC_BASE_URL` 在生产环境必须是对外可访问的真实域名，不能是 `localhost`。
- `.env` 只保留平台级配置，不应再写入商户的支付宝 / 微信支付生产参数。
- 商户支付参数和上游回调地址由商户后台按通道实例维护。

### 5. 初始化开发数据库

```bash
npm run db:generate
npm run db:push
```

### 6. 启动开发环境

```bash
npm run dev
```

### 7. 如需验证完整回调与财务链路，再启动两个 worker

```bash
npm run callbacks:worker
npm run finance:worker
```

### 8. 打开这些入口

```text
http://localhost:3000/docs
http://localhost:3000/admin/login
http://localhost:3000/merchant/register
http://localhost:3000/merchant/login
```

## 管理端与商户端分工

管理员负责：

- 审核商户注册
- 查看订单、退款、回调、审计日志
- 管理系统参数与通道路由
- 检查财务流水、余额与结算数据

商户负责：

- 自助注册、登录、维护资料
- 创建自己的支付宝 / 微信支付实例
- 配置 API 白名单、回调地址、API 凭证
- 查看自己的订单、退款和支付通道状态

## REST API 概览

主要入口：

- OpenAPI 文档页：`/docs`
- OpenAPI JSON：`/api/openapi`
- 健康检查：`GET /api/health`
- 支付通道列表：`GET /api/channels`
- 创建订单：`POST /api/payment-orders`
- 查询订单：`POST /api/payment-orders/{orderReference}`
- 关闭订单：`POST /api/payment-orders/{orderReference}/close`
- 创建退款：`POST /api/payment-orders/{orderReference}/refunds`
- 查询退款：`POST /api/payment-refunds/{refundReference}`

商户调用 `POST /api/payment-orders` 时，必须带上：

- `x-novapay-key`
- `x-novapay-timestamp`
- `x-novapay-nonce`
- `x-novapay-signature`
- `Idempotency-Key`（强烈建议）

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

接口行为说明：

- 商户必须处于已审核通过状态。
- `x-novapay-nonce` 必须全局唯一，重复会被拒绝。
- 商户不需要也不能主动传 `notifyUrl`。
- 上游支付回调地址会按商户通道实例自动生成。
- 如需业务通知覆盖，请传 `callbackUrl`。
- 如未传 `returnUrl`，系统会使用 NovaPay 自己的托管返回页。

更完整的签名和接入示例见：

- [商户接入示例](./docs/merchant-integration-examples.md)
- [sub2apipay 迁移说明](./docs/sub2apipay-to-novapay.md)

## 常用命令

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

## 生产部署

正式环境推荐流程：

1. `npm ci`
2. `npm run db:migrate:deploy`
3. `npm run env:check:prod`
4. `npm run build`
5. `npm run start`
6. 额外常驻运行：
   `npm run callbacks:worker`
   `npm run finance:worker`

生产注意事项：

- `NOVAPAY_PUBLIC_BASE_URL` 必须是公开域名，例如 `https://pay.example.com`。
- 反向代理要正确透传 `x-forwarded-for`。
- 不要在生产环境使用 `db:push` 或 `migrate dev`。
- 商户支付参数应只存放在数据库的商户实例配置中。

完整部署说明见：

- [生产运行手册](./docs/production-runbook.md)

## 开源发布与安全

公开仓库只应该发布这些内容：

- 代码框架
- 数据库结构
- 示例配置
- 文档与测试

不要提交以下内容：

- 真实 `.env`
- 真实支付证书、平台公钥、商户私钥
- 数据库导出
- 商户生产数据
- API 密钥、白名单、回调密钥

安全发布前请先阅读：

- [SECURITY.md](./SECURITY.md)

## 项目边界

NovaPay 当前不做这些事情：

- 平台统一代收全部商户款项
- 平台 `.env` 直接注入所有商户支付参数
- 用一个固定公共上游回调地址服务所有商户

它的边界更偏向“多商户支付基础设施”，而不是“单账号聚合收款脚本”。
