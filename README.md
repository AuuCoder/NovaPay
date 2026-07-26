[简体中文](./README.zh-CN.md)

# NovaPay

NovaPay is a production-ready, multi-merchant payment gateway with a hosted checkout, built-in plugin marketplace, and turn-key Docker deployment.

It does not act as a single pooled platform wallet. Each merchant manages its own upstream credentials (Alipay, WeChat Pay, USDT receiving addresses, etc.); the platform provides one unified order API, request signing, callback routing, refunds, finance ledgers, and a plugin marketplace for adding new payment channels without redeploying the gateway.

---

## Highlights

- **Multi-merchant payment gateway** — each merchant runs on its own credentials and receiving accounts; the platform never holds shared collection capability on their behalf.
- **Plugin marketplace (`apps/registry`)** — a separate Next.js service that catalogs free and paid payment plugins, signs bundles with Ed25519, issues per-instance licenses (JWS), and ships its own admin/developer console.
- **Sandboxed plugin runtime** — third-party plugins load through a `worker_threads` sandbox with a static scan against `child_process`, `eval`, file-system writes, and other escape hatches.
- **Hosted checkout** — branded payment pages for Alipay, WeChat Pay Native, and USDT (BSC / Polygon / Solana) with countdowns, status polling, and quote-locked payable amounts.
- **Operational tooling** — admin dashboards, merchant self-service, finance ledgers, refund flows, callback retry workers, CTF bill-capture workers, payment-monitor workers, on-chain matching workers, audit logs, and OpenAPI docs.
- **Docker-native deployment** — one `docker compose up -d` command launches the main app, plugin registry, five workers, Postgres, and MinIO together.
- **Beijing-time consistent UI** — every datetime in the admin/merchant consoles and hosted checkout pages renders in `Asia/Shanghai`, regardless of server timezone.

---

## Architecture

```
                    ┌──────────────────────────────────────────┐
                    │            Reverse proxy (HTTPS)         │
                    └──────────────────────────────────────────┘
                          │                          │
                          ▼                          ▼
       ┌────────────────────────┐    ┌────────────────────────────┐
       │  NovaPay main app      │    │  Plugin Registry (apps/    │
       │  /admin /merchant      │    │  registry)                 │
       │  /pay /api/payment-... │    │  /developer /governance    │
       │  Next.js 16 :3000      │    │  Next.js 16 :3100          │
       └────────────────────────┘    └────────────────────────────┘
                │                                 │
                ├────────── Postgres 16 ──────────┤
                │      novapay      novapay_registry
                │
                └────────── MinIO / S3 / R2 / OSS
                            (signed plugin bundles)

       Background workers:
       ─ callbacks-worker     merchant business callback retries
       ─ finance-worker       ledger sync, balance snapshots, settlements
       ─ ctf-bill-capture-worker sandbox App bill-capture reconciliation
       ─ payment-monitor-worker official payment order reconciliation
       ─ onchain-worker       USDT BSC / Polygon / Solana deposit matching
```

| Component | Role | Storage |
|---|---|---|
| Main app | Payment gateway, admin, merchant console, hosted checkout | `novapay` Postgres |
| Plugin Registry | Marketplace catalog, license issuance, developer portal | `novapay_registry` Postgres + S3 |
| MinIO / S3 | Signed plugin bundle storage | Object storage |
| Workers | Async retries, finance sync, bill-capture matching, payment polling, on-chain scanning | Shared Postgres |

---

## CTF bill-capture channels

NovaPay includes two sandbox-only channels for the personal no-signature collection drill:

- `ctf.alipay.monitor` — Alipay App bill-capture training channel
- `ctf.wxpay.monitor` — WeChat App bill-capture training channel

Create a merchant channel instance, copy its generated bill ingest URL, and let the CTF capture agent post normalized bill JSON to:

```text
POST /api/ctf/bill-capture/{accountId}/{token}
Header: x-ctf-capture-secret: <required collectorSecret>
```

The matcher stores the bill event, de-duplicates by fingerprint, then matches open orders by channel, amount, time window, and remark. A successful match reuses the normal order state machine, ledger sync, and merchant callback flow.

---

## Quick Start (Docker)

The fastest path: run everything in Docker. Postgres, MinIO, and the apps all come up together.

### Prerequisites

- Docker Engine + Docker Compose v2
- Domain or `localhost` reachable on the host
- ~4 GB RAM

### One-command development

```bash
docker compose -f deploy/docker-compose.dev.yml up -d
```

This launches Postgres on `:5432` and MinIO on `:9000` (S3 API) / `:9001` (web console). Use this when you want to develop the apps directly on the host:

