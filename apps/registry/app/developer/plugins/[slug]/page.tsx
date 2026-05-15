import Link from "next/link";

interface VersionRow {
  version: string;
  reviewState: "DRAFT" | "SUBMITTED" | "IN_REVIEW" | "APPROVED" | "PUBLISHED" | "REJECTED";
  publishedAt: string | null;
  capabilities: string[];
  sizeKb: number;
}

const versions: VersionRow[] = [
  { version: "0.2.1", reviewState: "DRAFT", publishedAt: null, capabilities: ["native_qr", "return_url", "order_close"], sizeKb: 18 },
  { version: "0.2.0", reviewState: "PUBLISHED", publishedAt: "Apr 30, 2025", capabilities: ["native_qr", "return_url", "order_close"], sizeKb: 18 },
  { version: "0.1.0", reviewState: "PUBLISHED", publishedAt: "Mar 12, 2025", capabilities: ["native_qr", "return_url"], sizeKb: 14 },
];

const stateBadge: Record<VersionRow["reviewState"], string> = {
  DRAFT: "badge-neutral",
  SUBMITTED: "badge-warning",
  IN_REVIEW: "badge-warning",
  APPROVED: "badge-positive",
  PUBLISHED: "badge-positive",
  REJECTED: "badge-negative",
};

export default async function DeveloperPluginDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  return (
    <>
      <section className="hero-band">
        <div className="container">
          <Link href="/developer/plugins" className="text-body-sm" style={{ color: "var(--color-positive-deep)", fontWeight: 600 }}>
            ← Back to plugins
          </Link>

          <div className="flex-between" style={{ marginTop: 16, alignItems: "flex-end" }}>
            <div style={{ minWidth: 280 }}>
              <p className="text-eyebrow">PAYMENT_CHANNEL</p>
              <h1 className="text-display-lg" style={{ marginTop: 12 }}>Remote Demo Runnable</h1>
              <p className="plugin-card-slug" style={{ fontSize: 15, marginTop: 8 }}>{slug}</p>
              <div style={{ display: "flex", gap: 8, marginTop: 16, flexWrap: "wrap" }}>
                <span className="badge badge-positive">PUBLISHED</span>
                <span className="badge badge-neutral">FREE</span>
                <span className="badge badge-neutral">v0.2.0</span>
                <span className="badge badge-neutral">crypto</span>
              </div>
            </div>
            <div style={{ display: "flex", gap: 12 }}>
              <button className="btn btn-tertiary">Configure pricing</button>
              <Link
                href={`/developer/plugins/${slug}/upload`}
                className="btn btn-primary"
              >
                Upload new version
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="content-band">
        <div className="container" style={{ display: "grid", gridTemplateColumns: "minmax(0, 2fr) minmax(0, 1fr)", gap: 32 }}>
          <div className="flex-col" style={{ gap: 32 }}>
            <div className="card card-lg">
              <h2 className="text-display-xs">Description</h2>
              <p className="text-body-md text-body-color" style={{ marginTop: 12 }}>
                Reference plugin used to validate end-to-end signed registry sync, install, and runtime
                loading. Demonstrates the full Bundle pipeline including manifest parsing, sha256
                verification, Ed25519 signing, and sandbox-friendly runtime entrypoints.
              </p>

              <div className="divider" />

              <h3 className="text-display-xs">Capabilities</h3>
              <div className="pill-row" style={{ marginTop: 12 }}>
                {["native_qr", "return_url", "order_close"].map((cap) => (
                  <span key={cap} className="pill" style={{ fontFamily: "ui-monospace, monospace", fontSize: 13 }}>
                    {cap}
                  </span>
                ))}
              </div>
            </div>

            <div className="card" style={{ padding: 0, overflow: "hidden" }}>
              <div style={{ padding: "20px 24px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <h2 className="text-display-xs">Versions</h2>
                  <p className="text-body-sm text-mute" style={{ marginTop: 4 }}>Latest at the top</p>
                </div>
                <button className="btn btn-tertiary btn-sm">Submit for review</button>
              </div>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Version</th>
                    <th>State</th>
                    <th>Published</th>
                    <th>Capabilities</th>
                    <th style={{ textAlign: "right" }}>Size</th>
                  </tr>
                </thead>
                <tbody>
                  {versions.map((row) => (
                    <tr key={row.version}>
                      <td className="text-body-md-strong">v{row.version}</td>
                      <td>
                        <span className={`badge ${stateBadge[row.reviewState]}`}>{row.reviewState}</span>
                      </td>
                      <td className="text-body-sm text-mute">{row.publishedAt ?? "—"}</td>
                      <td>
                        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                          {row.capabilities.slice(0, 2).map((cap) => (
                            <span key={cap} className="pill" style={{ fontSize: 11, fontFamily: "ui-monospace, monospace", padding: "2px 8px" }}>
                              {cap}
                            </span>
                          ))}
                          {row.capabilities.length > 2 ? (
                            <span className="pill" style={{ fontSize: 11, padding: "2px 8px" }}>+{row.capabilities.length - 2}</span>
                          ) : null}
                        </div>
                      </td>
                      <td style={{ textAlign: "right" }} className="text-body-sm text-mute">{row.sizeKb} KB</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex-col" style={{ gap: 24 }}>
            <div className="card-feature-sage" style={{ padding: 24 }}>
              <p className="text-eyebrow">Pricing</p>
              <p className="text-display-xs" style={{ marginTop: 12 }}>Free</p>
              <p className="text-body-sm text-mute" style={{ marginTop: 4 }}>No license required</p>
              <button className="btn btn-tertiary" style={{ width: "100%", marginTop: 16 }}>Switch to paid</button>
            </div>

            <div className="card">
              <p className="text-eyebrow">Adoption</p>
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 16 }}>
                <div>
                  <p className="text-display-sm">23</p>
                  <p className="text-body-sm text-mute">instances</p>
                </div>
                <div style={{ textAlign: "right" }}>
                  <p className="text-display-sm">81</p>
                  <p className="text-body-sm text-mute">merchants</p>
                </div>
              </div>
            </div>

            <div className="card">
              <p className="text-eyebrow">Bundle metadata</p>
              <dl style={{ display: "grid", gridTemplateColumns: "100px 1fr", rowGap: 10, columnGap: 16, marginTop: 16 }}>
                <dt className="text-body-sm text-mute">channelCode</dt>
                <dd className="text-body-sm" style={{ fontFamily: "ui-monospace, monospace" }}>crypto.remote-runnable</dd>
                <dt className="text-body-sm text-mute">providerKey</dt>
                <dd className="text-body-sm" style={{ fontFamily: "ui-monospace, monospace" }}>crypto</dd>
                <dt className="text-body-sm text-mute">packageName</dt>
                <dd className="text-body-sm" style={{ fontFamily: "ui-monospace, monospace", wordBreak: "break-all" }}>@novapay/remote-demo-runnable</dd>
                <dt className="text-body-sm text-mute">vendor</dt>
                <dd className="text-body-sm">NovaPay Demo Team</dd>
              </dl>
            </div>

            <div className="card-feature-dark" style={{ padding: 24 }}>
              <p className="text-eyebrow" style={{ color: "var(--color-primary)" }}>Danger zone</p>
              <p className="text-body-sm" style={{ marginTop: 8, color: "var(--color-canvas-soft)" }}>
                Delete this plugin once and for all. Existing licenses are revoked immediately.
              </p>
              <button className="btn btn-secondary" style={{ width: "100%", marginTop: 16 }}>Delete plugin</button>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
