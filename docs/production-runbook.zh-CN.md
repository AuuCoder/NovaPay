[English](./production-runbook.md)

# Production Runbook

NovaPay 单台服务器的标准上线流程。整套系统包括：

- 主站（NovaPay 网关 + 后台 + 托管收银台）
- 插件市场（Registry，独立 Next.js 服务）
- 五个后台 worker：callbacks / finance / ctf-bill-capture / payment-monitor / onchain
- Postgres 16（两个数据库：`novapay`、`novapay_registry`）
- MinIO（S3 兼容对象存储，存插件包）

推荐部署形态：上述全部跑在 Docker Compose 里，前面接 Nginx / Caddy / Cloudflare 提供 HTTPS。

---

## 1. 服务器准备

最低配置：

- 4 核 / 4 GB RAM / 40 GB SSD
- Ubuntu 22.04 / Debian 12 / Rocky 9 等主流发行版
- 公网 IP + 至少两个域名（主站、插件市场）

软件：

```bash
# 安装 Docker Engine + Docker Compose v2
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
# 重新登录后生效

docker --version            # 应显示 24+ 或 27+
docker compose version      # 应显示 v2.x
```

如果 `docker compose version` 输出包含 `Emulate Docker CLI using podman` 或 `external compose provider`，说明跑的是 podman 兼容层或旧版 v1，先切回官方 Docker。

---

## 2. 域名与 HTTPS

至少准备两个子域名：

- `pay.example.com` → 主站
- `registry.example.com` → 插件市场

DNS A 记录都指向这台服务器。HTTPS 由前置代理负责（推荐 Caddy，自动签 Let's Encrypt 证书）。

最小 Caddyfile 示例：

```caddyfile
pay.example.com {
    reverse_proxy 127.0.0.1:3000
    header X-Real-IP {remote_host}
    header X-Forwarded-For {remote_host}
}

registry.example.com {
    reverse_proxy 127.0.0.1:3100
    header X-Real-IP {remote_host}
    header X-Forwarded-For {remote_host}
}
```

如果用 Nginx，`location /` 里需要：

```nginx
proxy_set_header Host $host;
proxy_set_header X-Real-IP $remote_addr;
proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
proxy_set_header X-Forwarded-Proto $scheme;
proxy_pass http://127.0.0.1:3000;
```

商户 API 支持 IP 白名单，反向代理必须正确透传 `x-forwarded-for`，否则启用了白名单的商户会被误拦截。

---

## 3. 拉代码 + 配置 `.env`

```bash
git clone https://github.com/AuuCoder/NovaPay.git
cd NovaPay
cp .env.docker-compose.example .env
vim .env
```

至少修改以下变量：

```bash
# Postgres
POSTGRES_USER="novapay"
POSTGRES_PASSWORD="生成强随机"      # openssl rand -hex 24
DATABASE_URL="postgresql://novapay:<上面的密码>@postgres:5432/novapay?schema=public"
REGISTRY_DATABASE_URL="postgresql://novapay:<上面的密码>@postgres:5432/novapay_registry?schema=public"

# MinIO
MINIO_ACCESS_KEY="生成强随机"        # openssl rand -hex 12
MINIO_SECRET_KEY="生成强随机"        # openssl rand -hex 24
S3_ACCESS_KEY_ID="${MINIO_ACCESS_KEY}"
S3_SECRET_ACCESS_KEY="${MINIO_SECRET_KEY}"
S3_BUCKET="novapay-registry-packages"
S3_ENDPOINT_URL="http://minio:9000"
S3_REGION="us-east-1"
S3_FORCE_PATH_STYLE="true"

# 公网域名
NOVAPAY_PUBLIC_BASE_URL="https://pay.example.com"
REGISTRY_APP_URL="https://registry.example.com"

# 加密密钥
NOVAPAY_DATA_ENCRYPTION_KEY="生成 32 字节 base64"   # openssl rand -base64 32
REGISTRY_DEFAULT_APP_KEY="生成强随机"               # openssl rand -hex 32
REGISTRY_SSO_SECRET="生成强随机"                    # openssl rand -hex 32

# 引导管理员
ADMIN_BOOTSTRAP_ENABLED="1"
ADMIN_BOOTSTRAP_EMAIL="admin@example.com"
ADMIN_BOOTSTRAP_PASSWORD="生成强随机"
ADMIN_BOOTSTRAP_NAME="Platform Administrator"
```

注意：

- `NOVAPAY_PUBLIC_BASE_URL` 必须是公开 HTTPS 域名，绝不能是 `localhost`
- 支付宝和微信支付参数不再由平台环境变量统一提供，而是由商户在控制台各自维护
- USDT 通道的收款地址也不写在平台 `.env`，而是由每个商户在自己的通道实例里配置
- 上线前务必修改所有 `REPLACE_WITH_*` 的占位密钥，否则生产会拒启动
- `ADMIN_BOOTSTRAP_ENABLED` 在第一次拉起 admin 后建议改成 `0`，避免每次重启都覆盖管理员密码