```bash
npm install
cp .env.example .env
npm run db:migrate:deploy
npm run dev:main                              # main app on :3000

cd apps/registry
npm install
npx prisma migrate deploy
npm run dev:registry                          # registry on :3100
```

### Production deployment (single host)

```bash
git clone https://github.com/AuuCoder/NovaPay.git && cd NovaPay
cp .env.docker-compose.example .env
vim .env                                      # rotate every REPLACE_WITH_* value

docker compose -f deploy/docker-compose.prod.yml --profile ops run --rm postgres-init
docker compose -f deploy/docker-compose.prod.yml --profile ops run --rm migrate
docker compose -f deploy/docker-compose.prod.yml --profile ops run --rm migrate-registry
docker compose -f deploy/docker-compose.prod.yml --profile ops run --rm preflight

docker compose -f deploy/docker-compose.prod.yml up -d
```

After the stack starts:

- Main app: `http://<your-server>:3000`
- Plugin registry: `http://<your-server>:3100`
- MinIO console (admin only, exposed on `127.0.0.1:9001`): tunnel via SSH

Put a reverse proxy (Nginx / Caddy / Cloudflare) in front of `:3000` and `:3100` for HTTPS.

---

## Built-in Payment Channels

| Channel | Provider | Mode |
|---|---|---|
| `alipay.page` | Alipay | Page redirect |
| `wxpay.native` | WeChat Pay | Native QR code |
| `usdt.bsc` | USDT on BNB Smart Chain | On-chain transfer |
| `usdt.base` | USDT on Polygon | On-chain transfer |
| `usdt.sol` | USDT on Solana | On-chain transfer |

Channels live as plugins. The plugin marketplace ships them as official `novapay.*` packages; third-party plugins can extend the set without modifying gateway code.

---

## Plugin Marketplace

The registry is an independent Next.js service with its own database and S3 bucket. It ships:

- **Public catalog API** consumed by every NovaPay instance: `GET /api/registry/plugins`, `GET /api/registry/packages/:slug/:version/download`.
- **Trust anchor + Ed25519 signing**: `/.well-known/trust.json` lets consumers verify bundle signatures offline.
- **Developer portal**: register, upload plugin versions, view sales, request payouts, manage PATs.
- **Governance console**: review queue, takedown workflow, license revocations.
- **Paid plugin flow**: NovaPay sends the buyer through its own hosted checkout for the registry purchase, the registry signs a JWS license, and the consumer instance verifies the license daily.

When the main app installs a paid plugin:

1. Admin clicks **Purchase** in `/admin/plugins`.
2. NovaPay calls `POST /api/registry/plugins/:slug/orders` on the registry with its instance ID.
3. The registry creates an order and returns a hosted checkout URL pointing back at NovaPay's own bridge merchant.
4. The buyer pays the registry through real Alipay/WeChat (the registry is also a NovaPay merchant — it dogfoods the gateway).
5. The registry signs a license; NovaPay downloads the bundle, verifies sha256 + Ed25519, sandbox-loads it, and marks the plugin installed.

---

## REST API

| Action | Endpoint |
|---|---|
| Docs page | `GET /docs` |
| OpenAPI JSON | `GET /api/openapi` |
| Health | `GET /api/health` |
| Channels | `GET /api/channels` |
| Create order | `POST /api/payment-orders` |
| Query order | `POST /api/payment-orders/{orderReference}` |
| Close order | `POST /api/payment-orders/{orderReference}/close` |
| Create refund | `POST /api/payment-orders/{orderReference}/refunds` |
| Query refund | `POST /api/payment-refunds/{refundReference}` |

Merchant requests must carry:

- `x-novapay-key`
- `x-novapay-timestamp`
- `x-novapay-nonce`
- `x-novapay-signature`
- `Idempotency-Key` (recommended)

Signature algorithm:

```text
hex(hmac_sha256(apiSecret, "{timestamp}.{nonce}.{rawBody}"))
```

Example body:

```json
{
  "merchantCode": "merchant-prod-cn-001",
  "channelCode": "usdt.bsc",
  "externalOrderId": "ORDER-20260410-001",
  "amount": "88.00",
  "subject": "NovaPay Production Order",
  "description": "USDT on-chain payment"
}
```

Behaviour notes:

- The merchant must already be approved.
- `x-novapay-nonce` must be globally unique; replays are rejected.
- Merchants do not need to and must not send `notifyUrl`; upstream callback URLs are generated per channel instance.
- `callbackUrl` overrides the merchant business callback if needed.
- If `returnUrl` is omitted, NovaPay's hosted return page is used.

