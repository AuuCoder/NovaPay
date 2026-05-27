[English](./README.md)

# NovaPay

NovaPay 是一个面向正式业务场景的多商户支付网关，自带托管收银台、内置插件市场，开箱即用的 Docker 部署。

它的目标不是做「平台统一代收款」。每个商户维护自己的上游凭证（支付宝、微信支付、USDT 收款地址等），平台提供统一的订单 API、签名验证、回调路由、退款能力、财务流水以及支持热插拔支付通道的插件市场——添加新通道无需重新部署网关。

---

## 亮点

- **多商户支付网关** —— 每个商户跑在自己的凭证和收款账户上，平台不代持商户收款能力。
- **插件市场（`apps/registry`）** —— 独立的 Next.js 服务，包含免费/收费插件目录、Ed25519 包签名、按实例签发的 JWS 许可证、自带管理员/开发者后台。
- **沙箱化插件运行时** —— 第三方插件通过 `worker_threads` 沙箱加载，并对 `child_process`、`eval`、文件系统写入等绕过手段做静态扫描。
- **托管收银台** —— 支付宝、微信 Native、USDT（BSC / Base / Solana）的品牌化支付页，带倒计时、状态轮询、锁价应付金额。
- **运营工具链** —— 管理员看板、商户自助门户、财务流水、退款流程、回调重试 worker、链上匹配 worker、审计日志、OpenAPI 文档。
- **Docker 原生部署** —— 一条 `docker compose up -d` 起主站、插件市场、三个 worker、Postgres、MinIO。
- **统一北京时间** —— 后台和托管收银台所有时间都按 `Asia/Shanghai` 显示，跟服务器时区无关。

---

## 架构

```
                    ┌──────────────────────────────────────────┐
                    │            反向代理（HTTPS）              │
                    └──────────────────────────────────────────┘
                          │                          │
                          ▼                          ▼
       ┌────────────────────────┐    ┌────────────────────────────┐
       │  NovaPay 主站           │    │  插件市场（apps/registry） │
       │  /admin /merchant      │    │  /developer /governance    │
       │  /pay /api/payment-... │    │                            │
       │  Next.js 16 :3000      │    │  Next.js 16 :3100          │
       └────────────────────────┘    └────────────────────────────┘
                │                                 │
                ├────────── Postgres 16 ──────────┤
                │      novapay      novapay_registry
                │
                └────────── MinIO / S3 / R2 / OSS
                            （已签名插件包）

       后台 worker：
       ─ callbacks-worker     商户业务回调重试
       ─ finance-worker       流水同步、余额快照、结算
       ─ onchain-worker       USDT BSC / Base / Solana 到账匹配
```

| 组件 | 职责 | 存储 |
|---|---|---|
| 主站 | 支付网关、管理员、商户后台、托管收银台 | `novapay` Postgres |
| 插件市场 | 商店目录、许可证签发、开发者门户 | `novapay_registry` Postgres + S3 |
| MinIO / S3 | 已签名插件包存储 | 对象存储 |
| Worker | 异步重试、财务同步、链上扫描 | 共用 Postgres |

---

## 快速开始（Docker）

最快路径：所有依赖跑在 Docker 里，Postgres、MinIO、应用一起起。

### 前置条件

- Docker Engine + Docker Compose v2
- 服务器或本机能访问 80/443
- 至少 4 GB 内存

### 本地开发

```bash
docker compose -f deploy/docker-compose.dev.yml up -d
```

会启动 Postgres（`:5432`）和 MinIO（`:9000` S3 API / `:9001` 控制台）。然后在宿主机上跑应用：

```bash
npm install
cp .env.example .env
npm run db:migrate:deploy
npm run dev:main                              # 主站 :3000

cd apps/registry
npm install
npx prisma migrate deploy
npm run dev:registry                          # 插件市场 :3100
```

### 单机生产部署