---

## 4. 数据库 + 对象存储初始化

```bash
# 4.1 创建 novapay_registry 数据库（postgres 容器内执行 createdb）
docker compose -f deploy/docker-compose.prod.yml --profile ops run --rm postgres-init

# 4.2 主站 Prisma 迁移
docker compose -f deploy/docker-compose.prod.yml --profile ops run --rm migrate

# 4.3 插件市场 Prisma 迁移
docker compose -f deploy/docker-compose.prod.yml --profile ops run --rm migrate-registry

# 4.4 生产前置检查（数据库可达 / 关键 env / USDT 通道地址唯一性）
docker compose -f deploy/docker-compose.prod.yml --profile ops run --rm preflight
```

四步全绿后再 `up -d`。

USDT 通道额外检查：

- 对应链的 RPC / Token / Mint 是否配置好
- 是否存在重复的链上收款地址
- 是否需要启动 `onchain-worker`
- 如启用 CTF 账单捕获通道，确认 `ctf-bill-capture-worker` 会启动

---

## 5. 启动应用栈

```bash
docker compose -f deploy/docker-compose.prod.yml up -d
```

应该看到 11 个容器都 `Up (healthy)`：

| 容器 | 端口 | 用途 |
|---|---|---|
| `postgres` | 5432（仅容器网络） | 共享数据库 |
| `minio` | 9001（127.0.0.1） | 对象存储管理控制台 |
| `web` | 3000 | 主站 |
| `registry` | 3100 | 插件市场 |
| `callbacks-worker` | — | 商户业务回调重试 |
| `finance-worker` | — | 财务流水同步 |
| `ctf-bill-capture-worker` | — | CTF App 账单捕获匹配 |
| `payment-monitor-worker` | — | 官方支付宝 / 微信订单监控补单 |
| `onchain-worker` | — | USDT 链上扫描 |
| `minio-init` | — | 一次性 bucket 创建 |
| 反向代理（Caddy/Nginx） | 80/443 | HTTPS 入口 |

主站和插件市场的 `:3000` / `:3100` 端口都已绑到本机，反向代理转发即可。MinIO S3 API 端口 `:9000` 默认不对外暴露——只有反向代理可以代理它，或者通过 SSH 隧道访问 `:9001` 控制台。

---

## 6. 上线后核对

按顺序逐项检查：

1. `curl https://pay.example.com/api/health` 返回 200 且 `database: ok`
2. `curl https://registry.example.com/api/.well-known/trust.json` 返回 200，里头有当前 ACTIVE 的 Ed25519 公钥
3. 浏览器打开 `https://pay.example.com/admin/login`，能用 `ADMIN_BOOTSTRAP_*` 登录
4. 浏览器打开 `https://pay.example.com/docs`，OpenAPI 文档页可访问
5. 商户能注册、被审核通过、登录成功
6. 五个 worker 都在 `docker compose ps` 输出里且 `Up`
7. 在 admin 后台 `/admin/plugins` 看到 7 个内置插件，状态为「已安装 / 已启用」

---

## 7. USDT 上线专项检查

如果本次还要一起上线链上 USDT：

### 7.1 商户配置检查

1. 商户已经在控制台创建并启用了 `usdt.bsc`、`usdt.base` 或 `usdt.sol` 通道实例
2. 每个通道实例都填写了正确的收款地址
3. 同一条链上，不同商户没有复用同一个收款地址
4. `merchantChannelBinding` 已指向对应商户实例

### 7.2 平台系统配置

按启用的链补齐系统配置（`/admin/system-config` 页面或直接 `SystemConfig` 表）：

- BSC：`USDT_BSC_RPC_URL`、`USDT_BSC_TOKEN_CONTRACT`
- Polygon：`USDT_BASE_RPC_URL`、`USDT_BASE_TOKEN_CONTRACT`
- Solana：`USDT_SOL_RPC_URL`、`USDT_SOL_MINT`

可选调优：

- `USDT_BSC_CONFIRMATIONS` / `USDT_BASE_CONFIRMATIONS` / `USDT_SOL_CONFIRMATIONS`
- `USDT_TAIL_STEP` / `USDT_TAIL_MAX` / `USDT_TAIL_RELATIVE_MAX_BPS`

默认策略：

- 汇率主源：`CoinGecko`
- 汇率备用：`CoinPaprika`
- 双源失败：固定 `7.2`
- 尾差步长：`0.0001 USDT`
- 尾差上限：`0.0099 USDT`
- 相对尾差上限：`0.3%`

### 7.3 首次实单建议

