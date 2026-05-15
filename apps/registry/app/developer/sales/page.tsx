interface DailyStat {
  date: string;
  instances: number;
  merchants: number;
  revenueCents: number;
}

const stats: DailyStat[] = [
  { date: "May 14", instances: 5, merchants: 12, revenueCents: 49800 },
  { date: "May 13", instances: 3, merchants: 8, revenueCents: 19800 },
  { date: "May 12", instances: 6, merchants: 14, revenueCents: 59400 },
  { date: "May 11", instances: 2, merchants: 7, revenueCents: 9900 },
  { date: "May 10", instances: 4, merchants: 11, revenueCents: 39600 },
  { date: "May 09", instances: 4, merchants: 10, revenueCents: 39600 },
  { date: "May 08", instances: 3, merchants: 9, revenueCents: 19800 },
];

const maxRevenue = Math.max(...stats.map((s) => s.revenueCents));

function formatCny(cents: number) {
  return `¥${(cents / 100).toFixed(2)}`;
}

export default function DeveloperSalesPage() {
  const totalRevenue = stats.reduce((acc, s) => acc + s.revenueCents, 0);
  const totalInstances = stats.reduce((acc, s) => acc + s.instances, 0);
  const totalMerchants = stats.reduce((acc, s) => acc + s.merchants, 0);

  return (
    <>
      <section className="hero-band">
        <div className="container">
          <p className="text-eyebrow">Last 7 days</p>
          <h1 className="text-display-lg" style={{ marginTop: 12 }}>Sales & adoption</h1>
          <p className="text-lead" style={{ marginTop: 12, maxWidth: 640 }}>
            Daily install footprint and revenue across all your published plugins. License sales
            settle to your developer balance within 24 hours.
          </p>

          <div className="grid-3" style={{ marginTop: 40 }}>
            <div className="stat-card feature">
              <p className="stat-label">Revenue</p>
              <p className="stat-value">{formatCny(totalRevenue)}</p>
              <p className="stat-delta">+18% vs last week</p>
            </div>
            <div className="stat-card">
              <p className="stat-label">Distinct instances</p>
              <p className="stat-value">{totalInstances}</p>
              <p className="text-body-sm text-mute">unique NovaPay deployments</p>
            </div>
            <div className="stat-card">
              <p className="stat-label">Active merchants</p>
              <p className="stat-value">{totalMerchants}</p>
              <p className="text-body-sm text-mute">cumulative across plugins</p>
            </div>
          </div>
        </div>
      </section>

      <section className="content-band">
        <div className="container" style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.3fr) minmax(0, 1fr)", gap: 32 }}>
          <div className="card card-lg">
            <div className="flex-between" style={{ marginBottom: 24 }}>
              <div>
                <h2 className="text-display-xs">Revenue by day</h2>
                <p className="text-body-sm text-mute" style={{ marginTop: 4 }}>License sales × revenue share</p>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button className="pill">7d</button>
                <button className="pill">30d</button>
                <button className="pill">90d</button>
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "flex-end", gap: 18, height: 220 }}>
              {stats.slice().reverse().map((stat) => {
                const heightPct = (stat.revenueCents / maxRevenue) * 100;
                return (
                  <div key={stat.date} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
                    <div style={{ height: "100%", width: "100%", display: "flex", alignItems: "flex-end" }}>
                      <div
                        title={formatCny(stat.revenueCents)}
                        style={{
                          width: "100%",
                          height: `${Math.max(8, heightPct)}%`,
                          background: "var(--color-primary)",
                          borderRadius: "12px 12px 4px 4px",
                          transition: "height 0.4s ease",
                        }}
                      />
                    </div>
                    <span className="text-caption">{stat.date}</span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="card-feature-dark" style={{ padding: 32, display: "flex", flexDirection: "column", justifyContent: "space-between", gap: 24 }}>
            <div>
              <p className="text-eyebrow" style={{ color: "var(--color-primary)" }}>Available balance</p>
              <p className="text-display-md" style={{ marginTop: 8 }}>{formatCny(28800)}</p>
              <p className="text-body-sm" style={{ marginTop: 8, color: "var(--color-canvas-soft)" }}>
                Frozen pending payouts: ¥0.00
              </p>
            </div>
            <div className="flex-col">
              <button className="btn btn-primary" style={{ width: "100%" }}>Request payout</button>
              <button className="btn btn-secondary" style={{ width: "100%" }}>Add bank account</button>
            </div>
          </div>
        </div>

        <div className="container" style={{ marginTop: 32 }}>
          <div className="card" style={{ padding: 0, overflow: "hidden" }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th style={{ textAlign: "right" }}>Instances</th>
                  <th style={{ textAlign: "right" }}>Merchants</th>
                  <th style={{ textAlign: "right" }}>Revenue</th>
                </tr>
              </thead>
              <tbody>
                {stats.map((stat) => (
                  <tr key={stat.date}>
                    <td className="text-body-md-strong">{stat.date}</td>
                    <td style={{ textAlign: "right" }}>{stat.instances}</td>
                    <td style={{ textAlign: "right" }}>{stat.merchants}</td>
                    <td style={{ textAlign: "right", fontWeight: 600 }}>{formatCny(stat.revenueCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </>
  );
}
