# 需求文档（Requirements Document）

## Introduction

本规格定义一个**独立部署**的远程插件市场（Remote Plugin Marketplace，下称 Registry），用于替代当前 NovaPay 主仓库内仅作演示用途的 mock registry（参见 `app/api/mock-plugin-registry/**`）。Registry 是一个面向多个 NovaPay 实例的中央化分发平台，承担三类参与者的协作：

- **Registry 平台管理员（Registry Admin）**：经营 Registry 本身，负责审核、上下架、分类运营、清结算与争议处理。
- **插件开发者 / 厂商（Plugin Developer）**：第三方开发者，或同时也是某个 NovaPay 实例下商户的开发者，负责注册账号、上传插件包、维护版本、定价、查看销售与提现。
- **Registry 消费方（Registry Consumer）**：包含 NovaPay 实例的平台管理员（NovaPay Admin Consumer）以及其下属商户（NovaPay Merchant Consumer），通过 NovaPay 主程序发现、安装、购买与启用插件。

Registry 必须在不破坏现有 `RemoteRegistryPluginRecord`（`lib/plugins/remote-registry.ts`）契约的前提下扩展能力，并最终让 `lib/plugins/marketplace.ts` 中的 `purchasedAt` 手动标记机制由真实的授权校验取代。

本期需求覆盖：插件生命周期、付费与授权、插件包安全、Registry 对外 API、开发者门户，以及 NovaPay 主程序侧的迁移与配套改造。

## Glossary

- **Registry**：本独立远程插件市场服务（含 Web 控制台、API、对象存储、签名与授权服务）。
- **Registry_Admin**：操作 Registry 平台的管理员账号。
- **Plugin_Developer**：在 Registry 注册的插件开发者账号；可由独立第三方注册，也可由 NovaPay 实例下的商户身份桥接（Stretch Goal）。
- **NovaPay_Instance**：一套独立部署的 NovaPay 主程序，使用 `PluginRegistrySource`（`prisma/schema.prisma`）配置 Registry 接入凭据。
- **NovaPay_Admin_Consumer**：NovaPay 实例的平台管理员；对应 `app/admin/(console)/plugins/**`。
- **NovaPay_Merchant_Consumer**：NovaPay 实例下的商户用户；通过 `MerchantInstalledPlugin` 使用插件。
- **Plugin_Record**：Registry 中代表一个插件产品的记录（slug 唯一），含元信息、分类、当前发布版本、最新版本。
- **Plugin_Version**：Plugin_Record 下的某一个具体版本，对应一个不可变的 Plugin_Package。
- **Plugin_Package**：插件包文件（签名后的压缩包），含 `plugin.json` manifest 与运行时文件，对应现有 `local-plugin-package-spec.md` 描述的 manifest 形态。
- **Manifest**：`plugin.json`，结构与 `lib/plugins/local-package-manifests.ts` 中的 `LocalPluginPackageManifest` 兼容。
- **Pricing_Mode**：`FREE` 或 `PAID`，对应现有 `PluginPricingMode` 枚举。
- **License**：付费插件的授权凭证；包含授权范围（NovaPay 实例 ID、可选 merchant ID）、有效期、签名。
- **Review_State**：Plugin_Version 的审核状态机，取值 `DRAFT / SUBMITTED / IN_REVIEW / APPROVED / REJECTED / PUBLISHED / DEPRECATED / TAKEN_DOWN`。
- **Registry_Public_API**：供 NovaPay_Instance 调用的对外 API；当前最小集合定义于 `lib/plugins/remote-registry.ts`。
- **Developer_Portal**：Registry 提供给 Plugin_Developer 的 Web 控制台与 API。
- **Bundle_Signature**：使用 Registry 主签名密钥（建议 Ed25519）对 Plugin_Package 字节内容产生的签名。
- **Sandboxed_Runtime**：NovaPay 主程序中用于加载远程插件的隔离执行环境（基于 `worker_threads` 或 `node:vm`），用以替代 `lib/plugins/local-package-runtimes.ts` 中当前的 `new Function("specifier", "return import(specifier);")` 直接动态导入。
- **Capability_Whitelist**：Manifest 中允许声明的能力集合，沿用 `local-package-manifests.ts` 中的 `ALLOWED_CAPABILITIES`。

## Requirements

> 需求按参与者与能力领域分组：A. Registry 平台管理员（Req 1-4）；B. 插件开发者（Req 5-9）；C. NovaPay 平台管理员消费方（Req 10-14）；D. NovaPay 商户消费方（Req 15-16）；E. Registry 公开 API 契约（Req 17-18）；F. 插件包安全与运行时（Req 19-21）；G. 迁移与兼容（Req 22-25）。