先只放开一条链做验证，例如先测 `usdt.bsc`：

1. 商户后台启用 `usdt.bsc`
2. 调用 `POST /api/payment-orders` 创建一笔小额订单
3. 确认返回里有：`hostedCheckoutUrl`、`payableAmount`、`payableCurrency`、`quoteRate`、`quoteExpiresAt`
4. 打开托管支付页确认地址、链路、精确金额都正确
5. 钱包按精确金额转入
6. 查看 `onchain-worker` 日志，确认检测到入账并配单
7. 订单状态变成 `SUCCEEDED`
8. 商户业务回调送达

### 7.4 异常处理

- 同金额订单太多 → 系统通过尾差分配精确应付，槽用尽时拒绝下单
- 链上到账金额与页面金额不完全一致 → 不会自动确认，避免误配
- 多商户错误地配置了同链同地址 → 预检失败，worker 跳过该地址
- 链 RPC 故障 → `onchain-worker` 记录错误但不影响其他 worker

---

## 8. CTF 账单捕获实战检查

这一段只用于沙箱 / CTF 个人免签监控收款训练。平台侧接收的是训练端标准化后的 App 账单事件，不是平台统一代收钱包。

1. 给商户安装 `ctf.alipay.monitor` 或 `ctf.wxpay.monitor`。
2. 创建并启用商户通道实例。可选配置：
   - `qrPayload`：沙箱收款码内容 / URL
   - `receiverLabel`：托管收银台展示的收款账户标识
   - `collectorSecret`：采集端二次密钥
3. 复制通道实例页面展示的回调 URL，它会指向：

```text
POST /api/ctf/bill-capture/{accountId}/{token}
Header: x-ctf-capture-secret: <必填 collectorSecret>
```

4. 用 CTF 通道创建订单并打开托管收银台。
5. 让抓包 / Hook 训练端投递标准化账单 JSON，例如：

```json
{
  "channelCode": "ctf.alipay.monitor",
  "amount": "88.00",
  "paidAt": "2026-06-22 12:30:00",
  "externalBillId": "CTF-ALIPAY-BILL-0001",
  "payerAccount": "buyer@example.test",
  "remark": "ORDER-20260622-001 NovaPay CTF",
  "source": "frida-alipay-lab"
}
```

6. `ctf-bill-capture-worker` 会立即匹配或在下一轮扫描中处理 `RECEIVED` 账单事件。匹配成功后订单变为 `SUCCEEDED`，同步生成财务流水并触发商户业务回调。

---

## 9. 财务运营

财务页提供：

- 对账日报
- 资金流水
- 结算单
- 余额快照

推荐流程：

1. `finance-worker` 定时补齐支付、手续费、退款分录
2. 自动生成商户结算单和余额快照
3. 财务在后台确认结算单后手动「标记已打款」

标记已打款时系统会写一条 `SETTLEMENT_PAYOUT` 资金流水并重新计算余额快照。

---

## 10. 备份与恢复

### 9.1 自动备份

`pg_dump` 和 MinIO 数据卷必须定期备份。最小脚本（放 cron）：

```bash
#!/bin/bash
# backup.sh — 每天凌晨 3 点跑
set -euo pipefail
DATE="$(date +%Y%m%d)"
BACKUP_DIR="/backup/novapay/$DATE"
mkdir -p "$BACKUP_DIR"

# 数据库
docker compose -f /opt/novapay/deploy/docker-compose.prod.yml exec -T postgres \
  pg_dump -U novapay novapay | gzip > "$BACKUP_DIR/novapay.sql.gz"
docker compose -f /opt/novapay/deploy/docker-compose.prod.yml exec -T postgres \
  pg_dump -U novapay novapay_registry | gzip > "$BACKUP_DIR/novapay_registry.sql.gz"

# MinIO（增量同步到外部存储）
docker compose -f /opt/novapay/deploy/docker-compose.prod.yml exec -T minio \
  mc mirror --overwrite local/novapay-registry-packages "$BACKUP_DIR/minio/"

# 保留 30 天
find /backup/novapay -mindepth 1 -maxdepth 1 -type d -mtime +30 -exec rm -rf {} +
```

更稳的做法：把 `/backup/novapay` 同步到云存储（阿里云 OSS / Backblaze B2 / S3 Glacier），或者直接配置 Postgres 流复制。

### 9.2 恢复

```bash
# Postgres
gunzip < novapay.sql.gz | docker compose exec -T postgres psql -U novapay novapay
gunzip < novapay_registry.sql.gz | docker compose exec -T postgres psql -U novapay novapay_registry

# MinIO
docker compose exec -T minio mc mirror --overwrite /backup/minio/ local/novapay-registry-packages
```

恢复后跑一次 `preflight` 确认数据库一致，然后再 `up -d`。

