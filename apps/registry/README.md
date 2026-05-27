[简体中文](./README.zh-CN.md)

# NovaPay Plugin Registry

`@novapay/registry` is the independently deployed plugin marketplace service for the NovaPay platform. It catalogs official and third-party payment plugins, signs bundles with Ed25519, issues per-instance JWS licenses, and ships its own admin / developer console.

It is **not** part of the NovaPay main application — it runs as a separate Next.js + Prisma + PostgreSQL + S3 stack with its own domain, database, and lifecycle.

---

## Capabilities

- **Public catalog API** consumed by every NovaPay instance: `GET /api/registry/plugins`, `GET /api/registry/packages/:slug/:version/download`
- **Trust anchor** at `/.well-known/trust.json` so consumers can verify bundle signatures offline
- **Developer portal** for plugin authors: register, upload versions, run automated test sessions, manage PATs, view sales, request payouts
- **Governance console**: review queue, takedown workflow, license revocations
- **Paid plugin checkout** that dogfoods the NovaPay gateway — buyers pay through real Alipay/WeChat, the registry signs JWS licenses, consumer instances verify daily

---

## Architecture

```
NovaPay main app  ──▶  Registry  ──▶  Postgres (novapay_registry)
                          │            S3 / MinIO / R2 / OSS
                          └────────────  Ed25519 signing keys
```

| Module | Role |
|---|---|
| `app/` | Next.js App Router — admin (`/(admin)`), developer portal (`/developer`), public API (`/api/registry/*`, `/api/.well-known/*`) |
| `lib/runtime/state.ts` | Process-wide singletons: signing keys, signer, stores, object store, consumers |
| `lib/runtime/prisma-stores.ts` | Prisma-backed implementations of the signing key store, audit logger, and consumer lookup |
| `lib/auth/` | Developer auth, sessions, PAT tokens, consumer (NovaPay instance) authentication |
| `lib/bundle/` | Manifest parsing + bundle pipeline (sha256 → store → sign) |
| `lib/signing/` | Ed25519 key store, signer, rotation, sealed local key material |
| `lib/licensing/` | License issuance, verification, revocation |
| `lib/payments/` | Order service that creates payment orders against the NovaPay main app |
| `lib/payouts/` | Developer balance ledger and payout requests |
| `lib/storage/` | S3-compatible object store driver |

All persistence runs through Postgres; the Ed25519 private key material is sealed with AES-GCM via `lib/security/secret-box.ts`. Plugin bundles live in S3-compatible object storage (works against AWS S3 / Cloudflare R2 / Aliyun OSS / MinIO).

---

## Local development

```bash
# From the workspace root, start Postgres + MinIO via Docker
docker compose -f deploy/docker-compose.dev.yml up -d

# Then in this directory
cd apps/registry
npm install
npx prisma migrate deploy
npm run dev:registry            # listens on :3100
```

The dev compose stack auto-creates the `novapay_registry` Postgres database and the `novapay-registry-packages` MinIO bucket. Required env (use `.env` at the workspace root):

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

For unit tests that don't need real object storage, set `OBJECT_STORE_DRIVER=memory`.

---

## Scripts

| Script                    | Purpose                                       |
| ------------------------- | --------------------------------------------- |
| `dev`                     | Run the registry Next.js app                  |
| `dev:registry`            | Same, but bound to `:3100`                    |
| `build`                   | Production build                              |
| `start`                   | Start the production server                   |
| `lint`                    | ESLint via the local config                   |
| `prisma:generate`         | Generate the Prisma client                    |
| `prisma:migrate`          | Run `prisma migrate dev`                      |
| `prisma:migrate:deploy`   | Run `prisma migrate deploy` (production)      |
| `test`                    | Unit tests under `tests/unit/`                |

---

## Production deployment

The registry is bundled into the workspace-level `deploy/docker-compose.prod.yml`. From the workspace root:

```bash
cp .env.docker-compose.example .env
vim .env

docker compose -f deploy/docker-compose.prod.yml --profile ops run --rm postgres-init
docker compose -f deploy/docker-compose.prod.yml --profile ops run --rm migrate-registry

docker compose -f deploy/docker-compose.prod.yml up -d registry
```

See [`docs/production-runbook.md`](../../docs/production-runbook.md) for the full guide.

---

## Configuration reference

| Env | Required | Purpose |
|---|---|---|
| `REGISTRY_DATABASE_URL` | yes | Postgres for `novapay_registry` (falls back to `DATABASE_URL`) |
| `S3_ENDPOINT_URL` | yes | S3 / MinIO endpoint (omit for AWS) |
| `S3_BUCKET` | yes | Bucket name for plugin bundles |
| `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` | yes | S3 credentials |
| `S3_REGION` | yes | Region (use `us-east-1` for MinIO) |
| `S3_FORCE_PATH_STYLE` | for MinIO | `true` for path-style URLs |
| `REGISTRY_OBJECT_PUBLIC_BASE_URL` | optional | Override hostname in presigned URLs (CDN domain) |
| `OBJECT_STORE_DRIVER` | dev/test | Set to `memory` to skip S3 entirely |
| `REGISTRY_DEFAULT_APP_KEY` | yes | App key shared with the NovaPay main app |
| `REGISTRY_SSO_SECRET` | yes | HMAC secret for admin SSO between main app and registry |
| `NOVAPAY_DATA_ENCRYPTION_KEY` | yes | AES-GCM key for sealing signing key material; share with the main app |

---

## Relationship to the NovaPay main app

The NovaPay main app consumes this registry as its sole plugin marketplace. The main app:

1. Polls `GET /api/registry/plugins` to refresh the catalog
2. Downloads signed bundles, verifies sha256 + Ed25519 against the trust anchor
3. Loads runtime modules in a `worker_threads` sandbox (via `lib/plugins/sandbox-runtime.ts` on the main app side)
4. Verifies paid plugin licenses every 24 hours through `POST /api/licenses/verify`

The registry is also a NovaPay merchant: paid plugin orders are processed through the same payment gateway, so the platform dogfoods its own checkout flow.

---

## Tests

```bash
npm run test
```

122+ unit tests cover signing/rotation, bundle pipeline, license issuance/verification, manifest parsing, static scan, verification gate, settlement settings, and runtime state.

---

## License

Same as the NovaPay main repository. Contributions welcome at [github.com/AuuCoder/NovaPay](https://github.com/AuuCoder/NovaPay).