---

### A. Registry 平台管理员（Registry Admin）

### Requirement 1

**User Story:** 作为 Registry_Admin，我希望对开发者提交的 Plugin_Version 进行审核，以便控制对外发布的插件质量与安全性。

#### Acceptance Criteria

1. THE Registry SHALL 为每个 Plugin_Version 维护一个 Review_State，取值范围限定为 `DRAFT / SUBMITTED / IN_REVIEW / APPROVED / REJECTED / PUBLISHED / DEPRECATED / TAKEN_DOWN`。
2. WHEN Plugin_Developer 创建一个新的 Plugin_Version，THE Registry SHALL 将其 Review_State 初始化为 `DRAFT`。
3. WHEN Plugin_Developer 对一个 `DRAFT` 状态的 Plugin_Version 提交审核，THE Registry SHALL 将 Review_State 迁移到 `SUBMITTED`。
4. WHEN Registry_Admin 认领一个 `SUBMITTED` 的 Plugin_Version，THE Registry SHALL 将 Review_State 迁移到 `IN_REVIEW` 并记录认领的 Registry_Admin 账号。
5. WHEN Registry_Admin 通过 `IN_REVIEW` 的 Plugin_Version，THE Registry SHALL 将 Review_State 迁移到 `APPROVED` 并记录审核结论文本。
6. WHEN Registry_Admin 拒绝 `IN_REVIEW` 的 Plugin_Version，THE Registry SHALL 将 Review_State 迁移到 `REJECTED` 并记录拒绝原因，且 Plugin_Developer SHALL 能基于该原因创建新的 `DRAFT` 版本。
7. WHEN Registry_Admin 将一个 `APPROVED` 的 Plugin_Version 发布，THE Registry SHALL 将 Review_State 迁移到 `PUBLISHED` 并将该版本号写入对应 Plugin_Record 的 publishedVersion 字段。
8. IF Registry_Admin 试图直接将 `DRAFT` 或 `SUBMITTED` 状态的 Plugin_Version 迁移到 `PUBLISHED`，THEN THE Registry SHALL 拒绝该操作并返回状态机违规错误。
9. WHEN Registry_Admin 将某个 Plugin_Record 的当前 PUBLISHED 版本下架，THE Registry SHALL 将该 Plugin_Version 的 Review_State 迁移到 `TAKEN_DOWN` 并将 Plugin_Record 的 publishedVersion 置空。
10. WHILE 一个 Plugin_Record 的所有 Plugin_Version 都处于 `TAKEN_DOWN`，THE Registry SHALL 在 Registry_Public_API 的目录响应中将该 Plugin_Record 标记为不可见。

### Requirement 2

**User Story:** 作为 Registry_Admin，我希望维护插件分类与精选目录，以便 Registry_Consumer 在 NovaPay 后台中按分类发现插件。

#### Acceptance Criteria

1. THE Registry SHALL 维护一组分类（Category）记录，每条分类至少包含 code、`displayName.zh`、`displayName.en` 三个字段。
2. WHEN Registry_Admin 创建一个新的分类，THE Registry SHALL 校验 code 在所有分类中唯一。
3. THE Registry SHALL 允许将 Plugin_Record 关联到 0~N 个分类。
4. WHERE 一个 Plugin_Record 至少关联了一个分类，THE Registry_Public_API SHALL 在 Plugin_Record 响应中返回这些分类的 code 与 displayName。
5. WHEN Registry_Admin 标记一个 Plugin_Record 为「精选」，THE Registry SHALL 在目录响应中以单独的 featured 标志位返回该 Plugin_Record。

### Requirement 3

**User Story:** 作为 Registry_Admin，我希望对违规插件执行紧急下架并保留处理痕迹，以便满足合规要求。

#### Acceptance Criteria

1. WHEN Registry_Admin 触发对一个 Plugin_Record 的紧急下架，THE Registry SHALL 在 5 秒内将该 Plugin_Record 在 Registry_Public_API 目录响应中的 visible 字段置为 false。
2. WHEN Registry_Admin 执行紧急下架，THE Registry SHALL 记录一条审计日志，至少包含操作者、时间、Plugin_Record slug、原因。
3. WHEN Plugin_Developer 对下架结果提交申诉，THE Registry SHALL 创建一条申诉记录并通知所有 Registry_Admin。
4. IF Plugin_Developer 试图为已被紧急下架的 Plugin_Record 提交新的 Plugin_Version，THEN THE Registry SHALL 拒绝提交并返回 `RECORD_TAKEN_DOWN` 错误码。

### Requirement 4

