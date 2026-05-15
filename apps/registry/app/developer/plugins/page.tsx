import Link from "next/link";

interface PluginRow {
  slug: string;
  displayName: string;
  vendor: string;
  description: string;
  version: string;
  reviewState: "DRAFT" | "SUBMITTED" | "IN_REVIEW" | "APPROVED" | "PUBLISHED" | "REJECTED";
  pricingMode: "FREE" | "PAID";
  priceLabel?: string;
  capabilities: string[];
  installs: number;
  updatedAt: string;
  iconLetter: string;
}

const plugins: PluginRow[] = [
  {
    slug: "remote.demo-runnable-crypto",
    displayName: "Remote Demo Runnable",
    vendor: "NovaPay Demo Team",
    description: "Reference plugin used to validate end-to-end signed registry sync, install, and runtime loading.",
    version: "0.1.0",
    reviewState: "PUBLISHED",
    pricingMode: "FREE",
    capabilities: ["native_qr", "return_url", "order_close"],
    installs: 23,
    updatedAt: "2 hours ago",
    iconLetter: "R",
  },
  {
    slug: "remote.demo-paid-crypto",
    displayName: "Remote Demo Paid",
    vendor: "NovaPay Demo Team",
    description: "Paid runnable example covering license issuance, payout settlement, and merchant scope binding.",
    version: "0.2.0",
    reviewState: "PUBLISHED",
    pricingMode: "PAID",
    priceLabel: "¥99 / instance",
    capabilities: ["native_qr", "return_url", "order_close", "refund"],
    installs: 7,
    updatedAt: "yesterday",
    iconLetter: "P",
  },
  {
    slug: "remote.alipay-pro",
    displayName: "Alipay Pro",
    vendor: "Indie Studio",
    description: "Premium Alipay channel with advanced quoting, RSA2 signing, and merchant-facing reconciliation.",
    version: "1.4.0",
    reviewState: "IN_REVIEW",
    pricingMode: "PAID",
    priceLabel: "¥299 / mo",
    capabilities: ["page_redirect", "notify_callback", "rsa2_signature", "refund_query"],
    installs: 0,
    updatedAt: "3 days ago",
    iconLetter: "A",
  },
];

const stateBadge: Record<PluginRow["reviewState"], string> = {
  DRAFT: "badge-neutral",
  SUBMITTED: "badge-warning",
  IN_REVIEW: "badge-warning",
  APPROVED: "badge-positive",
  PUBLISHED: "badge-positive",
  REJECTED: "badge-negative",
};

export default function DeveloperPluginsPage() {
  const totalInstalls = plugins.reduce((acc, p) => acc + p.installs, 0);
  const published = plugins.filter((p) => p.reviewState === "PUBLISHED").length;
  const inReview = plugins.filter((p) => p.reviewState === "IN_REVIEW" || p.reviewState === "SUBMITTED").length;

  return (
    <>
      <section className="hero-band">
        <div className="container">
          <p className="text-eyebrow">Plugin workspace</p>
          <div className="flex-between" style={{ alignItems: "flex-end", marginTop: 12 }}>
            <div style={{ flex: 1, minWidth: 280 }}>
              <h1 className="text-display-lg">Your plugins</h1>
              <p className="text-lead" style={{ marginTop: 12, maxWidth: 640 }}>
                Manage plugin records, ship versions through the review workflow, and watch
                merchant adoption from a single dashboard.
              </p>
            </div>
            <div style={{ display: "flex", gap: 12 }}>
              <Link href="/developer/plugins/import" className="btn btn-tertiary">Import manifest</Link>
              <Link href="/developer/plugins/new" className="btn btn-primary">Create plugin</Link>
            </div>
          </div>

          <div className="grid-3" style={{ marginTop: 40 }}>
            <div className="stat-card feature">
              <p className="stat-label">Published</p>
              <p className="stat-value">{published}</p>
              <p className="stat-delta">+1 this week</p>
            </div>
            <div className="stat-card">
              <p className="stat-label">In review</p>
              <p className="stat-value">{inReview}</p>
              <p className="text-body-sm text-mute">awaiting registry approval</p>
            </div>
            <div className="stat-card">
              <p className="stat-label">Total installs</p>
              <p className="stat-value">{totalInstalls}</p>
              <p className="text-body-sm text-mute">across NovaPay instances</p>
            </div>
          </div>
        </div>
      </section>

      <section className="content-band">
        <div className="container">
          <div className="flex-between" style={{ marginBottom: 24 }}>
            <h2 className="text-display-sm">All plugins</h2>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="pill">All</button>
              <button className="pill">Published</button>
              <button className="pill">In review</button>
              <button className="pill">Drafts</button>
            </div>
          </div>

          <div className="grid-2">
            {plugins.map((plugin) => (
              <Link
                key={plugin.slug}
                href={`/developer/plugins/${plugin.slug}`}
                className="plugin-card"
              >
                <div className="plugin-card-head">
                  <div style={{ display: "flex", gap: 16, alignItems: "flex-start", minWidth: 0 }}>
                    <div className="plugin-card-icon">{plugin.iconLetter}</div>
                    <div className="plugin-card-meta">
                      <p className="plugin-card-title">{plugin.displayName}</p>
                      <p className="plugin-card-slug">{plugin.slug}</p>
                      <p className="text-body-sm text-mute">by {plugin.vendor}</p>
                    </div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-end" }}>
                    <span className={`badge ${stateBadge[plugin.reviewState]}`}>{plugin.reviewState}</span>
                    <span className={`badge ${plugin.pricingMode === "PAID" ? "badge-ink" : "badge-neutral"}`}>
                      {plugin.pricingMode === "PAID" ? plugin.priceLabel ?? "Paid" : "Free"}
                    </span>
                  </div>
                </div>

                <p className="plugin-card-body">{plugin.description}</p>

                <div className="pill-row">
                  {plugin.capabilities.map((cap) => (
                    <span key={cap} className="pill" style={{ fontFamily: "ui-monospace, monospace", fontSize: 12 }}>
                      {cap}
                    </span>
                  ))}
                </div>

                <div className="plugin-card-footer">
                  <span className="text-caption">v{plugin.version}</span>
                  <span className="text-caption">·</span>
                  <span className="text-caption">{plugin.installs} installs</span>
                  <span className="text-caption">·</span>
                  <span className="text-caption">Updated {plugin.updatedAt}</span>
                  <span style={{ marginLeft: "auto", fontSize: 13, fontWeight: 600, color: "var(--color-positive-deep)" }}>
                    Manage →
                  </span>
                </div>
              </Link>
            ))}
          </div>

          <div className="cta-block" style={{ marginTop: 64 }}>
            <div className="cta-text">
              <p className="text-eyebrow" style={{ color: "var(--color-primary)" }}>Need to upload?</p>
              <h3 className="text-display-sm">Drop a signed bundle, get a verified release.</h3>
              <p className="text-body-md" style={{ marginTop: 8 }}>
                Upload a tar.gz / zip up to 50 MB and the registry handles checksum, signing, and review queueing.
              </p>
            </div>
            <Link href="/developer/plugins/new" className="btn btn-primary">Upload bundle</Link>
          </div>
        </div>
      </section>
    </>
  );
}
