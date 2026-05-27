[简体中文](./sub2apipay-to-novapay.zh-CN.md)

# Sub2ApiPay → NovaPay Architecture Evolution (history)

> Historical record. NovaPay's payment-gateway skeleton was originally extracted from a project called `sub2apipay` (a recharge / subscription payment script for an internal "Sub2API" platform). This document captures the trade-offs and migration decisions made at the time. If you only care about the current architecture, read [README.md](../README.md) and [production-runbook.md](./production-runbook.md) instead.

---

## Trade-offs at the time

What was worth borrowing from `sub2apipay`:

- A unified payment provider abstraction
- Verified callbacks feeding into a single order state machine
- Multi-instance payment account configuration with load balancing
- Payment limits, timeouts, cancellation, refunds, retries
- Online configuration and an analytics dashboard

What had to be removed:

- The Sub2API user system
- Sub2API balance recharge and subscription fulfilment
- The user-facing payment page that authenticated via `Sub2API token`
- `Channel / SubscriptionPlan` models, which served Sub2API's own catalog rather than merchants

---

## NovaPay's positioning

> A general-purpose multi-merchant payment gateway with multiple channels and multiple payment account instances.

Each merchant manages their own credentials, IP allowlist, and callback URLs in their own console. The platform only provides a unified API, signature verification, callback routing, refunds, and audit trails. The platform never holds collection capability on behalf of merchants.

---

## Mapping: original plan → current implementation

| Original plan | Current location | Status |
|---|---|---|
| Provider abstraction | `lib/payments/plugins/types.ts` + `lib/payments/providers/*` | ✅ Implemented and upgraded into the hot-pluggable plugin marketplace |
| `GatewayChannel` / `ProviderAccount` / `MerchantChannelBinding` | `prisma/schema.prisma` — `MerchantChannelAccount` + `MerchantChannelBinding` | ✅ Implemented (ProviderAccount and ChannelAccount were merged into one) |
| System config center | `lib/system-config.ts` + `prisma SystemConfig` | ✅ Implemented; env vars provide defaults, the database can override at runtime, with TTL caching |
| Order state machine | `lib/orders/service.ts` + `lib/orders/status.ts` | ✅ Implemented `PENDING → PROCESSING → SUCCEEDED / FAILED / REFUNDED / CANCELLED` |
| Merchant signing | `lib/merchants/api-auth.ts` + HMAC-SHA256 | ✅ Implemented (nonce replay, Idempotency-Key, IP allowlists, time window) |
| Merchant callback delivery + retries | `lib/callbacks/service.ts` + `scripts/callback-retry-worker.ts` | ✅ Implemented (exponential backoff, `callbacks-worker` process) |
| Refund flow | `lib/refunds/service.ts` + `app/api/payment-orders/[orderReference]/refunds` | ✅ Implemented |
| Finance ledger / balance snapshots / settlements | `lib/finance/*` + `scripts/finance-worker.ts` | ✅ Implemented (`finance-worker` process) |
| On-chain USDT matching | `lib/payments/onchain/*` + `scripts/onchain-worker.ts` | ✅ Implemented (BSC / Base / Solana) |
| Multi payment-method extension | The plugin marketplace (`apps/registry/`) | ✅ The original plan only hard-coded `wxpay.native`; this evolved into an independent registry where third-party plugins can extend channels without modifying the gateway |

---

## Notable deviations from the original plan

A few things diverged in practice:

**1. The plugin marketplace became a product on its own**

We initially planned for "extensible payment channels". In practice, plugin distribution + bundle signing + license issuance + sandboxed runtime + sales / revenue sharing turned into a complete product, so it was extracted into `apps/registry`.

**2. Account instances and channel bindings were merged**

Originally we drafted three layers: `GatewayChannel` / `ProviderAccount` / `MerchantChannelBinding`. The implementation collapsed it to two:

- `MerchantChannelAccount` — the merchant's per-channel instance (e.g. their `alipay.page` configuration)
- `MerchantChannelBinding` — which instance to route a given merchant + channel to

Channel metadata now comes from the plugin manifest, not its own table.

**3. Multi-account load balancing deferred**

The original plan included "single channel + multiple accounts + per-account limits + failover". The first release skipped it (one instance per merchant per channel was enough); we'll add it when there's a real customer scenario.

**4. USDT on-chain support was never in the original plan**

Added later in response to real demand. Spans BSC / Base / Solana, with locked quotes, exact-amount allocation, and on-chain matching workers.

---

## Recommended reading

- [README.md](../README.md) — current architecture overview
- [production-runbook.md](./production-runbook.md) — deployment
- [merchant-integration-examples.md](./merchant-integration-examples.md) — merchant integration
- [`apps/registry/README.md`](../apps/registry/README.md) — plugin marketplace deep dive

---

## In one sentence

> `sub2apipay` provided the initial shape. NovaPay grew into a standalone, commercial-grade multi-merchant payment gateway with a plugin marketplace; the business model (user recharge + subscriptions) it inherited from has been entirely replaced.
