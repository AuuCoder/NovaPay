# Sub2ApiPay 到 NovaPay 的结构演进（历史记录）

> 这是一份历史文档。NovaPay 早期从一个名为 `sub2apipay` 的项目（一个面向「Sub2API」内部用户充值/订阅的支付脚本）中提炼支付网关骨架而来。本文记录了当时的取舍和迁移决策；如果你只关心当前架构，参考 [README.zh-CN.md](../README.zh-CN.md) 和 [production-runbook.md](./production-runbook.md) 即可。

---

## 当时的取舍

`sub2apipay` 值得借鉴的：

- 统一的支付 provider 抽象
- 回调验签后进入统一订单状态机
- 多实例支付账号配置与负载均衡
- 支付限额、超时、取消、退款、重试
- 管理后台在线配置与统计面板

必须剔除的：

- `Sub2API` 用户体系
- `Sub2API` 余额充值与订阅发放逻辑
- 依赖 `token -> Sub2API user` 的用户端支付页
- `Channel / SubscriptionPlan` 这类面向内部渠道与套餐销售的模型

---

## NovaPay 目标定位

> 多商户、多支付通道、多支付账号实例的通用支付网关。

每个商户在自己的控制台维护支付参数、IP 白名单、回调地址；平台只提供统一接口、签名校验、回调路由、退款能力、审计能力；不代持任何商户的收款资格。

---

## 当前已实现的模块映射

下表对照当时的迁移计划与现在的实际落地：

| 早期计划 | 当前位置 | 状态 |
|---|---|---|
| Provider 抽象 | `lib/payments/plugins/types.ts` + `lib/payments/providers/*` | ✅ 已实现，并升级为可热插拔的「插件市场」架构 |
| `GatewayChannel` / `ProviderAccount` / `MerchantChannelBinding` | `prisma/schema.prisma` 中的 `MerchantChannelAccount` + `MerchantChannelBinding` | ✅ 已实现（合并了 ProviderAccount 与 ChannelAccount） |
| 系统配置中心 | `lib/system-config.ts` + `prisma SystemConfig` | ✅ 已实现，环境变量做兜底，DB 可在线覆盖，带 TTL 缓存 |
| 订单状态机 | `lib/orders/service.ts` + `lib/orders/status.ts` | ✅ 已实现 `PENDING → PROCESSING → SUCCEEDED / FAILED / REFUNDED / CANCELLED` |
| 商户签名验签 | `lib/merchants/api-auth.ts` + HMAC-SHA256 | ✅ 已实现（含 nonce 防重放、Idempotency-Key、IP 白名单、时间窗口） |
| 商户回调投递与重试 | `lib/callbacks/service.ts` + `scripts/callback-retry-worker.ts` | ✅ 已实现（指数退避、`callbacks-worker` 进程） |
| 退款流程 | `lib/refunds/service.ts` + `app/api/payment-orders/[orderReference]/refunds` | ✅ 已实现 |
| 财务流水 / 余额快照 / 结算 | `lib/finance/*` + `scripts/finance-worker.ts` | ✅ 已实现（`finance-worker` 进程） |
| 链上 USDT 到账匹配 | `lib/payments/onchain/*` + `scripts/onchain-worker.ts` | ✅ 已实现（BSC / Base / Solana） |
| 多支付方式扩展 | 插件市场（`apps/registry/`） | ✅ 当时只想着写死 `wxpay.native`；现在演进成独立 Registry，第三方插件可以无需改网关代码动态接入 |

---

## 跟早期设想的明显偏差

实际工程中，有几处偏离了当年的迁移计划：

**1. 不只支付通道，还做了完整的插件市场**

当时只想做支付通道扩展。后来发现「插件分发 + 签名校验 + 许可证 + 沙箱运行时 + 销售/分润」是一套完整产品，单独拆成了 `apps/registry`。

**2. 支付账号实例和通道绑定合并**

早期想要 `GatewayChannel` / `ProviderAccount` / `MerchantChannelBinding` 三层。实际落地为：

- `MerchantChannelAccount`：商户在某个通道（如 `alipay.page`）下的实例配置
- `MerchantChannelBinding`：决定某个商户的某个通道走哪个实例

通道本身的元数据来自插件，不再单独建表。

**3. 多账号负载均衡延后**

当年规划的「单通道多账号 + 限额 + 故障转移」在第一版没做（每个商户一个通道实例就够用），等真正有客户场景再加。

**4. USDT 链上支付**

早期没考虑这条线。后来根据真实业务需求增加了 BSC / Base / Solana 三条链，包含锁价、精确金额分配、链上 worker 扫描配单。

---

## 推荐参考

- [README.zh-CN.md](../README.zh-CN.md) —— 当前架构概览
- [production-runbook.md](./production-runbook.md) —— 生产部署
- [merchant-integration-examples.md](./merchant-integration-examples.md) —— 商户接入示例
- `apps/registry/README.md` —— 插件市场详细说明

---

## 一句话总结

> `sub2apipay` 提供了第一版的形状；NovaPay 长成了一个独立的、商用规格的多商户支付网关 + 插件市场，跟 `sub2apipay` 的业务模型（用户充值 + 订阅）已经完全无关。