---

## 11. 升级流程

```bash
cd /opt/novapay
git pull

# 重新拉镜像 + 重新构建
docker compose -f deploy/docker-compose.prod.yml build --pull

# 跑迁移（如果有新的）
docker compose -f deploy/docker-compose.prod.yml --profile ops run --rm migrate
docker compose -f deploy/docker-compose.prod.yml --profile ops run --rm migrate-registry

# 滚动重启
docker compose -f deploy/docker-compose.prod.yml up -d
```

升级前建议先备份一份数据库，遇到 schema 变更回滚困难。

---

## 12. 监控与日志

最小必要监控：

- `/api/health` 每分钟 ping 一次
- `/api/.well-known/trust.json` 每分钟 ping 一次
- 五个 worker 进程是否在 `docker compose ps` 中保持 `Up`
- Postgres 容器是否 healthy
- 磁盘使用率（数据库 + MinIO 数据卷 + 日志）

容器日志查看：

```bash
docker compose -f deploy/docker-compose.prod.yml logs -f web
docker compose -f deploy/docker-compose.prod.yml logs -f registry
docker compose -f deploy/docker-compose.prod.yml logs -f callbacks-worker
docker compose -f deploy/docker-compose.prod.yml logs -f ctf-bill-capture-worker
docker compose -f deploy/docker-compose.prod.yml logs -f payment-monitor-worker
```

如果接 ELK / Loki，建议用 docker logging driver 直接转发，避免 `docker logs` 文件膨胀。

---

## 13. 安全检查清单

上线前过一遍：

- [ ] `.env` 里所有 `REPLACE_WITH_*` 都已替换
- [ ] `NOVAPAY_DATA_ENCRYPTION_KEY` 是 32 字节随机值，不是开发默认
- [ ] `REGISTRY_DEFAULT_APP_KEY` / `REGISTRY_SSO_SECRET` 是随机值，不是开发默认
- [ ] HTTPS 已配置，反向代理透传 `X-Forwarded-For`
- [ ] Postgres / MinIO 端口未对公网暴露
- [ ] 防火墙只放行 80 / 443 / SSH
- [ ] `ADMIN_BOOTSTRAP_ENABLED` 在首次部署后改为 `0`
- [ ] `pg_dump` cron 已配置且至少跑过一次成功
- [ ] 商户的支付凭证全部由商户在后台填写，没有任何 `ALIPAY_*` / `WXPAY_*` 在 `.env` 里
- [ ] 已运行 `npm run env:check:prod`（在容器内：`docker compose --profile ops run --rm preflight`）

---

## 14. 故障排查

| 症状 | 可能原因 | 排查 |
|---|---|---|
| 商户登录后立刻退出 | Cookie 域不匹配 | 检查 `NOVAPAY_PUBLIC_BASE_URL` 是否跟反向代理对外域名一致 |
| 创建订单 422 PLUGIN_NOT_INSTALLED | 通道插件未安装/未启用 | `/admin/plugins` 检查插件状态 |
| 支付完没回来 | 上游 returnUrl 不接受当前域名 | 改用真实 HTTPS 域名，不要用 localhost / xx.localtest.me |
| 回调没到商户 | `callbacks-worker` 未运行或商户回调返回非 2xx | `docker compose logs callbacks-worker` |
| 官方支付状态同步滞后 | `payment-monitor-worker` 未运行 / 上游查询接口异常 | `docker compose logs payment-monitor-worker` |
| CTF 账单已上报但订单未成功 | `ctf-bill-capture-worker` 未运行 / 金额或备注不匹配 / 上报到了错误通道实例 URL | `docker compose logs ctf-bill-capture-worker` 并检查 `CtfBillCaptureEvent` |
| USDT 不到账 | `onchain-worker` 未运行 / 链 RPC 异常 | `docker compose logs onchain-worker` |
| 插件下载 403 | MinIO 凭证不对 / bucket 没建 | `mc alias set` + `mc ls local/` 检查 |
| Registry 启动报「No active signing key」 | 数据库为空或迁移没跑 | 重跑 `migrate-registry`，重启 registry |

---

## 15. 不要做的事

- 不要在生产用 `db:push` 或 `db:migrate dev`
- 不要把 `.env` 提交到 git
- 不要让 Postgres / MinIO / Worker 容器对公网开放端口
- 不要在 `.env` 里写商户的支付凭证
- 不要禁用 `secure` cookie（生产必须有 HTTPS）
- 不要把 `MinIO root` 凭证当成商户使用的 S3 token（生产应该专门为应用层创建受限的 access key）
- 不要在多副本部署时让两台机器同时跑 `finance-worker` / `ctf-bill-capture-worker` / `payment-monitor-worker` / `onchain-worker`（会重复扣账、重复匹配或重复补单）
