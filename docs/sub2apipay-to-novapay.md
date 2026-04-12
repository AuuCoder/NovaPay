# Sub2ApiPay 到 NovaPay 的结构映射

这份文档的目标不是复刻 `sub2apipay`，而是提炼其中对 `NovaPay` 有价值的支付网关骨架，并明确剔除所有 `Sub2API` 业务耦合。

## 结论

`sub2apipay` 值得借鉴的是：

- 统一的支付 provider 抽象
- 回调验签后进入统一订单状态机
- 多实例支付账号配置与负载均衡
- 支付限额、超时、取消、退款、重试
- 管理后台在线配置与统计面板

`sub2apipay` 必须剔除的是：

- `Sub2API` 用户体系
- `Sub2API` 余额充值与订阅发放逻辑
- 依赖 `token -> Sub2API user` 的用户端支付页
- `Channel / SubscriptionPlan` 这类面向 Sub2API 渠道与套餐销售的模型

NovaPay 的目标应该是：多商户、多支付通道、多支付账号实例的通用支付网关。

## 必须剔除的模块

这些模块强绑定 `Sub2API` 业务，不建议直接借用：

- `src/lib/sub2api/*`
- `src/app/pay/*`
- `src/app/api/user/*`
- `src/app/api/users/*`
- `src/app/api/subscription-plans/*`
- `src/app/api/subscriptions/*`
- `src/app/api/orders/my/*`
- `Channel`
- `SubscriptionPlan`
- `Order.userId / userEmail / userName / userNotes`
- `createAndRedeem / assignSubscription / extendSubscription`

剔除原因：

- 它的订单主体是“平台用户充值”，不是“商户发起支付单”
- 支付成功后的履约对象是 `Sub2API` 余额或订阅，不是商户业务系统
- 前台页面的认证方式是 `Sub2API token`，不适合通用网关

## 可以直接借鉴的结构

### 1. 支付 Provider 抽象

参考：

- `src/lib/payment/types.ts`
- `src/lib/payment/registry.ts`
- `src/lib/payment/index.ts`

NovaPay 应保留：

- `PaymentProvider`
- `createPayment`
- `verifyNotification / parseNotification`
- `queryOrder`
- `refund`
- provider registry

NovaPay 需要改成：

- provider 不再围绕“平台用户充值”，而是围绕“商户订单”
- 入参里包含 `merchant`、`paymentOrder`、`providerInstance`
- 返回结构里明确区分 `checkoutUrl`、`formHtml`、`qrCode`、`sdkPayload`

### 2. 多实例支付账号配置

参考：

- `PaymentProviderInstance`
- `src/lib/payment/load-balancer.ts`
- `src/app/api/admin/provider-instances/route.ts`

NovaPay 很值得保留这层，因为真实支付网关通常需要：

- 一个通道绑定多个账号
- 不同商户路由到不同账号
- 单账号限额
- 故障转移和负载均衡

NovaPay 建议模型：

- `GatewayChannel`
- `ProviderAccount`
- `MerchantChannelBinding`

### 3. 系统配置中心

参考：

- `SystemConfig`
- `src/lib/system-config.ts`
- `src/app/api/admin/config/route.ts`

NovaPay 可以保留这套思想：

- 环境变量是默认值
- 数据库配置可在线覆盖
- 做短 TTL 缓存

NovaPay 适合放进去的配置：

- 默认超时时间
- 回调重试参数
- 全局风控阈值
- 渠道路由策略
- 后台管理员配置

### 4. 订单状态机

参考：

- `src/lib/order/service.ts`

可以借鉴的是“支付确认”和“统一履约入口”这两个位置，但履约逻辑必须完全换掉。

在 `sub2apipay` 里：

- `PENDING -> PAID -> RECHARGING -> COMPLETED`

在 NovaPay 里更适合变成：

- `PENDING -> PROCESSING -> SUCCEEDED`
- `PENDING -> FAILED`
- `PENDING/PROCESSING -> CANCELLED`
- `SUCCEEDED -> REFUND_PENDING -> REFUNDED`

NovaPay 的履约不应是给平台余额充值，而应是：

- 调商户回调
- 写回调日志
- 重试通知
- 记录渠道侧状态

## NovaPay 的推荐领域模型

基于 `sub2apipay` 的优点，但去掉 `Sub2API` 耦合后，建议 NovaPay 逐步演进到这些表：

### 核心业务