**User Story:** 作为 Registry_Admin，我希望审批 Plugin_Developer 的提现请求，以便规范资金流。

#### Acceptance Criteria

1. THE Registry SHALL 为每个 Plugin_Developer 维护一个余额（balance）记录，单位精确到分。
2. WHEN 一笔 License 售出并完成支付，THE Registry SHALL 在 24 小时内按照配置的分成比例将开发者应得部分计入对应 Plugin_Developer 的余额。
3. WHEN Plugin_Developer 提交提现请求，THE Registry SHALL 将该笔请求初始化为 `PENDING_REVIEW` 状态并冻结对应金额。
4. WHEN Registry_Admin 通过提现请求，THE Registry SHALL 将该请求迁移到 `APPROVED` 状态并扣减开发者余额。
5. IF Registry_Admin 拒绝提现请求，THEN THE Registry SHALL 将该请求迁移到 `REJECTED` 状态并解冻对应金额。
6. IF 一笔提现操作会导致 Plugin_Developer 余额变为负数，THEN THE Registry SHALL 拒绝该操作并返回 `INSUFFICIENT_BALANCE` 错误码。

---

### B. 插件开发者（Plugin Developer）

### Requirement 5

**User Story:** 作为 Plugin_Developer，我希望在 Registry 注册账号并完成实名信息登记，以便上传插件并接收收入。

#### Acceptance Criteria

1. THE Registry SHALL 提供独立的 Plugin_Developer 注册入口，要求邮箱、密码、显示名、联系信息四类必填字段。
2. WHEN Plugin_Developer 完成基本注册，THE Registry SHALL 将其账号状态设为 `EMAIL_UNVERIFIED`。
3. WHEN Plugin_Developer 通过邮箱验证链接，THE Registry SHALL 将账号状态迁移到 `ACTIVE`。
4. WHILE 账号状态为 `EMAIL_UNVERIFIED`，THE Registry SHALL 拒绝该账号执行任何 Plugin_Version 上传操作。
5. WHERE 启用了 NovaPay 商户 SSO 桥接（Stretch Goal），THE Registry SHALL 接受由 NovaPay_Instance 签发的商户身份令牌创建对应的 Plugin_Developer 账号，并在该账号上记录所属 NovaPay_Instance 与 merchantId。

### Requirement 6

**User Story:** 作为 Plugin_Developer，我希望上传带签名的插件包压缩文件，以便发布新的 Plugin_Version。

#### Acceptance Criteria

1. THE Registry SHALL 接收以 `tar.gz` 或 `zip` 格式提交的 Plugin_Package 上传请求，单文件最大 50MB。
2. WHEN Plugin_Developer 上传 Plugin_Package，THE Registry SHALL 解析包内的 `plugin.json` 并按照 `lib/plugins/local-package-manifests.ts` 中的 `parsePluginPackageManifest` 同等规则进行结构校验。
3. IF 上传的 Manifest 缺失任何 `parsePluginPackageManifest` 要求的必填字段，THEN THE Registry SHALL 拒绝上传并在错误体中列出所有缺失字段名。
4. IF 上传的 Manifest 中 `capabilities` 包含不在 Capability_Whitelist 中的值，THEN THE Registry SHALL 拒绝上传并返回 `UNSUPPORTED_CAPABILITY` 错误码。
5. THE Registry SHALL 将每次上传产生的 Plugin_Package 视为不可变对象，存储在 Registry 控制的对象存储中，并以 sha256 内容哈希作为定位键的一部分。
6. WHEN Plugin_Package 字节内容连同 sha256 哈希被持久化到对象存储成功，THE Registry SHALL 视该 Plugin_Package 的存储步骤为完成，且 Bundle_Signature 生成 SHALL 作为后续独立步骤执行。
7. WHEN Plugin_Package 存储完成，THE Registry SHALL 使用 Registry 主签名密钥对包字节生成 Bundle_Signature 并随版本元信息持久化。
8. IF Manifest.slug 与 Manifest.channelCode 在同一 Plugin_Developer 下与现有 Plugin_Record 不一致，THEN THE Registry SHALL 拒绝上传并返回 `SLUG_OR_CHANNEL_CONFLICT` 错误码。
9. WHEN Plugin_Developer 上传一个新版本，THE Registry SHALL 校验其 Manifest.version 严格大于该 Plugin_Record 上一个 SUBMITTED 或 PUBLISHED 版本的 Manifest.version（按 SemVer 比较）。
10. WHEN 上传成功，THE Registry SHALL 把对应 Plugin_Record 的 latestVersion 字段更新为本次提交的 Manifest.version。
11. WHILE 当前 Plugin_Version 的 Review_State 不为 `PUBLISHED`，THE Registry SHALL 不更新 Plugin_Record 的 publishedVersion 字段。

