[简体中文](./production-runbook.zh-CN.md)

# Production Runbook

Standard launch flow for NovaPay on a single server. The full stack consists of:

- Main app (NovaPay gateway + admin console + hosted checkout)
- Plugin Registry (independent Next.js service)
- Five background workers: callbacks / finance / ctf-bill-capture / payment-monitor / onchain
- PostgreSQL 16 (two databases: `novapay`, `novapay_registry`)
- MinIO (S3-compatible object storage for plugin bundles)

Recommended topology: every component runs inside Docker Compose, fronted by Nginx / Caddy / Cloudflare for HTTPS.

---

## 1. Server prerequisites

Minimum specs:

- 4 vCPU / 4 GB RAM / 40 GB SSD
- Ubuntu 22.04 / Debian 12 / Rocky 9 or another mainstream distro
- A public IP and at least two domains (main app, plugin registry)

Software:

```bash
# Install Docker Engine + Compose v2
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
# Re-login to take effect

docker --version            # 24+ or 27+
docker compose version      # v2.x
```

If `docker compose version` says `Emulate Docker CLI using podman` or `external compose provider`, you're on a podman shim or Compose v1 — switch to the official Docker Engine first.

---

## 2. Domains and HTTPS

Prepare two subdomains:

- `pay.example.com` → main app
- `registry.example.com` → plugin registry