```bash
git clone https://github.com/AuuCoder/NovaPay.git && cd NovaPay
cp .env.docker-compose.example .env
vim .env                                      # 修改所有 REPLACE_WITH_* 项

docker compose -f deploy/docker-compose.prod.yml --profile ops run --rm postgres-init
docker compose -f deploy/docker-compose.prod.yml --profile ops run --rm migrate
docker compose -f deploy/docker-compose.prod.yml --profile ops run --rm migrate-registry
docker compose -f deploy/docker-compose.prod.yml --profile ops run --rm preflight

docker compose -f deploy/docker-compose.prod.yml up -d
```

服务起来后：

- 主站：`http://<服务器 IP>:3000`
- 插件市场：`http://<服务器 IP>:3100`
- MinIO 控制台（仅本机暴露在 `127.0.0.1:9001`）：通过 SSH 隧道访问

正式上线请在 `:3000` 和 `:3100` 前加 Nginx / Caddy / Cloudflare 提供 HTTPS。

---

## 内置支付通道

| 通道 | 提供方 | 模式 |
|---|---|---|
| `alipay.page` | 支付宝 | 网页跳转 |
| `wxpay.native` | 微信支付 | Native 二维码 |
| `usdt.bsc` | USDT on BNB Smart Chain | 链上转账 |
| `usdt.base` | USDT on Base | 链上转账 |
| `usdt.sol` | USDT on Solana | 链上转账 |

通道以插件形式存在。市场内置 `novapay.*` 官方包；第三方插件可在不修改网关代码的前提下扩展通道。

---

## 插件市场

Registry 是独立的 Next.js 服务，独立的数据库与 S3 存储桶。它提供：

- **公共目录 API**（每个 NovaPay 实例消费）：`GET /api/registry/plugins`、`GET /api/registry/packages/:slug/:version/download`。
- **信任锚 + Ed25519 签名**：`/.well-known/trust.json` 让消费方可以离线验签。
- **开发者门户**：注册、上传插件版本、查看销量、申请打款、管理 PAT。
- **治理后台**：审核队列、下架流程、许可证撤销。
- **付费插件流转**：买家通过 NovaPay 自己的托管收银台付钱给 Registry，Registry 签发 JWS 许可证，每天定时校验。

主站安装付费插件时：

1. 管理员在 `/admin/plugins` 点 **购买**。
2. NovaPay 用 instance ID 调 `POST /api/registry/plugins/:slug/orders`。
3. Registry 创建订单，返回托管收银台 URL（指向 NovaPay 自己的桥接商户）。
4. 买家通过真支付宝/微信付钱给 Registry（Registry 也是个 NovaPay 商户——自己吃自己的狗粮）。
5. Registry 签发许可证；NovaPay 下载插件包，校验 sha256 + Ed25519，沙箱加载，标记安装完成。

---

## REST API

| 行为 | 接口 |
|---|---|
| 文档页 | `GET /docs` |
| OpenAPI JSON | `GET /api/openapi` |
| 健康检查 | `GET /api/health` |
| 通道列表 | `GET /api/channels` |
| 创建订单 | `POST /api/payment-orders` |
| 查询订单 | `POST /api/payment-orders/{orderReference}` |
| 关闭订单 | `POST /api/payment-orders/{orderReference}/close` |
| 创建退款 | `POST /api/payment-orders/{orderReference}/refunds` |
| 查询退款 | `POST /api/payment-refunds/{refundReference}` |

商户调用必须带：

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
  "channelCode": "usdt.bsc",
  "externalOrderId": "ORDER-20260410-001",
  "amount": "88.00",
  "subject": "NovaPay Production Order",
  "description": "USDT 链上支付"
}
```

接口行为说明：

- 商户必须处于已审核通过状态。
- `x-novapay-nonce` 必须全局唯一，重放会被拒绝。
- 商户不需要也不能传 `notifyUrl`，上游回调地址按通道实例自动生成。
- 如需业务通知覆盖，可传 `callbackUrl`。
- 未传 `returnUrl` 时使用 NovaPay 自己的托管返回页。

完整的签名和接入示例：

- [商户接入示例](./docs/merchant-integration-examples.md)
- [sub2apipay 迁移说明](./docs/sub2apipay-to-novapay.md)

---

## 角色分工

**管理员**
- 审核商户注册
- 查看订单、退款、回调、审计日志
- 管理系统参数与通道路由
- 检查财务流水、余额、结算
- 浏览、安装、启用、停用插件市场的插件

**商户**
- 自助注册、登录、维护资料
- 创建自己的支付宝 / 微信 / USDT 通道实例
- 配置 IP 白名单、回调地址、API 凭证
- 查看自己的订单、退款和通道状态

**插件开发者（仅 Registry）**
- 注册账号，上传插件包
- 提交审核前自动跑测试会话
- 管理付费插件定价、查看销量、申请打款

---

## 配置参考

最小平台密钥（`.env`）：

```bash
# Postgres
DATABASE_URL="postgresql://novapay:secret@postgres:5432/novapay?schema=public"
REGISTRY_DATABASE_URL="postgresql://novapay:secret@postgres:5432/novapay_registry?schema=public"