### Requirement 7

**User Story:** 作为 Plugin_Developer，我希望为每个 Plugin_Record 配置 Pricing_Mode 与价格描述，以便决定免费或付费分发。

#### Acceptance Criteria

1. THE Registry SHALL 要求每个 Plugin_Record 必须设置一个 Pricing_Mode，取值范围为 `FREE / PAID`。
2. WHEN Plugin_Developer 选择 Pricing_Mode 为 `PAID`，THE Registry SHALL 至少要求填写以下字段：计价方式（`PER_INSTANCE_ONE_TIME` 一次性 / `PER_MERCHANT_SUBSCRIPTION` 订阅 / `PER_USAGE` 按量）、价格金额、币种。
3. THE Registry SHALL 在本期需求中至少实现 `PER_INSTANCE_ONE_TIME` 与 `PER_MERCHANT_SUBSCRIPTION` 两种计价方式。
4. IF Plugin_Developer 选择 Pricing_Mode 为 `FREE`，THEN THE Registry SHALL 拒绝写入价格金额字段并返回 `PRICE_NOT_ALLOWED_FOR_FREE` 错误码。
5. THE Registry SHALL 在 Registry_Public_API 中通过 `pricingMode` 与 `priceLabel` 字段暴露定价信息，且字段语义与 `RemoteRegistryPluginRecord`（`lib/plugins/remote-registry.ts`）保持向后兼容。
6. WHEN Plugin_Developer 修改 Pricing_Mode 或价格金额，THE Registry SHALL 记录一条价格变更历史记录，至少包含变更前值、变更后值与时间戳。

### Requirement 8

**User Story:** 作为 Plugin_Developer，我希望查看自己插件的安装数与销售流水，以便了解经营情况。

#### Acceptance Criteria

1. THE Developer_Portal SHALL 为每个 Plugin_Record 展示按日聚合的安装数（distinct NovaPay_Instance）与启用商户数。
2. THE Developer_Portal SHALL 为每个 PAID Plugin_Record 展示按日聚合的成交订单数与成交金额，币种与计价币种一致。
3. WHEN Plugin_Developer 在 Developer_Portal 中查询销售明细，THE Registry SHALL 仅返回该开发者拥有的 Plugin_Record 的数据。
4. IF Plugin_Developer 试图查询不属于自己的 Plugin_Record 的销售数据，THEN THE Registry SHALL 返回 HTTP 403 与 `FORBIDDEN_PLUGIN` 错误码。

### Requirement 9

**User Story:** 作为 Plugin_Developer，我希望通过 API 完成上传与状态查询，以便接入 CI/CD。

#### Acceptance Criteria

1. THE Registry SHALL 提供 Developer API 端点：`POST /developer/plugins`、`POST /developer/plugins/:slug/versions`、`GET /developer/plugins/:slug/versions/:version`、`POST /developer/plugins/:slug/versions/:version/submit`、`GET /developer/plugins/:slug/sales`。
2. THE Developer API SHALL 使用每个 Plugin_Developer 自助生成的个人访问令牌（Personal Access Token）作为认证手段，凭据通过 `Authorization: Bearer <token>` 头传递。
3. IF Developer API 接收到一个无效或过期的令牌，THEN THE Registry SHALL 返回 HTTP 401 与 `INVALID_TOKEN` 错误码。
4. THE Developer API SHALL 对每个 Plugin_Developer 执行限流，默认上限 60 次每分钟。
5. IF Plugin_Developer 触发限流上限，THEN THE Registry SHALL 返回 HTTP 429 与 `Retry-After` 头。

---

### C. NovaPay_Admin_Consumer（消费侧 - 平台管理员）

### Requirement 10

**User Story:** 作为 NovaPay_Admin_Consumer，我希望在 NovaPay 后台配置 Registry 接入信息，以便接入独立的远程插件市场。

#### Acceptance Criteria

1. THE NovaPay_Instance SHALL 在现有 `PluginRegistrySource`（`prisma/schema.prisma`）模型上扩展可配置字段：trust 公钥（用于 Bundle_Signature 校验）与 license 验签公钥。
2. WHEN NovaPay_Admin_Consumer 在 `app/admin/(console)/plugins/sources/page.tsx` 中保存 Registry 接入配置，THE NovaPay_Instance SHALL 通过 `appKeyCiphertext` 字段使用现有 `lib/secret-box` 加密 appKey。
3. WHEN NovaPay_Admin_Consumer 测试 Registry 连通性，THE NovaPay_Instance SHALL 调用 `GET /registry/plugins` 并在 10 秒内返回连通结果。
4. IF Registry 返回的 trust 公钥与 NovaPay_Instance 已配置的 trust 公钥不一致，THEN THE NovaPay_Instance SHALL 拒绝当次同步并返回 `REGISTRY_TRUST_KEY_MISMATCH` 错误码。
5. WHILE 上一次同步因 trust 公钥不一致而失败，THE NovaPay_Instance SHALL 允许 NovaPay_Admin_Consumer 重新触发同步与执行其他与该 Registry 无关的本地操作。

