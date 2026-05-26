import { getCurrentLocale } from "@/lib/i18n-server";
import { getCurrentRegistrySession } from "../../../lib/auth/session";
import { createPersistentPatStore } from "../../../lib/auth/developer-pat";
import { TokenManager, type TokenListItem } from "./token-manager";

export default async function DeveloperTokensPage() {
  const locale = await getCurrentLocale();
  const session = await getCurrentRegistrySession();

  if (!session) {
    return null;
  }

  const canManage = session.actorKind === "DEVELOPER";
  const store = createPersistentPatStore();
  const tokens = canManage
    ? await store.listByDeveloper(session.actorId)
    : [];

  const initialTokens: TokenListItem[] = tokens.map((token) => ({
    id: token.id,
    name: token.name,
    tokenPreview: token.tokenPreview,
    status: token.status,
    lastUsedAt: token.lastUsedAt?.toISOString() ?? null,
    createdAt: token.createdAt.toISOString(),
    revokedAt: token.revokedAt?.toISOString() ?? null,
  }));

  const content =
    locale === "en"
      ? {
          eyebrow: "Credentials",
          title: "API tokens",
          lead:
            "Personal access tokens authenticate the Developer API for CI / CD. Tokens are shown exactly once at creation time, while the list keeps only a masked preview.",
          securityTip: "Security tip",
          securityTitle: "Treat tokens like passwords.",
          securityBody:
            "Use separate tokens for local work, CI, and release bots. If one environment leaks, you can revoke only that token without breaking the rest.",
          tips: [
            "Bearer tokens now work on the Developer upload / verification / submit APIs",
            "Only the token hash is stored on disk",
            "Revoked tokens stop authenticating immediately",
          ],
          manager: {
            create: "Create token",
            creating: "Creating…",
            name: "Name",
            token: "Token",
            created: "Created",
            lastUsed: "Last used",
            status: "Status",
            action: "Action",
            revoked: "Revoked",
            revoke: "Revoke",
            revoking: "Revoking…",
            noLastUsed: "—",
            active: "Active",
            createPlaceholder: "CI pipeline",
            createHint: "Create one token per environment so you can rotate safely.",
            revealTitle: "Copy this token now",
            revealBody:
              "This is the only time the raw token will be shown. After you close this card, only the masked preview remains in the Registry.",
            copy: "Copy token",
            copied: "Copied",
            close: "Close",
            noTokens: "No developer API tokens have been created yet.",
            sessionOnlyTitle: "Developer account required",
            sessionOnlyBody:
              "NovaPay admin SSO sessions can review and publish plugins, but API tokens belong only to dedicated developer accounts.",
            createFailed: "Failed to create token.",
            revokeFailed: "Failed to revoke token.",
          },
        }
      : {
          eyebrow: "凭证",
          title: "API 凭证",
          lead:
            "个人访问凭证现在已经真正接入开发者 API，可用于 CI / CD 上传插件、运行验证和提交审核。创建时只展示一次明文，列表里只保留掩码。",
          securityTip: "安全提示",
          securityTitle: "像管理密码一样管理凭证。",
          securityBody:
            "建议把本地开发、CI、发布机器人拆成不同 token。某一个环境疑似泄露时，只撤销对应 token 就够了。",
          tips: [
            "Bearer token 已接入开发者上传 / 验证 / 提交接口",
            "磁盘上只保存 token 哈希，不保存明文",
            "撤销后会立刻失效",
          ],
          manager: {
            create: "创建凭证",
            creating: "创建中…",
            name: "名称",
            token: "令牌",
            created: "创建时间",
            lastUsed: "最近使用",
            status: "状态",
            action: "操作",
            revoked: "已撤销",
            revoke: "撤销",
            revoking: "撤销中…",
            noLastUsed: "—",
            active: "生效中",
            createPlaceholder: "CI 流水线",
            createHint: "建议每个环境单独创建 token，便于安全轮换。",
            revealTitle: "请立即复制这个 token",
            revealBody:
              "这是唯一一次展示明文 token。关闭这个卡片后，Registry 里只会保留掩码预览。",
            copy: "复制 token",
            copied: "已复制",
            close: "关闭",
            noTokens: "当前还没有创建任何开发者 API 凭证。",
            sessionOnlyTitle: "需要开发者账号",
            sessionOnlyBody:
              "主站管理员 SSO 会话可以审核和发布插件，但 API 凭证只属于独立开发者账号。",
            createFailed: "创建凭证失败。",
            revokeFailed: "撤销凭证失败。",
          },
        };

  return (
    <>
      <section className="hero-band">
        <div className="container">
          <p className="text-eyebrow">{content.eyebrow}</p>
          <div className="flex-between" style={{ alignItems: "flex-end", marginTop: 12 }}>
            <div style={{ minWidth: 280 }}>
              <h1 className="text-display-lg">{content.title}</h1>
              <p className="text-lead" style={{ marginTop: 12, maxWidth: 640 }}>
                {content.lead}
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="content-band">
        <div
          className="container"
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 2fr) minmax(0, 1fr)",
            gap: 32,
          }}
        >
          <TokenManager
            initialTokens={initialTokens}
            locale={locale}
            copy={content.manager}
            canManage={canManage}
          />

          <div className="card-feature-sage" style={{ padding: 32 }}>
            <p className="text-eyebrow">{content.securityTip}</p>
            <h3 className="text-display-xs" style={{ marginTop: 12 }}>
              {content.securityTitle}
            </h3>
            <p className="text-body-md text-body-color" style={{ marginTop: 12 }}>
              {content.securityBody}
            </p>
            <ul
              style={{
                marginTop: 20,
                listStyle: "none",
                display: "flex",
                flexDirection: "column",
                gap: 12,
              }}
            >
              {content.tips.map((item) => (
                <li
                  key={item}
                  style={{ display: "flex", gap: 10, alignItems: "flex-start" }}
                >
                  <span
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: "50%",
                      background: "var(--color-primary)",
                      marginTop: 8,
                      flexShrink: 0,
                    }}
                  />
                  <span className="text-body-sm">{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>
    </>
  );
}