# 对象存储（S3 / MinIO / R2 / OSS 都兼容）
S3_ENDPOINT_URL="http://minio:9000"
S3_BUCKET="novapay-registry-packages"
S3_ACCESS_KEY_ID="..."
S3_SECRET_ACCESS_KEY="..."
S3_REGION="us-east-1"
S3_FORCE_PATH_STYLE="true"

# 公网域名
NOVAPAY_PUBLIC_BASE_URL="https://pay.example.com"
REGISTRY_APP_URL="https://registry.example.com"

# 加密密钥 —— 用 `openssl rand -base64 32` 生成
NOVAPAY_DATA_ENCRYPTION_KEY="..."
REGISTRY_DEFAULT_APP_KEY="..."
REGISTRY_SSO_SECRET="..."

# 引导管理员（只在首次启动时生效）
ADMIN_BOOTSTRAP_ENABLED="1"
ADMIN_BOOTSTRAP_EMAIL="admin@example.com"
ADMIN_BOOTSTRAP_PASSWORD="..."
ADMIN_BOOTSTRAP_NAME="Platform Administrator"
```

完整模板在 [`.env.docker-compose.example`](./.env.docker-compose.example)。

`.env` 只保留平台级配置。商户支付凭证应该存在 `MerchantChannelAccount` 表里，由 `NOVAPAY_DATA_ENCRYPTION_KEY` 静态加密。

---

## 常用命令

```bash
# 开发
npm run dev:main
npm run dev:registry

# 数据库
npm run db:generate
npm run db:migrate:deploy
npm run db:status
npm run db:studio

# Worker
npm run callbacks:worker
npm run finance:worker
npm run onchain:worker

# 一次性版本（适合 cron）
npm run callbacks:retry-once
npm run finance:sync-once
npm run onchain:sync-once

# 质量
npm run lint
npm run test
npm run env:check:prod
```

---

## 技术栈

- **运行时**：Node.js 20、TypeScript 5
- **框架**：Next.js 16（App Router）、React 19
- **数据库**：PostgreSQL 16、Prisma 7
- **对象存储**：MinIO / AWS S3 / Cloudflare R2 / 阿里云 OSS（任意 S3 兼容服务，通过 `@aws-sdk/client-s3`）
- **加密**：Ed25519 包签名 + AES-GCM 密钥封装
- **沙箱**：`worker_threads` 加载第三方插件
- **部署**：Docker Compose（dev / prod 双 profile）和 PM2 ecosystem

---

## 开源与安全

公开仓库只发布：

- 代码框架
- 数据库结构与迁移
- 示例配置
- 文档与测试

绝不要提交：

- 真实 `.env`
- 真实支付证书、平台公钥、商户私钥
- 数据库导出 / 商户生产数据
- API 密钥、IP 白名单、回调密钥

发布前阅读 [SECURITY.md](./SECURITY.md)。

---

## 项目边界

NovaPay 当前**不做**这些事情：

- 平台统一代收所有商户款项
- 平台 `.env` 注入所有商户支付参数
- 用一个固定公共回调地址服务所有商户

它的定位是「多商户支付基础设施」，不是「单账号聚合收款脚本」。

---

## 许可与贡献

Issues 和 PR 欢迎到 [github.com/AuuCoder/NovaPay](https://github.com/AuuCoder/NovaPay) 提交。

完整运行手册见 [docs/production-runbook.md](./docs/production-runbook.md)。