### Requirement 11

**User Story:** 作为 NovaPay_Admin_Consumer，我希望在 NovaPay 后台浏览 Registry 中的插件，以便决定是否安装。

#### Acceptance Criteria

1. WHEN NovaPay_Admin_Consumer 访问 `app/admin/(console)/plugins/page.tsx`，THE NovaPay_Instance SHALL 通过 `lib/plugins/remote-registry.ts` 的 `fetchRemoteRegistrySnapshots` 拉取并展示所有已配置 Registry 中可见的 Plugin_Record。
2. THE NovaPay_Instance SHALL 在插件详情页 `app/admin/(console)/plugins/[slug]/page.tsx` 中展示 displayName、vendor、version、Pricing_Mode、priceLabel、capabilities 与分类。
3. THE Registry_Public_API 的 `GET /registry/plugins` 响应字段集合 SHALL 在不删除任何 `RemoteRegistryPluginRecord` 既有字段的前提下扩展。
4. WHERE NovaPay_Admin_Consumer 的当前界面语言为 `zh` 或 `en`，THE NovaPay_Instance SHALL 优先使用 Plugin_Record 元数据中对应语言的 displayName / summary / description。

### Requirement 12

**User Story:** 作为 NovaPay_Admin_Consumer，我希望一键安装免费插件，以便让其下属商户使用。

#### Acceptance Criteria

1. WHEN NovaPay_Admin_Consumer 在 Pricing_Mode 为 `FREE` 的 Plugin_Record 上点击安装，THE NovaPay_Instance SHALL 调用 `GET /registry/packages/:slug/:version` 获取签名后的下载地址与 Bundle_Signature。
2. WHEN NovaPay_Instance 完成 Plugin_Package 下载，THE NovaPay_Instance SHALL 使用 Registry 的 trust 公钥验证 Bundle_Signature。
3. IF Bundle_Signature 验证失败，THEN THE NovaPay_Instance SHALL 中止安装、把记录写入 `PluginPackageInstall.loadError` 并将状态置为 `LOAD_ERROR`。
4. WHEN Bundle_Signature 验证成功，THE NovaPay_Instance SHALL 执行 sha256 校验并按现有 `marketplace.ts` 的逻辑写入 `runtime/plugins/<slug>/<version>`。
5. WHEN 解压完成，THE NovaPay_Instance SHALL 通过 Sandboxed_Runtime 加载运行时模块。
6. IF Sandboxed_Runtime 在加载过程中检测到插件代码访问被拒绝的 Node API，THEN THE NovaPay_Instance SHALL 拒绝启用该插件并把错误信息写入 `PluginPackageInstall.loadError`。

### Requirement 13

**User Story:** 作为 NovaPay_Admin_Consumer，我希望对付费插件完成购买并自动获得授权，以便取代当前手动 `purchasedAt` 标记的临时方案。

#### Acceptance Criteria

1. WHEN NovaPay_Admin_Consumer 点击购买一个 Pricing_Mode 为 `PAID` 的 Plugin_Record，THE NovaPay_Instance SHALL 跳转或调用 Registry 的支付下单接口并附带本 NovaPay_Instance 的 instanceId。
2. WHEN 支付成功，THE Registry SHALL 签发一个 License，License 至少包含字段 `pluginSlug`、`version`、`instanceId`、`scope`（`INSTANCE` 或 `MERCHANT`）、`merchantId`（仅当 scope=`MERCHANT`）、`issuedAt`、`expiresAt`、`signature`。
3. WHEN NovaPay_Instance 准备启用付费插件，THE NovaPay_Instance SHALL 在启用前调用 `POST /licenses/verify` 校验 License 与本 instanceId、当前时间的有效性。
4. IF License 验证失败（签名不合法、instanceId 不匹配、已过期、已撤销），THEN THE NovaPay_Instance SHALL 拒绝启用插件并把原因写入 `PluginPurchaseRecord.notes`。
5. IF License 验证失败，THEN THE NovaPay_Instance SHALL 拒绝写入 `MarketplacePlugin.purchasedAt` 字段。
6. WHEN License 验证通过，THE NovaPay_Instance SHALL 把 License 内容（含签名）持久化到 `PluginPurchaseRecord.licenseKey` 并将 `MarketplacePlugin.purchasedAt` 置为 License.issuedAt。
7. THE NovaPay_Instance SHALL 每 24 小时重新校验已安装付费插件的 License。
8. IF 重新校验返回 License 已撤销，THEN THE NovaPay_Instance SHALL 自动禁用该插件并保留安装产物以便申诉恢复。
9. WHERE NovaPay_Instance 启动时检测到环境变量 `NOVAPAY_DISABLE_LICENSE_CHECK` 被设置为非空值，THE NovaPay_Instance SHALL 在日志中输出明显警告并标注「仅供开发环境使用」。