- `Merchant`
- `PaymentOrder`
- `PaymentCallbackAttempt`
- `RefundOrder`
- `AuditLog`

### 渠道与账号

- `GatewayChannel`
- `ProviderAccount`
- `MerchantChannelBinding`

### 配置

- `SystemConfig`

## 建议的数据结构方向

### Merchant

保留：

- 商户基础信息
- 商户编码
- 回调域名
- 签名密钥

新增建议：

- `status`
- `notifySecret`
- `allowedIps`

### PaymentOrder

当前 NovaPay 已有基础字段，接下来建议继续补：

- `merchantOrderNo`
- `merchantUserId`
- `providerAccountId`
- `notifyStatus`
- `notifyCount`
- `lastNotifyAt`
- `expireAt`
- `returnUrl`
- `attach`

### ProviderAccount

建议字段：

- `providerKey`
- `channelCode`
- `displayName`
- `encryptedConfig`
- `enabled`
- `priority`
- `rateLimitConfig`
- `routingRule`

### MerchantChannelBinding

用于描述某个商户能不能用某个通道，以及走哪个账号池：

- `merchantId`
- `channelCode`
- `enabled`
- `defaultAccountId`
- `allowedAccounts`
- `feeRate`
- `minAmount`
- `maxAmount`

## 服务层映射

### sub2apipay 的 `createOrder`

它负责：

- 校验用户
- 校验充值规则
- 调 provider 创建支付
- 写订单

NovaPay 应改成：

- 校验商户签名
- 校验商户通道权限
- 校验金额与币种
- 选择渠道账号
- 调 provider 创建支付
- 保存订单、渠道响应、回调配置

### sub2apipay 的 `confirmPayment`

它负责：

- 验签成功后更新订单为已支付
- 触发充值 / 订阅履约

NovaPay 应改成：

- 验签成功后更新订单为 `SUCCEEDED`
- 记录第三方交易号
- 投递商户回调任务
- 重试直到商户返回成功

### sub2apipay 的 `executeFulfillment`

这部分要完全替换。

NovaPay 新版本应改为：

- `dispatchMerchantNotify(orderId)`
- `retryMerchantNotify(orderId)`
- `markNotifyDelivered(orderId)`

## API 层映射

### 可以借鉴

- 支付回调路由拆分方式
- 管理后台配置 API 的组织形式
- 渠道实例管理 API

### 必须替换

- 用户端基于 `token` 的订单创建
- 所有直接查询 `Sub2API` 用户信息的接口

NovaPay 建议公开 API：

- `POST /api/payment-orders`
- `POST /api/payment-orders/:orderReference`
- `POST /api/payment-orders/:orderReference/close`
- `POST /api/payment-orders/:orderReference/refunds`
- `POST /api/payments/callback/alipay/:accountId/:token`
- `POST /api/payments/callback/wxpay/:accountId/:token`

NovaPay 建议管理 API：

- `GET /api/admin/merchants`
- `GET /api/admin/channels`
- `GET /api/admin/provider-accounts`
- `GET /api/admin/orders`
- `GET /api/admin/callback-attempts`
- `PUT /api/admin/system-config`

## 对当前 NovaPay 的直接建议

相比 `sub2apipay`，我们当前项目已经有：

- `Merchant`
- `PaymentOrder`
- `alipay.page` provider
- `POST /api/payment-orders`
- `POST /api/payments/callback/alipay/:accountId/:token`

下一步最值得先做的不是前台支付页，而是以下四件事：

1. 增加 `ProviderAccount` 与 `SystemConfig`
2. 给 `PaymentOrder` 增加回调投递字段
3. 增加商户签名验签
4. 做统一的商户回调投递服务

## 推荐实施顺序

第一阶段：支付网关内核

- `ProviderAccount`
- `SystemConfig`
- 订单状态机
- 渠道路由与账号选择

第二阶段：商户集成能力

- 商户签名
- 商户回调投递
- 回调重试与审计

第三阶段：后台管理

- 商户管理
- 通道配置
- 账号实例配置
- 订单查询与统计

第四阶段：扩展支付方式

- 微信支付
- 退款
- 风控规则

## 一句话判断

`sub2apipay` 可以当作“支付引擎和后台结构参考”，不能当作“NovaPay 的业务模型模板”。

NovaPay 要借的是：

- provider 架构
- 配置中心
- 多实例路由
- 订单状态机

NovaPay 要删的是：

- Sub2API 用户、余额、订阅、分组这整条业务线
