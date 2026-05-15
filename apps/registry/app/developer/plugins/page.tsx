import Link from "next/link";

export default function DeveloperPluginsPage() {
  // Phase 2 placeholder — will be wired to the database
  const plugins = [
    {
      slug: "remote.demo-runnable-crypto",
      displayName: "Remote Demo Runnable Plugin",
      version: "0.1.0",
      status: "PUBLISHED" as const,
      pricingMode: "FREE" as const,
    },
  ];

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--space-2xl)" }}>
        <div>
          <h1 className="text-display-sm" style={{ color: "var(--color-ink)" }}>My Plugins</h1>
          <p className="text-body-md" style={{ color: "var(--color-body)", marginTop: "var(--space-sm)" }}>
            Manage your plugin records, upload new versions, and track review status.
          </p>
        </div>
        <Link href="/developer/plugins/new" className="btn-primary">
          Create Plugin
        </Link>
      </div>

      <div style={{ display: "grid", gap: "var(--space-lg)" }}>
        {plugins.map((plugin) => (
          <Link
            key={plugin.slug}
            href={`/developer/plugins/${plugin.slug}`}
            className="card"
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              transition: "box-shadow 0.15s ease",
            }}
          >
            <div>
              <h3 className="text-display-xs" style={{ color: "var(--color-ink)" }}>
                {plugin.displayName}
              </h3>
              <p className="text-body-sm" style={{ color: "var(--color-mute)", marginTop: "var(--space-xs)" }}>
                {plugin.slug} · v{plugin.version}
              </p>
            </div>
            <div style={{ display: "flex", gap: "var(--space-sm)", alignItems: "center" }}>
              <span className={`badge ${plugin.status === "PUBLISHED" ? "badge-positive" : "badge-neutral"}`}>
                {plugin.status}
              </span>
              <span className="badge badge-neutral">
                {plugin.pricingMode}
              </span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