### Requirement 14

**User Story:** 作为 NovaPay_Admin_Consumer，我希望生产环境不会误用 mock registry，以便避免误用未签名的演示插件。

#### Acceptance Criteria

1. WHILE `process.env.NODE_ENV` 等于 `production`，THE NovaPay_Instance SHALL 在路由层拒绝 `app/api/mock-plugin-registry/**` 下所有请求并返回 HTTP 404。
2. WHEN NovaPay_Instance 在非生产环境启用 mock registry，THE NovaPay_Instance SHALL 在 `app/admin/(console)/plugins/sources/page.tsx` 上展示「当前 Registry 为 mock，仅供开发演示」提示。

---

### D. NovaPay_Merchant_Consumer（消费侧 - 商户）

### Requirement 15

**User Story:** 作为 NovaPay_Merchant_Consumer，我希望在 NovaPay 商户后台开通已经被平台启用的支付通道插件，以便对外收款。

#### Acceptance Criteria

1. THE NovaPay_Instance SHALL 仅向商户后台暴露 `MarketplacePlugin.installed` 为 true 且 `MarketplacePlugin.enabled` 为 true 的插件。
2. WHEN NovaPay_Merchant_Consumer 安装一个 FREE 插件，THE NovaPay_Instance SHALL 创建一条 `MerchantInstalledPlugin` 记录。
3. WHEN NovaPay_Merchant_Consumer 安装一个 scope 为 `MERCHANT` 的 PAID 插件，THE NovaPay_Instance SHALL 调用 `POST /licenses/verify` 时附带当前 merchantId 并仅在校验通过时创建 `MerchantInstalledPlugin`。
4. IF 一个 scope 为 `MERCHANT` 的 License 已经分配给其他 merchantId，THEN THE NovaPay_Instance SHALL 拒绝当前商户安装并返回 `LICENSE_ASSIGNED_TO_OTHER_MERCHANT` 错误码。

### Requirement 16

**User Story:** 作为 NovaPay_Merchant_Consumer，我希望使用插件提供的支付通道时不会被插件越权访问其他商户数据。

#### Acceptance Criteria

1. WHEN Sandboxed_Runtime 处理一笔商户的支付请求，THE Sandboxed_Runtime SHALL 仅向插件运行期暴露当前 merchantId 对应的 `MerchantChannelAccount.config` 与请求载荷。
2. IF 插件运行期试图访问 Capability_Whitelist 之外声明的能力（例如未声明 `notify_callback` 却调用回调签名 API），THEN THE Sandboxed_Runtime SHALL 抛出 `CAPABILITY_DENIED` 错误。
3. THE Sandboxed_Runtime SHALL 限制单次插件请求的最大执行时间为 5 秒、最大堆内存为 128MB。
4. IF 单次插件请求执行时间超过 5 秒，THEN THE Sandboxed_Runtime SHALL 终止该次执行并返回 `PLUGIN_RUNTIME_TIMEOUT` 错误码。
5. IF 单次插件请求堆内存超过 128MB，THEN THE Sandboxed_Runtime SHALL 终止该次执行并返回 `PLUGIN_RUNTIME_OOM` 错误码。

---

### E. Registry 公开 API 契约

### Requirement 17

**User Story:** 作为 NovaPay_Instance，我希望调用 Registry_Public_API 拉取插件目录与具体版本，以便驱动安装与升级。

#### Acceptance Criteria

