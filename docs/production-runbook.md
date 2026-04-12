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

## 2. 数据库发布

正式环境使用 Prisma migration deploy：

```bash
npm ci
npm run db:migrate:deploy
```

不要在正式环境使用：

- `npm run db:push`
- `npm run db:migrate`

## 3. 应用发布

```bash
npm run build
npm run start
```

建议把 Web 应用、回调 worker、财务 worker 分成独立进程托管。

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
