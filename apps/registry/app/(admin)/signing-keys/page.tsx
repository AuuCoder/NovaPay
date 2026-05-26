import { requireRegistryAdminSession } from "../../../lib/auth/session";
import { getCurrentLocale } from "@/lib/i18n-server";
import { getRegistryRuntime } from "../../../lib/runtime/state";
import { RotateSigningKeyForm } from "./rotate-form";

export default async function AdminSigningKeysPage() {
  await requireRegistryAdminSession();
  const locale = (await getCurrentLocale()) as "zh" | "en";
  const state = await getRegistryRuntime();
  const [active, anchors] = await Promise.all([
    state.keyStore.getActive(),
    state.keyStore.listTrustAnchors(),
  ]);

  const content =
    locale === "en"
      ? {
          eyebrow: "Trust & Signing",
          title: "Signing key control",
          subtitle:
            "Inspect active and retired trust anchors, then rotate the Ed25519 signing key used for package signatures and license issuance.",
          stats: {
            active: "Active key",
            anchors: "Trust anchors",
            retired: "Retired keys",
          },
          sections: {
            inventory: "Trust inventory",
            inventoryNote:
              "Every key below is currently trusted by the registry verification layer until its retirement window expires.",
            rotate: "Rotate signing key",
            rotateNote:
              "Use a new key identifier or let the system generate one. Rotation immediately changes the active signing key and keeps the retired key in trust for the grace window.",
          },
          fields: {
            keyId: "Key ID",
            status: "Status",
            validity: "Validity",
            createdAt: "Created at",
            keyIdInput: "Custom key ID",
            keyIdPlaceholder: "Leave blank to auto-generate",
            grace: "Retired grace (ms)",
            gracePlaceholder: "Optional override",
            rotate: "Rotate key",
            rotating: "Rotating...",
            rotated: "Signing key rotated.",
            failed: "Failed to rotate signing key.",
          },
        }
      : {
          eyebrow: "信任与签名",
          title: "签名密钥控制",
          subtitle:
            "查看当前活跃与已退休的信任锚点，并轮换用于插件包签名和授权签发的 Ed25519 密钥。",
          stats: {
            active: "活跃密钥",
            anchors: "信任锚点",
            retired: "退休密钥",
          },
          sections: {
            inventory: "信任清单",
            inventoryNote:
              "下方列出的密钥都会在各自退役窗口结束前继续被注册中心验证层信任。",
            rotate: "轮换签名密钥",
            rotateNote:
              "你可以手动指定新密钥标识，也可以让系统自动生成。轮换后会立刻切换活跃密钥，并在宽限期内继续信任旧密钥。",
          },
          fields: {
            keyId: "密钥 ID",
            status: "状态",
            validity: "有效期",
            createdAt: "创建时间",
            keyIdInput: "自定义密钥 ID",
            keyIdPlaceholder: "留空则自动生成",
            grace: "退役宽限期（毫秒）",
            gracePlaceholder: "可选覆盖值",
            rotate: "轮换密钥",
            rotating: "轮换中...",
            rotated: "签名密钥已轮换。",
            failed: "轮换签名密钥失败。",
          },
        };

  return (
    <section className="admin-shell">
      <div className="container admin-page">
        <div className="governance-hero">
          <div className="governance-hero-head">
            <div className="admin-header-copy">
              <p className="text-eyebrow">{content.eyebrow}</p>
              <h1 className="admin-title">{content.title}</h1>
              <p className="admin-subtitle">{content.subtitle}</p>
            </div>
          </div>

          <div className="governance-strip">
            <div className="governance-metric">
              <span className="governance-metric-label">{content.stats.active}</span>
              <span className="governance-metric-value">{active.keyId}</span>
            </div>
            <div className="governance-metric">
              <span className="governance-metric-label">{content.stats.anchors}</span>
              <span className="governance-metric-value">{anchors.length}</span>
            </div>
            <div className="governance-metric">
              <span className="governance-metric-label">{content.stats.retired}</span>
              <span className="governance-metric-value">
                {anchors.filter((item) => item.status === "RETIRED").length}
              </span>
            </div>
          </div>
        </div>

        <div className="detail-grid">
          <section className="detail-section">
            <div className="detail-surface">
              <div className="detail-surface-head">
                <h2 className="detail-surface-title">{content.sections.inventory}</h2>
                <p className="detail-surface-note">{content.sections.inventoryNote}</p>
              </div>
              <div style={{ overflowX: "auto" }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>{content.fields.keyId}</th>
                      <th>{content.fields.status}</th>
                      <th>{content.fields.validity}</th>
                      <th>{content.fields.createdAt}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {anchors.map((anchor) => (
                      <tr key={anchor.keyId}>
                        <td className="text-body-sm text-body-color">{anchor.keyId}</td>
                        <td>
                          <span className={anchor.status === "ACTIVE" ? "badge badge-positive" : "badge badge-neutral"}>
                            {anchor.status}
                          </span>
                        </td>
                        <td className="text-body-sm text-body-color">
                          {anchor.notBefore.toISOString()} → {anchor.notAfter.toISOString()}
                        </td>
                        <td className="text-body-sm text-body-color">{anchor.createdAt.toISOString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          <aside className="detail-section sticky-side">
            <div className="detail-surface">
              <div className="detail-surface-head">
                <h2 className="detail-surface-title">{content.sections.rotate}</h2>
                <p className="detail-surface-note">{content.sections.rotateNote}</p>
              </div>
              <RotateSigningKeyForm
                locale={locale}
                copy={{
                  keyId: content.fields.keyIdInput,
                  keyIdPlaceholder: content.fields.keyIdPlaceholder,
                  grace: content.fields.grace,
                  gracePlaceholder: content.fields.gracePlaceholder,
                  submit: content.fields.rotate,
                  submitting: content.fields.rotating,
                  success: content.fields.rotated,
                  failed: content.fields.failed,
                }}
              />
            </div>
          </aside>
        </div>
      </div>
    </section>
  );
}