For full signing and integration examples:

- [Merchant Integration Examples](./docs/merchant-integration-examples.md)
- [sub2apipay Migration Notes](./docs/sub2apipay-to-novapay.md)

---

## Roles

**Admins**
- Review merchant registrations
- Inspect orders, refunds, callbacks, and audit logs
- Manage system config and channel routing
- Inspect finance ledgers, balances, and settlements
- Browse, install, enable, and disable plugins from the registry

**Merchants**
- Self-register, sign in, and maintain profile
- Create their own Alipay / WeChat / USDT channel instances
- Configure IP allowlists, callback URLs, and API credentials
- Monitor their own orders, refunds, and channel status

**Plugin developers** (registry only)
- Register an account, upload plugin bundles
- Run automated test sessions before submitting for review
- Manage paid plugin pricing, view sales, request payouts

---

## Configuration Reference

Minimum platform secrets (`.env`):

```bash
# Postgres
DATABASE_URL="postgresql://novapay:secret@postgres:5432/novapay?schema=public"
REGISTRY_DATABASE_URL="postgresql://novapay:secret@postgres:5432/novapay_registry?schema=public"

# Object storage (S3 / MinIO / R2 / OSS — protocol-compatible)
S3_ENDPOINT_URL="http://minio:9000"
S3_BUCKET="novapay-registry-packages"
S3_ACCESS_KEY_ID="..."
S3_SECRET_ACCESS_KEY="..."
S3_REGION="us-east-1"
S3_FORCE_PATH_STYLE="true"

# Public-facing URLs
NOVAPAY_PUBLIC_BASE_URL="https://pay.example.com"
REGISTRY_APP_URL="https://registry.example.com"

# Cryptographic secrets — generate with `openssl rand -base64 32`
NOVAPAY_DATA_ENCRYPTION_KEY="..."
REGISTRY_DEFAULT_APP_KEY="..."
REGISTRY_SSO_SECRET="..."

# Bootstrap admin (only honoured the first time the app starts)
ADMIN_BOOTSTRAP_ENABLED="1"
ADMIN_BOOTSTRAP_EMAIL="admin@example.com"
ADMIN_BOOTSTRAP_PASSWORD="..."
ADMIN_BOOTSTRAP_NAME="Platform Administrator"
```

The full template lives in [`.env.docker-compose.example`](./.env.docker-compose.example).

`.env` should hold platform-level settings, not merchant production payment secrets. Merchant payment credentials belong inside the `MerchantChannelAccount` table, encrypted at rest with `NOVAPAY_DATA_ENCRYPTION_KEY`.

---

## Common Commands

```bash
# Develop
npm run dev:main
npm run dev:registry

# Database
npm run db:generate
npm run db:migrate:deploy
npm run db:status
npm run db:studio

# Workers
npm run callbacks:worker
npm run finance:worker
npm run ctf-bill-capture:worker
npm run payment-monitor:worker
npm run onchain:worker

# One-shot variants for cron
npm run callbacks:retry-once
npm run finance:sync-once
npm run onchain:sync-once

# Quality
npm run lint
npm run test
npm run env:check:prod
```

---

## Tech Stack

- **Runtime**: Node.js 20, TypeScript 5
- **Framework**: Next.js 16 (App Router), React 19
- **Database**: PostgreSQL 16, Prisma 7
- **Object storage**: MinIO / AWS S3 / Cloudflare R2 / Aliyun OSS (any S3-compatible service via `@aws-sdk/client-s3`)
- **Crypto**: Ed25519 bundle signing + AES-GCM secret sealing
- **Sandbox**: `worker_threads` for third-party plugin runtimes
- **Deployment**: Docker Compose (dev + prod profiles) and PM2 ecosystem

---

## Open Source & Security

Public repositories should only ship:

- Application code
- Database schema and migrations
- Example configuration
- Documentation and tests

Never commit:

- Real `.env` files
- Real payment certificates, platform keys, merchant private keys
- Database dumps or merchant production data
- API secrets, IP allowlists, callback secrets

Read [SECURITY.md](./SECURITY.md) before publishing or deploying.

---

## Project Boundaries

NovaPay deliberately does **not** do these things:

- Act as a single shared platform collection account
- Inject merchant payment credentials from a central platform `.env`
- Force every merchant through a fixed public callback URL

It positions itself as multi-merchant payment infrastructure, not a single-account aggregation script.

---

## License & Contributing

Issues and pull requests welcome at [github.com/AuuCoder/NovaPay](https://github.com/AuuCoder/NovaPay).

For the deployment runbook, see [docs/production-runbook.md](./docs/production-runbook.md).