1. THE Registry SHALL 实现 `GET /registry/plugins`，响应字段集合 SHALL 完全包含现有 `RemoteRegistryPluginRecord`（`lib/plugins/remote-registry.ts`）的字段，且新增字段不得破坏既有解析逻辑（`parseRemotePluginRecord`）。
2. THE Registry SHALL 实现 `GET /registry/plugins/:slug`，返回单个 Plugin_Record 与其 `PUBLISHED` 状态下的所有可用版本列表。
3. THE Registry SHALL 实现 `GET /registry/packages/:slug/:version`，返回 Plugin_Package 的下载地址（带短期签名）与 Bundle_Signature。
4. THE 下载地址签名有效期 SHALL 为 5 分钟。
5. WHEN NovaPay_Instance 在请求头中提供 `x-novapay-registry-app-id` 与 `x-novapay-registry-app-key`，THE Registry SHALL 在响应中针对该 instanceId 返回已购买的 PAID 插件的可见性与购买状态字段。
6. IF 请求头中的 appKey 与 Registry 中存储的 appKey 不匹配，THEN THE Registry SHALL 返回 HTTP 401 与 `INVALID_REGISTRY_APP_KEY` 错误码。
7. WHILE 一个请求因 `INVALID_REGISTRY_APP_KEY` 被拒绝，THE Registry SHALL 不在响应体中返回任何 Plugin_Record 数据。
8. THE Registry SHALL 对每个 instanceId 执行限流，默认上限 600 次每分钟。

### Requirement 18

**User Story:** 作为 NovaPay_Instance，我希望通过 License 校验 API 替代当前手动标记的购买记录，以便实现真实授权。

#### Acceptance Criteria

1. THE Registry SHALL 实现 `POST /licenses/verify`，请求体至少包含 `licenseKey`、`pluginSlug`、`version`、`instanceId` 与可选的 `merchantId`。
2. WHEN 请求中的 `licenseKey` 通过 Registry 主签名公钥校验且未撤销且未过期，THE Registry SHALL 返回 `valid: true` 与 License 元数据。
3. IF 请求中的 `instanceId` 与 License 绑定的 `instanceId` 不一致，THEN THE Registry SHALL 返回 `valid: false` 与 `reason: "INSTANCE_MISMATCH"`。
4. IF 请求中的 `merchantId` 与 scope 为 `MERCHANT` 的 License 绑定的 `merchantId` 不一致，THEN THE Registry SHALL 返回 `valid: false` 与 `reason: "MERCHANT_MISMATCH"`。
5. THE License 校验响应延迟 SHALL 在 P95 不超过 500ms（Registry 内部网络范围内）。

---

### F. 插件包安全与运行时

### Requirement 19

**User Story:** 作为 Registry_Admin，我希望所有发布插件包都带上签名，以便消费方在主程序中校验来源可信。

#### Acceptance Criteria

1. THE Registry SHALL 使用 Ed25519 算法对每个 Plugin_Package 字节内容生成 Bundle_Signature。
2. THE Registry SHALL 通过 `GET /registry/.well-known/trust.json` 端点暴露当前主签名公钥与有效期。
3. WHEN Registry_Admin 触发主签名密钥轮换，THE Registry SHALL 在 `trust.json` 中保留旧公钥至少 30 天。
4. THE NovaPay_Instance SHALL 在每次安装时校验 Bundle_Signature 与 sha256 校验和。
5. IF Bundle_Signature 校验或 sha256 校验任一失败，THEN THE NovaPay_Instance SHALL 阻止本次安装。
6. WHEN Bundle_Signature 与 sha256 两项校验均成功，THE NovaPay_Instance SHALL 继续完成本次安装流程。

### Requirement 20

**User Story:** 作为 Registry_Admin，我希望对上传的插件包执行基础静态扫描，以便在审核前过滤显著违规代码。

#### Acceptance Criteria

1. WHEN Plugin_Developer 提交一个 Plugin_Version，THE Registry SHALL 对 Plugin_Package 中所有 `.js`、`.mjs`、`.ts` 文件执行静态扫描。
2. IF 静态扫描检测到使用 `child_process.exec`、`child_process.spawn`、`eval` 或 `new Function` 的代码片段，THEN THE Registry SHALL 在审核工作流上将该 Plugin_Version 标记为「需要人工复核」。
3. IF 静态扫描检测到 Manifest 声明的 capabilities 与代码实际调用不匹配（例如声明 `notify_callback` 但未导出 `callbacks`），THEN THE Registry SHALL 在审核工作流上添加警告标签。

### Requirement 21

**User Story:** 作为 NovaPay_Admin_Consumer，我希望远程插件运行在沙箱中，以便降低主程序被恶意代码影响的风险。

#### Acceptance Criteria

