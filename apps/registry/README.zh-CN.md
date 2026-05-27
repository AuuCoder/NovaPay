[English](./README.md)

# NovaPay 插件市场

`@novapay/registry` 是 NovaPay 平台的独立插件市场服务。它管理官方与第三方支付插件目录，使用 Ed25519 对插件包签名，按实例签发 JWS 许可证，并自带管理员 / 开发者后台。

它**不是** NovaPay 主程序的一部分——它是一套独立的 Next.js + Prisma + PostgreSQL + S3 服务，独立域名、独立数据库、独立生命周期。

---

## 能力

- **公共目录 API**（每个 NovaPay 实例消费）：`GET /api/registry/plugins`、`GET /api/registry/packages/:slug/:version/download`
- **信任锚** 在 `/.well-known/trust.json`，消费方可以离线验证签名
- **开发者门户**：注册、上传插件版本、跑自动测试会话、管理 PAT、查看销量、申请打款
- **治理后台**：审核队列、下架流程、许可证撤销
- **付费插件结账**直接吃 NovaPay 自己的狗粮——买家通过真支付宝/微信付钱，Registry 签发 JWS 许可证，消费实例每日校验

---

## 架构

```
NovaPay 主程序  ──▶  Registry  ──▶  Postgres (novapay_registry)
                       │             S3 / MinIO / R2 / OSS
                       └─────────────  Ed25519 签名密钥
```

| 模块 | 职责 |
|---|---|
| `app/` | Next.js App Router——管理员（`/(admin)`）、开发者门户（`/developer`）、公共 API（`/api/registry/*`、`/api/.well-known/*`） |
| `lib/runtime/state.ts` | 进程级单例：签名密钥、签名器、各种 store、对象存储、消费者 |
| `lib/runtime/prisma-stores.ts` | Prisma 实现的签名密钥存储、审计日志、消费者查询 |
| `lib/auth/` | 开发者认证、会话、PAT token、消费者（NovaPay 实例）认证 |
| `lib/bundle/` | Manifest 解析 + 包流水线（sha256 → 存储 → 签名） |
| `lib/signing/` | Ed25519 密钥存储、签名器、轮换、本地私钥封装 |
| `lib/licensing/` | 许可证签发、验证、撤销 |
| `lib/payments/` | 调 NovaPay 主程序创建支付订单 |
| `lib/payouts/` | 开发者余额账本 + 打款申请 |
| `lib/storage/` | S3 兼容对象存储驱动 |

所有持久化都走 Postgres；Ed25519 私钥用 `lib/security/secret-box.ts` 的 AES-GCM 封装。插件包存在 S3 兼容存储里（AWS S3 / Cloudflare R2 / 阿里云 OSS / MinIO 都行）。

---

## 本地开发

```bash
# 在仓库根目录用 Docker 起 Postgres + MinIO
docker compose -f deploy/docker-compose.dev.yml up -d

# 然后在本目录
cd apps/registry
npm install
npx prisma migrate deploy
npm run dev:registry            # 监听 :3100
```

dev compose 会自动建好 `novapay_registry` 库和 `novapay-registry-packages` bucket。所需 env（在仓库根 `.env`）：

```bash
REGISTRY_DATABASE_URL="postgresql://novapay:novapay@localhost:5432/novapay_registry?schema=public"

S3_ENDPOINT_URL="http://localhost:9000"
S3_BUCKET="novapay-registry-packages"
S3_ACCESS_KEY_ID="novapay-minio-access"
S3_SECRET_ACCESS_KEY="novapay-minio-secret"
S3_REGION="us-east-1"
S3_FORCE_PATH_STYLE="true"

REGISTRY_DEFAULT_APP_KEY="novapay-dev-secret"
REGISTRY_SSO_SECRET="novapay-registry-dev-sso-secret"
NOVAPAY_DATA_ENCRYPTION_KEY="dev-only-32-byte-base64"
```

跑单元测试时不想接真对象存储就设 `OBJECT_STORE_DRIVER=memory`。

---

## 脚本

| 脚本                      | 用途                                       |
| ------------------------- | ------------------------------------------ |
| `dev`                     | 启动 dev 服务                               |
| `dev:registry`            | 同上，但绑定 `:3100`                        |
| `build`                   | 生产构建                                   |
| `start`                   | 启动生产服务                               |
| `lint`                    | ESLint                                     |
| `prisma:generate`         | 生成 Prisma client                          |
| `prisma:migrate`          | `prisma migrate dev`                       |
| `prisma:migrate:deploy`   | `prisma migrate deploy`（生产）             |
| `test`                    | 单元测试 `tests/unit/`                     |

---

## 生产部署

Registry 已经打包进仓库根的 `deploy/docker-compose.prod.yml`。在仓库根：

```bash
cp .env.docker-compose.example .env
vim .env

docker compose -f deploy/docker-compose.prod.yml --profile ops run --rm postgres-init
docker compose -f deploy/docker-compose.prod.yml --profile ops run --rm migrate-registry

docker compose -f deploy/docker-compose.prod.yml up -d registry
```

完整部署见 [`docs/production-runbook.zh-CN.md`](../../docs/production-runbook.zh-CN.md)。

---

## 配置参考

| Env | 是否必填 | 用途 |
|---|---|---|
| `REGISTRY_DATABASE_URL` | 是 | `novapay_registry` 库（兜底用 `DATABASE_URL`） |
| `S3_ENDPOINT_URL` | 是 | S3 / MinIO endpoint（AWS 不填） |
| `S3_BUCKET` | 是 | 插件包存储 bucket |
| `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` | 是 | S3 凭证 |
| `S3_REGION` | 是 | 区域（MinIO 填 `us-east-1`） |
| `S3_FORCE_PATH_STYLE` | MinIO 必填 | `true` 用 path-style URL |
| `REGISTRY_OBJECT_PUBLIC_BASE_URL` | 可选 | 把预签名 URL 的域名重写为 CDN 域名 |
| `OBJECT_STORE_DRIVER` | 仅测试 | 设 `memory` 跳过 S3 |
| `REGISTRY_DEFAULT_APP_KEY` | 是 | 跟 NovaPay 主程序共享的 App Key |
| `REGISTRY_SSO_SECRET` | 是 | 主程序↔Registry 之间的管理员 SSO HMAC 密钥 |
| `NOVAPAY_DATA_ENCRYPTION_KEY` | 是 | AES-GCM 封装签名私钥用；要跟主程序保持一致 |

---

## 与 NovaPay 主程序的关系

NovaPay 主程序把这个 Registry 当成唯一的插件市场来源。主程序会：

1. 轮询 `GET /api/registry/plugins` 同步目录
2. 下载已签名的插件包，对照信任锚校验 sha256 + Ed25519
3. 在 `worker_threads` 沙箱里加载运行时模块（主程序的 `lib/plugins/sandbox-runtime.ts`）
4. 每 24 小时通过 `POST /api/licenses/verify` 重校验付费插件许可证

Registry 同时是一个 NovaPay 商户：付费插件订单通过 NovaPay 自己的支付网关结算——平台用自己的产品收自己产品的钱。

---

## 测试

```bash
npm run test
```

122+ 个单元测试覆盖：签名/轮换、包流水线、许可证签发/验证、Manifest 解析、静态扫描、审核闸门、结算配置、运行时状态。

---

## 许可

跟 NovaPay 主仓库一致。欢迎在 [github.com/AuuCoder/NovaPay](https://github.com/AuuCoder/NovaPay) 提交 Issue / PR。
