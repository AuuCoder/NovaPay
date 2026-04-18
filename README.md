[简体中文](./README.zh-CN.md)

# NovaPay

NovaPay is a multi-merchant payment gateway and hosted checkout system designed for production-grade business workflows.

Its goal is not to act as a single pooled platform wallet. Instead, each merchant manages its own upstream payment credentials while the platform provides a unified order API, request signing, callback routing, refund support, admin tooling, and auditability.

## What NovaPay Is

NovaPay is a good fit for:

- Multi-merchant platforms
- Merchant-owned payment credentials, callbacks, and API credentials
- Platforms that want one unified payment API without forcing every merchant into a shared collection account
- Commerce, SaaS, or digital goods systems that need an independent payment layer

If you view the whole stack as separate systems:

- `NovaPay` owns the payment gateway, signed APIs, channel instances, callbacks, refunds, and payment operations.
- `NoveShop` owns products, storefronts, orders, inventory, and digital fulfillment.

## Current Capabilities

- Admin console and merchant self-service console
- Admin accounts, merchant approval flow, RBAC, and audit logs
- Merchant-managed payment channel instances with dedicated upstream callback URLs
- Merchant-specific API Key / Secret and request signing
- Nonce-based replay protection and Idempotency-Key support
- Merchant API IP allowlists
- Channel bindings, instance routing, and hosted checkout pages
- Payment order creation, query, and close flows
- Refund creation and query flows
- Merchant callback retry worker
- Finance ledgers, balance snapshots, and settlement-facing views
- OpenAPI docs page and raw JSON schema output

## Currently Supported Channels

- `alipay.page`
- `wxpay.native`

Notes:

- Channel credentials are no longer maintained centrally in the platform `.env`.
- Each merchant is expected to manage its own payment instances in the merchant console.
- The system generates a distinct upstream payment callback URL for each channel instance.

## Design Principles

- Merchant-owned payment credentials first
- The platform should not hold merchant collection capability on their behalf
- Unified payment API, without forcing merchants into shared upstream accounts
- Browser return flows and server-side callbacks are treated as separate concerns
- Write APIs are designed with idempotency and auditability in mind

## Tech Stack

- Next.js 16 + App Router
- React 19
- TypeScript 5
- Prisma 7
- PostgreSQL 16

## Quick Start

### 1. Install dependencies

```bash
npm install
```

### 2. Copy environment variables

```bash
cp .env.example .env
```

### 3. Start local PostgreSQL

```bash
docker compose up -d
```

### 4. At minimum, fill in these core settings

```bash
DATABASE_URL="postgresql://DB_USER:DB_PASSWORD@DB_HOST:5432/DB_NAME?schema=public"
NOVAPAY_PUBLIC_BASE_URL="http://localhost:3000"
NOVAPAY_DATA_ENCRYPTION_KEY="replace-with-a-long-random-secret"

ADMIN_BOOTSTRAP_EMAIL="admin@example.com"
ADMIN_BOOTSTRAP_PASSWORD="replace-with-a-strong-password"
ADMIN_BOOTSTRAP_NAME="Platform Administrator"
```

Notes:

- `NOVAPAY_PUBLIC_BASE_URL` must be a real public URL in production and must not point to `localhost`.
- `.env` should only contain platform-level settings, not merchant production payment secrets.
- Merchant payment settings and upstream callback URLs are managed per channel instance in the merchant console.

### 5. Initialize the development database

```bash
npm run db:generate
npm run db:push
```

### 6. Start development mode

```bash
npm run dev
```

### 7. Start workers if you need full callback and finance flows

```bash
npm run callbacks:worker
npm run finance:worker
```

### 8. Open these entry points

```text
http://localhost:3000/docs
http://localhost:3000/admin/login
http://localhost:3000/merchant/register
http://localhost:3000/merchant/login
```

## Admin vs Merchant Responsibilities

Admins are responsible for:

- Reviewing merchant registrations
- Inspecting orders, refunds, callbacks, and audit logs
- Managing system config and channel routing
- Inspecting finance ledgers, balances, and settlement-facing data

Merchants are responsible for:

- Registering, signing in, and maintaining profile data
- Creating their own Alipay / WeChat Pay instances
- Configuring IP allowlists, business callbacks, and API credentials
- Monitoring their own orders, refunds, and payment channel status

## REST API Overview

Main entry points:

- Docs page: `/docs`
- Raw schema: `/api/openapi`
- Health: `GET /api/health`
- Channel list: `GET /api/channels`
- Create order: `POST /api/payment-orders`
- Query order: `POST /api/payment-orders/{orderReference}`
- Close order: `POST /api/payment-orders/{orderReference}/close`
- Create refund: `POST /api/payment-orders/{orderReference}/refunds`
- Query refund: `POST /api/payment-refunds/{refundReference}`

When a merchant calls `POST /api/payment-orders`, it must include:

- `x-novapay-key`
- `x-novapay-timestamp`
- `x-novapay-nonce`
- `x-novapay-signature`
- `Idempotency-Key` (strongly recommended)

Signature algorithm:

```text
hex(hmac_sha256(apiSecret, "{timestamp}.{nonce}.{rawBody}"))
```

Example request body:

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

Behavioral notes:

- The merchant must already be approved.
- `x-novapay-nonce` must be unique; replayed values are rejected.
- Merchants do not need to and must not send `notifyUrl`.
- Upstream payment callback URLs are assigned automatically per merchant channel instance.
- Use `callbackUrl` if you need to override the merchant business callback.
- If `returnUrl` is omitted, NovaPay will use its own hosted browser return page.

For more complete signing and integration examples, see:

- [Merchant Integration Examples](./docs/merchant-integration-examples.md)
- [sub2apipay Migration Notes](./docs/sub2apipay-to-novapay.md)

## Common Commands

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

## Production Deployment

Recommended production flow:

1. `npm ci`
2. `npm run db:migrate:deploy`
3. `npm run env:check:prod`
4. `npm run build`
5. `npm run start`
6. Also run continuously:
   `npm run callbacks:worker`
   `npm run finance:worker`

Production notes:

- `NOVAPAY_PUBLIC_BASE_URL` must be a public domain such as `https://pay.example.com`.
- Your reverse proxy must forward `x-forwarded-for` correctly.
- Do not use `db:push` or `migrate dev` in production.
- Merchant payment credentials should live only in merchant instance records in the database.

For the full deployment guide:

- [Production Runbook](./docs/production-runbook.md)

## Open Source and Security

Public repositories should only include:

- Application code
- Database schema
- Example configuration
- Docs and tests

Do not commit:

- Real `.env` files
- Real payment certificates, platform keys, or merchant private keys
- Database dumps
- Merchant production data
- API secrets, allowlists, or callback secrets

Before publishing publicly, read:

- [SECURITY.md](./SECURITY.md)

## Project Boundaries

NovaPay intentionally does not do the following:

- Act as a single shared platform collection account for all merchants
- Inject all merchant payment credentials from one central platform `.env`
- Force every merchant through one fixed shared upstream callback URL

Its boundary is closer to a multi-merchant payment infrastructure layer than to a single-account aggregation script.
