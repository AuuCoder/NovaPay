# Production Runbook

## 目标

这份文档用于正式环境部署 NovaPay，默认采用以下进程拆分：

- Web 应用：`npm run start`
- 回调重试 worker：`npm run callbacks:worker`
- 财务 worker：`npm run finance:worker`

## 1. 环境准备

至少准备以下变量：

```bash
DATABASE_URL="postgresql://..."
NOVAPAY_PUBLIC_BASE_URL="https://pay.example.com"
NOVAPAY_DATA_ENCRYPTION_KEY="高强度随机密钥"
ADMIN_BOOTSTRAP_EMAIL="admin@example.com"
ADMIN_BOOTSTRAP_PASSWORD="高强度密码"
ADMIN_BOOTSTRAP_NAME="Platform Administrator"
MERCHANT_SIGNATURE_MAX_AGE_SECONDS="300"
CALLBACK_TIMEOUT_MS="10000"
CALLBACK_MAX_ATTEMPTS="6"
CALLBACK_RETRY_INTERVAL_SECONDS="60"
CALLBACK_WORKER_INTERVAL_MS="5000"
FINANCE_WORKER_INTERVAL_MS="60000"
SETTLEMENT_HOLD_DAYS="1"
```

支付宝和微信支付参数不再由平台环境变量统一提供，而是由商户在控制台各自维护。

也可以直接从生产模板开始：

```bash
cp .env.production.example .env
```

如果应用和 PostgreSQL 都准备使用 Docker Compose，建议改用：

```bash
cp .env.docker-compose.example .env
```

如果数据库直接装在服务器本机，可以直接使用：

```bash
cp .env.server-local.example .env
```

如果应用准备使用 Docker、数据库仍然使用服务器本机 PostgreSQL，建议改用：

```bash
cp .env.docker-host-db.example .env
```

## 2. 数据库发布

正式环境使用 Prisma migration deploy：

```bash
npm ci
npm run db:migrate:deploy
```

不要在正式环境使用：

- `npm run db:push`
- `npm run db:migrate`

执行数据库迁移后，建议先做一次生产预检：

```bash
npm run env:check:prod
```

## 3. 应用发布

```bash
npm run build
npm run start
```

建议把 Web 应用、回调 worker、财务 worker 分成独立进程托管。

### Docker Compose

仓库已提供单机部署示例：

先确认当前机器使用的是官方 `Docker Engine + Docker Compose v2`。
如果命令输出里出现 `Emulate Docker CLI using podman` 或 `Executing external compose provider "/usr/bin/docker-compose"`，说明当前跑的是 `podman` 兼容层或旧版 `docker-compose v1`，需要先切回官方 Docker，再执行下面的命令。

```bash
docker compose -f deploy/docker-compose.prod.yml --profile ops run --rm migrate
docker compose -f deploy/docker-compose.prod.yml --profile ops run --rm preflight
docker compose -f deploy/docker-compose.prod.yml up -d web callbacks-worker finance-worker
```

如果准备连同内置 PostgreSQL 一起启动：

```bash
docker compose -f deploy/docker-compose.prod.yml up -d postgres web callbacks-worker finance-worker
```

如果使用 Compose 里自带的 PostgreSQL，请把 `DATABASE_URL` 改成容器内地址，例如：

```bash
DATABASE_URL="postgresql://postgres:postgres@postgres:5432/novapay?schema=public"
```

也可以直接从：

```bash
cp .env.docker-compose.example .env
```

开始。

如果数据库是服务器本机 PostgreSQL，请改用：

```bash
docker compose -f deploy/docker-compose.host-db.yml --profile ops run --rm migrate
docker compose -f deploy/docker-compose.host-db.yml --profile ops run --rm preflight
docker compose -f deploy/docker-compose.host-db.yml up -d web callbacks-worker finance-worker
```

### PM2

仓库也提供了 `ecosystem.config.cjs`：

```bash
pm2 start ecosystem.config.cjs
pm2 save
```

## 4. Worker 发布

回调 worker：

```bash
npm run callbacks:worker
```

财务 worker：

```bash
npm run finance:worker
```

如果只想手动执行一次补账和结算：

```bash
npm run callbacks:retry-once
npm run finance:sync-once
```

## 5. 反向代理要求

商户 API 支持 IP 白名单，生产环境必须保证代理层透传真实来源 IP：

- `x-forwarded-for`
- `x-forwarded-proto`
- `x-forwarded-host`

如果代理没有正确透传 `x-forwarded-for`，开启白名单的商户会被误拦截。

## 6. 首次上线检查

上线后建议至少检查：

1. `GET /api/health` 返回数据库可达
2. `/api/openapi` 中商户签名头包含 `x-novapay-nonce`
3. 管理后台可登录
4. 商户可注册、审核、登录
5. `callbacks:worker` 持续运行
6. `finance:worker` 能生成结算单和余额快照

## 7. 财务运营建议

当前财务页提供：

- 对账日报
- 资金流水
- 结算单
- 余额快照

推荐流程：

1. 由 `finance:worker` 定时补齐支付、手续费、退款分录
2. 自动生成商户结算单和余额快照
3. 财务在后台确认结算单后，手动标记“已打款”

标记已打款时，系统会自动生成一条 `SETTLEMENT_PAYOUT` 资金流水，并重新计算余额快照。