1. THE NovaPay_Instance SHALL 通过 `worker_threads` 或 `node:vm` 实现 Sandboxed_Runtime，作为 `lib/plugins/local-package-runtimes.ts` 当前 `importLocalRuntimeModule` 的替换实现，并且 Sandboxed_Runtime SHALL 仅对 source 为 `REMOTE_SIGNED` 的插件生效。
2. THE Sandboxed_Runtime SHALL 默认禁用 `child_process`、嵌套的 `worker_threads`、`fs.writeFile` 系列接口。
3. IF 插件代码访问被禁用的接口，THEN THE Sandboxed_Runtime SHALL 抛出 `CAPABILITY_DENIED` 错误。
4. THE Sandboxed_Runtime SHALL 通过显式注入的宿主对象向插件提供 HTTP 调用、日志、时间、随机数能力，且每个能力 SHALL 接受 capability code 校验。
5. WHILE 一个 Plugin_Version 的运行时未通过 Sandboxed_Runtime 加载，THE NovaPay_Instance SHALL 在 `MarketplacePlugin.metadata.runnable` 字段中记录 false 并在 admin UI 中展示提示。

---

### G. 迁移与兼容

### Requirement 22

**User Story:** 作为 NovaPay_Admin_Consumer，我希望迁移期间内现有 mock registry 与新的独立 Registry 可以并行运行，以便平滑切换。

#### Acceptance Criteria

1. THE NovaPay_Instance SHALL 允许同时配置多个 `PluginRegistrySource` 记录。
2. WHEN NovaPay_Instance 同时连接 mock registry 与独立 Registry，THE NovaPay_Instance SHALL 在管理员 UI 中对每个 Plugin_Record 标注其来源 source 名称。
3. IF 同一 slug 同时出现在两个 source，THEN THE NovaPay_Instance SHALL 优先采用最近一次同步成功的 source 并在审计日志中记录一条冲突记录。
4. WHILE 一个 source 不可达或同步失败但不存在 slug 重复，THE NovaPay_Instance SHALL 不写入冲突审计日志。

### Requirement 23

**User Story:** 作为 NovaPay_Admin_Consumer，我希望升级 Registry 不会让旧版 NovaPay 解析失败，以便支持渐进升级。

#### Acceptance Criteria

1. THE Registry SHALL 在所有 `GET /registry/plugins` 响应中保留以下字段：`remotePluginId`、`slug`、`kind`、`channelCode`、`providerKey`、`packageName`、`displayName`、`vendor`、`description`、`version`、`latestVersion`、`runtimeMode`、`pricingMode`、`priceLabel`、`purchaseUrl`、`downloadUrl`、`checksum`、`signature`、`capabilities`、`metadata`，对应 `lib/plugins/remote-registry.ts` 的 `parseRemotePluginRecord`。
2. WHEN Registry 引入新字段，THE Registry SHALL 把新字段追加在原有字段之外且新字段 SHALL 为可选。
3. IF Registry 必须废弃某个既有字段，THEN THE Registry SHALL 在至少 90 天的窗口内同时返回新字段与旧字段。

### Requirement 24

**User Story:** 作为 Plugin_Developer，我希望 Registry 解析后再回写 Manifest、再次解析仍能得到等价结构，以便避免 Manifest 信息损耗。

#### Acceptance Criteria

1. THE Registry SHALL 提供 Manifest Pretty_Printer，用于将解析后的内部结构序列化回 `plugin.json` 文本。
2. FOR ALL 由 `parsePluginPackageManifest` 解析成功的 Manifest 对象 m，`parsePluginPackageManifest(prettyPrint(m))` SHALL 产生与 m 等价的对象（round-trip 属性）。
3. IF Pretty_Printer 必须丢弃某个非必填字段，THEN THE Pretty_Printer SHALL 在序列化时保留 `metadata` 中原始 JSON 副本以便审计回溯。

### Requirement 25

**User Story:** 作为 Registry_Admin 与项目经理，我希望本特性按阶段交付，以便降低一次性上线风险。

#### Acceptance Criteria

1. THE Registry 项目 SHALL 划分为四个交付阶段：阶段 1 独立 Registry 服务骨架与目录 API（替代 mock registry，FREE 插件可用）；阶段 2 Developer_Portal 与上传 / 审核流；阶段 3 付费 / License 校验 / 清结算；阶段 4 Sandboxed_Runtime 与静态扫描收紧。
2. THE 阶段 1 Registry 的 `GET /registry/plugins` 与 `GET /registry/packages/:slug/:version` 响应格式 SHALL 与现有 mock registry（`app/api/mock-plugin-registry/**`）的响应格式逐字段一致。
3. WHEN 阶段 1 上线，THE NovaPay_Instance SHALL 仅通过修改 `PluginRegistrySource.baseUrl` 即可接入新 Registry，无需修改 `lib/plugins/remote-registry.ts` 中的 `parseRemotePluginRecord` 解析代码。
4. THE 项目交付计划 SHALL 在每个阶段完成后保留对前一阶段 API 的兼容至少一个完整发布周期。
