[English](./SECURITY.md)

# 安全策略

## 范围

这个仓库用于发布 NovaPay 应用框架代码，不发布生产数据或真实凭证。

公开仓库**只应该**包含：

- 应用源码
- Prisma schema 和迁移文件
- 部署与接入文档
- 用占位值的环境变量示例

公开仓库**绝不能**包含：

- 真实 `.env`
- 数据库导出 / 本地数据库文件
- 从生产复制出来的支付证书、私钥、平台公钥包
- 商户生产数据、回调载荷、审计导出
- 暴露真实账号或密钥的截图、日志、测试 fixture

## 漏洞披露

仓库公开前必须先准备好至少一条私有上报通道：

- GitHub Private Vulnerability Reporting
- 专用安全邮箱（如 `security@your-domain`）

如果还没准备好私有上报通道，不要要求报告者把利用细节直接发到公开 Issue。

## 公开发布前的检查清单

第一次推送到公开仓库前，逐项确认：

1. `.env`、`.env.local`、证书文件、私钥文件、数据库文件、导出、备份都已经在 `.gitignore` 里
2. `.env.example` / `.env.docker-compose.example` 只放占位符，不放真实密钥
3. 数据库结构只发 `prisma/schema.prisma` 和 migration 文件，不发数据导出
4. README、部署文档、示例命令统一使用占位值，不出现真实凭证或内部地址
5. Git 历史里没有曾经误提交过的密钥；如果有，必须 rewrite history 并轮换所有受影响的凭证后再公开
6. 商户支付通道凭证保持商户管理，绝不为图方便挪到平台环境变量里

## 凭证轮换

只要任何一个真实密钥曾经在本地被 commit 或推到远程仓库，就必须在公开发布前轮换：

- 数据库密码
- `NOVAPAY_DATA_ENCRYPTION_KEY`
- 引导管理员密码
- 支付通道私钥和证书
- 商户 API 凭证
- `REGISTRY_DEFAULT_APP_KEY`、`REGISTRY_SSO_SECRET`
- MinIO / S3 access key

## 仓库维护建议

首次公开发布建议包含的内容：

- `app/`
- `lib/`
- `prisma/`
- `scripts/`
- `tests/`
- `docs/`
- `apps/registry/`
- `deploy/`
- `.gitignore`
- `.env.example`、`.env.docker-compose.example`
- `README.md` / `README.zh-CN.md`
- `SECURITY.md` / `SECURITY.zh-CN.md`
- 包管理器与构建配置

不要发布的内容：

- `.env`
- `.next/`
- `node_modules/`
- `generated/`
- `runtime/plugins/`（运行时下载的插件包，每个部署应该自己重建）
- `apps/registry/.tmp/`、`/.tmp/`
- `artifacts/`
- 任何包含商户或支付方真实密钥的本地文件
