# Production Runbook

## 目标

这份文档用于正式环境部署 NovaPay，默认采用以下进程拆分：

- Web 应用：`npm run start`
- 回调重试 worker：`npm run callbacks:worker`
- 财务 worker：`npm run finance:worker`
- 链上扫描 worker：`npm run onchain:worker`

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
ONCHAIN_WORKER_INTERVAL_MS="15000"
SETTLEMENT_HOLD_DAYS="1"
USDT_RATE_PRIMARY_SOURCE="coingecko"
USDT_RATE_SECONDARY_SOURCE="coinpaprika"
USDT_RATE_FIXED_CNY="7.2"
USDT_RATE_MIN_CNY="6.0"
USDT_RATE_MAX_CNY="8.5"
USDT_QUOTE_TTL_SECONDS="900"
USDT_QUOTE_SPREAD_BPS="150"
USDT_TAIL_STEP="0.0001"
USDT_TAIL_MAX="0.0099"
USDT_TAIL_RELATIVE_MAX_BPS="30"
USDT_EVM_LOOKBACK_BLOCKS="180"
USDT_SOL_SIGNATURE_LIMIT="50"
USDT_BSC_RPC_URL="https://..."
USDT_BSC_TOKEN_CONTRACT="0x..."
USDT_BSC_CONFIRMATIONS="12"
USDT_BASE_RPC_URL="https://..."
USDT_BASE_TOKEN_CONTRACT="0x..."
USDT_BASE_CONFIRMATIONS="12"
USDT_SOL_RPC_URL="https://..."
USDT_SOL_MINT="Es9vMFrzaCER..."
USDT_SOL_CONFIRMATIONS="1"
```

支付宝和微信支付参数不再由平台环境变量统一提供，而是由商户在控制台各自维护。
USDT 通道的收款地址也不写在平台 `.env`，而是由每个商户在自己的通道实例里配置。

建议上线前先确认三件事：

1. 至少有一个稳定可用的链 RPC，不要直接依赖浏览器用的公共免费节点
2. 每个商户在同一条链上使用独立收款地址，不要复用
3. `env:check:prod` 能通过，否则先不要放量

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

如果启用了任意 `usdt.*` 通道，预检还会额外检查：

- 对应链的 RPC / Token / Mint 配置是否存在
- 是否存在重复的链上收款地址
- 是否需要额外启动 `onchain-worker`

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
docker compose -f deploy/docker-compose.prod.yml up -d web callbacks-worker finance-worker onchain-worker
```

如果准备连同内置 PostgreSQL 一起启动：

```bash
docker compose -f deploy/docker-compose.prod.yml up -d postgres web callbacks-worker finance-worker onchain-worker
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
docker compose -f deploy/docker-compose.host-db.yml up -d web callbacks-worker finance-worker onchain-worker
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

链上扫描 worker：

```bash
npm run onchain:worker
```

如果只想手动执行一次补账和结算：

```bash
npm run callbacks:retry-once
npm run finance:sync-once
npm run onchain:sync-once
```

说明：

- `callbacks:worker` 负责商户业务回调补发
- `finance:worker` 负责财务流水、余额快照、结算视图
- `onchain:worker` 负责扫描 `usdt.bsc` / `usdt.base` / `usdt.sol` 的到账并尝试自动配单

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
7. 如启用 USDT，`onchain:worker` 正常运行且没有重复地址/坏地址报错

## 7. USDT 上线专项检查

如果本次还要一起上线链上 USDT，请额外执行下面这套检查。

### 7.1 商户配置检查

1. 商户已经在控制台创建并启用了 `usdt.bsc`、`usdt.base` 或 `usdt.sol` 通道实例
2. 每个通道实例都填写了正确的收款地址
3. 同一条链上，不同商户没有复用同一个收款地址
4. `merchantChannelBinding` 已指向对应商户实例

### 7.2 平台系统配置检查

按启用的链补齐系统配置：

- BSC：`USDT_BSC_RPC_URL`、`USDT_BSC_TOKEN_CONTRACT`
- Base：`USDT_BASE_RPC_URL`、`USDT_BASE_TOKEN_CONTRACT`
- Solana：`USDT_SOL_RPC_URL`、`USDT_SOL_MINT`

可选调优项：

- `USDT_BSC_CONFIRMATIONS`
- `USDT_BASE_CONFIRMATIONS`
- `USDT_SOL_CONFIRMATIONS`
- `USDT_TAIL_STEP`
- `USDT_TAIL_MAX`
- `USDT_TAIL_RELATIVE_MAX_BPS`

默认策略：

- 汇率主源：`CoinGecko`
- 汇率备用：`CoinPaprika`
- 双源失败：固定 `7.2`
- 尾差步长：`0.0001 USDT`
- 尾差上限：`0.0099 USDT`
- 相对尾差上限：`0.3%`

### 7.3 首次实单建议

建议先只放开一条链做验证，例如先测 `usdt.bsc`：

1. 商户后台启用 `usdt.bsc`
2. 调用 `POST /api/payment-orders` 创建一笔小额订单
3. 确认返回数据里有：
   `hostedCheckoutUrl`
   `payableAmount`
   `payableCurrency`
   `quoteRate`
   `quoteExpiresAt`
4. 打开托管支付页，确认页面展示的地址、链路、精确金额都正确
5. 从真实钱包或测试流程向该地址转入“精确金额”
6. 查看 `onchain-worker` 日志，确认检测到入账并完成配单
7. 确认订单状态变成 `SUCCEEDED`
8. 确认商户业务回调也已发出

### 7.4 异常处理建议

- 如果短时间内同金额订单太多，系统会通过尾差分配精确应付金额；如果可用尾差槽用尽，下单会直接失败并提示稍后重试
- 如果链上真实到账金额与页面展示金额不完全一致，系统不会自动确认，避免误配单
- 如果多个商户错误地配置了同链同地址，预检会失败，worker 也会跳过该地址
- 如果链 RPC 故障，`onchain-worker` 会记录错误，但不会影响 Web、回调、财务 worker 的存活

## 8. 财务运营建议

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