Both A-records point to this server. HTTPS is handled by the front proxy. Caddy is the simplest (auto Let's Encrypt):

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

For Nginx, the `location /` block must include:

```nginx
proxy_set_header Host $host;
proxy_set_header X-Real-IP $remote_addr;
proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
proxy_set_header X-Forwarded-Proto $scheme;
proxy_pass http://127.0.0.1:3000;
```

The merchant API uses IP allowlists; the reverse proxy must forward `x-forwarded-for` correctly, otherwise allowlisted merchants get rejected.

---

## 3. Clone code and configure `.env`

```bash
git clone https://github.com/AuuCoder/NovaPay.git
cd NovaPay
cp .env.docker-compose.example .env
vim .env
```

Replace at least these values:

```bash
# Postgres
POSTGRES_USER="novapay"
POSTGRES_PASSWORD="<random>"        # openssl rand -hex 24
DATABASE_URL="postgresql://novapay:<password>@postgres:5432/novapay?schema=public"
REGISTRY_DATABASE_URL="postgresql://novapay:<password>@postgres:5432/novapay_registry?schema=public"

# MinIO
MINIO_ACCESS_KEY="<random>"          # openssl rand -hex 12
MINIO_SECRET_KEY="<random>"          # openssl rand -hex 24
S3_ACCESS_KEY_ID="${MINIO_ACCESS_KEY}"
S3_SECRET_ACCESS_KEY="${MINIO_SECRET_KEY}"
S3_BUCKET="novapay-registry-packages"
S3_ENDPOINT_URL="http://minio:9000"
S3_REGION="us-east-1"
S3_FORCE_PATH_STYLE="true"

# Public URLs
NOVAPAY_PUBLIC_BASE_URL="https://pay.example.com"
REGISTRY_APP_URL="https://registry.example.com"

# Cryptographic keys
NOVAPAY_DATA_ENCRYPTION_KEY="<base64 32 bytes>"      # openssl rand -base64 32
REGISTRY_DEFAULT_APP_KEY="<random>"                  # openssl rand -hex 32
REGISTRY_SSO_SECRET="<random>"                       # openssl rand -hex 32

# Bootstrap admin
ADMIN_BOOTSTRAP_ENABLED="1"
ADMIN_BOOTSTRAP_EMAIL="admin@example.com"
ADMIN_BOOTSTRAP_PASSWORD="<random>"
ADMIN_BOOTSTRAP_NAME="Platform Administrator"
```

Notes:

- `NOVAPAY_PUBLIC_BASE_URL` must be a public HTTPS domain — never `localhost`.
- 支付宝和微信支付参数不再由平台环境变量统一提供 (Alipay and WeChat Pay credentials no longer come from platform env vars; merchants manage them in the merchant console.)
- USDT receiving addresses also live per-merchant in the channel instance, not in `.env`.
- Replace every `REPLACE_WITH_*` placeholder before launching, otherwise the production guard refuses to start.
- After the first admin login succeeds, set `ADMIN_BOOTSTRAP_ENABLED="0"` so subsequent restarts don't reset the admin password.

---

## 4. Database + object storage initialization

```bash
# 4.1 Create the novapay_registry database (executed inside the postgres container)
docker compose -f deploy/docker-compose.prod.yml --profile ops run --rm postgres-init

# 4.2 Main-app Prisma migrations
docker compose -f deploy/docker-compose.prod.yml --profile ops run --rm migrate

# 4.3 Registry Prisma migrations
docker compose -f deploy/docker-compose.prod.yml --profile ops run --rm migrate-registry

# 4.4 Production preflight (DB reachable, critical envs set, USDT address uniqueness)
docker compose -f deploy/docker-compose.prod.yml --profile ops run --rm preflight
```

All four steps must succeed before `up -d`.

Extra checks for USDT channels:

- Per-chain RPC / token / mint configured
- No duplicate on-chain receiving addresses
- `onchain-worker` is in the live process set
- `payment-monitor-worker` is in the live process set
- `ctf-bill-capture-worker` is in the live process set if CTF bill-capture channels are enabled

---

## 5. Launch the application stack

```bash
docker compose -f deploy/docker-compose.prod.yml up -d
```

Expect 11 containers in `Up (healthy)`:

| Container | Port | Role |
|---|---|---|
| `postgres` | 5432 (compose network only) | Shared database |
| `minio` | 9001 (127.0.0.1) | Object storage admin console |
| `web` | 3000 | Main app |
| `registry` | 3100 | Plugin registry |
| `callbacks-worker` | — | Merchant callback retries |
| `finance-worker` | — | Finance ledger sync |
| `ctf-bill-capture-worker` | — | CTF App bill-capture matching |
| `payment-monitor-worker` | — | Official Alipay / WeChat order reconciliation |
| `onchain-worker` | — | USDT chain scanning |
| `minio-init` | — | One-shot bucket bootstrap |
| Reverse proxy (Caddy/Nginx) | 80/443 | HTTPS gateway |

Both `:3000` and `:3100` are bound to the local host; the reverse proxy forwards public traffic. The MinIO S3 API at `:9000` stays internal — proxy it explicitly if you need public bundle downloads, otherwise tunnel `:9001` over SSH for the admin console.

---

## 6. Post-launch verification

Walk through these checks in order:

1. `curl https://pay.example.com/api/health` returns 200 with `database: ok`
2. `curl https://registry.example.com/api/.well-known/trust.json` returns 200 with the active Ed25519 public key
3. `https://pay.example.com/admin/login` accepts the bootstrap admin credentials
4. `https://pay.example.com/docs` renders the OpenAPI page
5. A merchant can register, get approved, and sign in
6. All five workers show `Up` in `docker compose ps`
7. `/admin/plugins` lists 7 built-in plugins as installed + enabled

---

## 7. USDT-specific checks

If this launch also enables on-chain USDT, run through this section.

### 7.1 Merchant configuration

1. The merchant has created and enabled a `usdt.bsc` / `usdt.base` / `usdt.sol` channel instance
2. Each instance has a real receiving address
3. No two merchants share the same receiving address on the same chain
4. `MerchantChannelBinding` points to the right instance

### 7.2 System config

Fill in (via `/admin/system-config` or the `SystemConfig` table) for every enabled chain:

- BSC: `USDT_BSC_RPC_URL`, `USDT_BSC_TOKEN_CONTRACT`
- Polygon: `USDT_BASE_RPC_URL`, `USDT_BASE_TOKEN_CONTRACT`
- Solana: `USDT_SOL_RPC_URL`, `USDT_SOL_MINT`

Optional tuning:

- `USDT_BSC_CONFIRMATIONS` / `USDT_BASE_CONFIRMATIONS` / `USDT_SOL_CONFIRMATIONS`
- `USDT_TAIL_STEP` / `USDT_TAIL_MAX` / `USDT_TAIL_RELATIVE_MAX_BPS`

Defaults:

- Primary rate source: CoinGecko
- Secondary: CoinPaprika
- Both fail → fixed rate `7.2`
- Tail step: `0.0001 USDT`
- Tail cap: `0.0099 USDT`
- Relative tail cap: `0.3%`

### 7.3 First real-money test

Bring up one chain at a time. For example with `usdt.bsc`:

1. Enable `usdt.bsc` in the merchant console
2. `POST /api/payment-orders` with a small amount
3. Verify the response carries `hostedCheckoutUrl`, `payableAmount`, `payableCurrency`, `quoteRate`, `quoteExpiresAt`
4. Open the hosted checkout page and check the address, network label, and exact amount
5. From a real wallet, transfer the exact amount
6. `docker compose logs -f onchain-worker` shows the deposit detected and matched
7. The order transitions to `SUCCEEDED`
8. The merchant business callback fires

### 7.4 Failure modes

- Many concurrent same-amount orders → tail allocation gives unique payable amounts; if the tail slots run out, new orders are rejected
- On-chain amount doesn't match the quoted amount → the worker leaves the order untouched (no auto-confirm)
- Two merchants accidentally share an address → preflight fails; the worker also skips that address
- RPC outage → the worker logs errors but other workers stay up

---

## 8. CTF bill-capture drill check

Use this only for sandbox / CTF personal no-signature collection drills. The platform side expects a normalized bill event from the lab capture agent, not a platform-owned pooled wallet.

1. Install `ctf.alipay.monitor` or `ctf.wxpay.monitor` for the merchant.
2. Create and enable a merchant channel instance. Optional config:
   - `qrPayload`: sandbox receiving QR payload / URL
   - `receiverLabel`: display label shown on hosted checkout
   - `collectorSecret`: required secret for the capture agent
3. Copy the channel callback URL shown in the channel instance. It resolves to:

```text
POST /api/ctf/bill-capture/{accountId}/{token}
Header: x-ctf-capture-secret: <required collectorSecret>
```

4. Create an order on the CTF channel and open the hosted checkout page.
5. Post a normalized bill JSON from the CTF capture agent, for example:

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

6. `ctf-bill-capture-worker` should either match immediately or pick up the stored `RECEIVED` event on the next scan. A successful match sets the payment order to `SUCCEEDED`, creates ledger entries, and dispatches the merchant callback.

---

## 9. Finance ops

The finance page provides:

- Reconciliation reports
- Cash flow ledger
- Settlements
- Balance snapshots

Recommended workflow:

1. `finance-worker` continuously fills in payment / fee / refund entries
2. Settlement statements and balance snapshots regenerate automatically
3. The finance team reviews settlements and clicks **Mark as Paid** in the admin console

That action writes a `SETTLEMENT_PAYOUT` ledger entry and recomputes the balance snapshot.

---

## 10. Backup and restore

### 9.1 Automated backup

`pg_dump` and the MinIO data volume must be backed up regularly. Minimal cron script:

```bash
#!/bin/bash
# backup.sh — daily at 3 AM
set -euo pipefail
DATE="$(date +%Y%m%d)"
BACKUP_DIR="/backup/novapay/$DATE"
mkdir -p "$BACKUP_DIR"

# Databases
docker compose -f /opt/novapay/deploy/docker-compose.prod.yml exec -T postgres \
  pg_dump -U novapay novapay | gzip > "$BACKUP_DIR/novapay.sql.gz"
docker compose -f /opt/novapay/deploy/docker-compose.prod.yml exec -T postgres \
  pg_dump -U novapay novapay_registry | gzip > "$BACKUP_DIR/novapay_registry.sql.gz"

# MinIO (incremental sync into the backup tree)
docker compose -f /opt/novapay/deploy/docker-compose.prod.yml exec -T minio \
  mc mirror --overwrite local/novapay-registry-packages "$BACKUP_DIR/minio/"

# Keep 30 days
find /backup/novapay -mindepth 1 -maxdepth 1 -type d -mtime +30 -exec rm -rf {} +
```

For real durability, sync `/backup/novapay` to off-host storage (S3 Glacier, Aliyun OSS, Backblaze B2) or use Postgres streaming replication.

### 9.2 Restore

```bash
# Postgres
gunzip < novapay.sql.gz | docker compose exec -T postgres psql -U novapay novapay
gunzip < novapay_registry.sql.gz | docker compose exec -T postgres psql -U novapay novapay_registry

# MinIO
docker compose exec -T minio mc mirror --overwrite /backup/minio/ local/novapay-registry-packages
```

After a restore, run `preflight` once before `up -d`.

---

## 11. Upgrade flow

```bash
cd /opt/novapay
git pull

# Rebuild images
docker compose -f deploy/docker-compose.prod.yml build --pull

# Apply pending migrations (if any)
docker compose -f deploy/docker-compose.prod.yml --profile ops run --rm migrate
docker compose -f deploy/docker-compose.prod.yml --profile ops run --rm migrate-registry

# Rolling restart
docker compose -f deploy/docker-compose.prod.yml up -d
```

Always back up the databases before applying schema changes — rollbacks are painful.

---

## 12. Monitoring and logs

Bare minimum monitoring:

- `/api/health` ping every minute
- `/api/.well-known/trust.json` ping every minute
- All five workers stay `Up` in `docker compose ps`
- Postgres container reports healthy
- Disk usage on database and MinIO data volumes

Log tailing:

```bash
docker compose -f deploy/docker-compose.prod.yml logs -f web
docker compose -f deploy/docker-compose.prod.yml logs -f registry
docker compose -f deploy/docker-compose.prod.yml logs -f callbacks-worker
docker compose -f deploy/docker-compose.prod.yml logs -f ctf-bill-capture-worker
docker compose -f deploy/docker-compose.prod.yml logs -f payment-monitor-worker
```

For ELK / Loki, configure the Docker logging driver to forward directly instead of relying on `docker logs` files growing unboundedly.

---

## 13. Security checklist

Walk through this before going live:

- [ ] Every `REPLACE_WITH_*` placeholder in `.env` has been replaced
- [ ] `NOVAPAY_DATA_ENCRYPTION_KEY` is a fresh 32-byte random value (not the dev default)
- [ ] `REGISTRY_DEFAULT_APP_KEY` and `REGISTRY_SSO_SECRET` are random (not dev defaults)
- [ ] HTTPS is in place; the proxy forwards `X-Forwarded-For`
- [ ] Postgres / MinIO ports are not publicly exposed
- [ ] Firewall only opens 80 / 443 / SSH
- [ ] `ADMIN_BOOTSTRAP_ENABLED` set to `0` after first login
- [ ] `pg_dump` cron is set up and at least one backup has succeeded
- [ ] No `ALIPAY_*` / `WXPAY_*` credentials in `.env` — every merchant manages their own in the console
- [ ] `npm run env:check:prod` (or the `preflight` compose service) returns OK

---

## 14. Troubleshooting

| Symptom | Possible cause | Where to look |
|---|---|---|
| Merchant logs in then immediately bounces | Cookie domain mismatch | Verify `NOVAPAY_PUBLIC_BASE_URL` matches the proxy's public hostname |
| Order creation returns 422 PLUGIN_NOT_INSTALLED | Channel plugin not installed/enabled | Check `/admin/plugins` |
| Browser doesn't return after Alipay payment | Upstream rejects the returnUrl | Use a real HTTPS domain — never `localhost` or `*.localtest.me` |
| Merchant never receives a callback | Worker not running, or merchant returns non-2xx | `docker compose logs callbacks-worker` |
| Official payment sync lags behind | `payment-monitor-worker` not running, or upstream query API is failing | `docker compose logs payment-monitor-worker` |
| CTF App bill posted but order not paid | `ctf-bill-capture-worker` not running, amount/remark mismatch, or wrong channel instance URL | `docker compose logs ctf-bill-capture-worker` and inspect `CtfBillCaptureEvent` |
| USDT deposits not picked up | Worker not running, or RPC outage | `docker compose logs onchain-worker` |
| Plugin download 403 | MinIO credentials wrong, bucket missing | `mc alias set` then `mc ls local/` |
| Registry boot error: "No active signing key" | Empty DB, migrations didn't run | Re-run `migrate-registry`, restart `registry` |

---

## 15. Things to avoid

- Don't run `db:push` or `db:migrate dev` in production
- Don't commit `.env` to git
- Don't expose Postgres / MinIO / worker container ports to the internet
- Don't put merchant payment credentials in `.env`
- Don't disable secure cookies (HTTPS is mandatory)
- Don't share the MinIO `root` credentials with the application — create scoped access keys
- Don't run `finance-worker` / `ctf-bill-capture-worker` / `payment-monitor-worker` / `onchain-worker` on two replicas simultaneously (double-counts ledger entries and reconciliation work)
