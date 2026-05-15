export default function DeveloperSalesPage() {
  // Phase 2 placeholder — install stats only (no revenue until Phase 3)
  const stats = [
    { date: "2025-05-14", distinctInstances: 3, enabledMerchants: 7 },
    { date: "2025-05-13", distinctInstances: 2, enabledMerchants: 5 },
    { date: "2025-05-12", distinctInstances: 4, enabledMerchants: 9 },
  ];

  return (
    <div>
      <div style={{ marginBottom: "var(--space-2xl)" }}>
        <h1 className="text-display-sm" style={{ color: "var(--color-ink)" }}>Sales &amp; Installs</h1>
        <p className="text-body-md" style={{ color: "var(--color-body)", marginTop: "var(--space-sm)" }}>
          Daily install counts and merchant adoption metrics for your plugins.
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "var(--space-lg)", marginBottom: "var(--space-2xl)" }}>
        <div className="card-green" style={{ textAlign: "center" }}>
          <p className="text-caption" style={{ textTransform: "uppercase", letterSpacing: "0.05em" }}>Total Instances</p>
          <p className="text-display-sm" style={{ color: "var(--color-ink)", marginTop: "var(--space-sm)" }}>9</p>
        </div>
        <div className="card-green" style={{ textAlign: "center" }}>
          <p className="text-caption" style={{ textTransform: "uppercase", letterSpacing: "0.05em" }}>Active Merchants</p>
          <p className="text-display-sm" style={{ color: "var(--color-ink)", marginTop: "var(--space-sm)" }}>21</p>
        </div>
      </div>

      <div className="card">
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--color-canvas-soft)" }}>
              <th className="text-caption" style={{ textAlign: "left", padding: "var(--space-md) var(--space-lg)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Date</th>
              <th className="text-caption" style={{ textAlign: "right", padding: "var(--space-md) var(--space-lg)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Instances</th>
              <th className="text-caption" style={{ textAlign: "right", padding: "var(--space-md) var(--space-lg)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Merchants</th>
            </tr>
          </thead>
          <tbody>
            {stats.map((row) => (
              <tr key={row.date} style={{ borderBottom: "1px solid var(--color-canvas-soft)" }}>
                <td className="text-body-sm" style={{ padding: "var(--space-md) var(--space-lg)" }}>{row.date}</td>
                <td className="text-body-sm" style={{ padding: "var(--space-md) var(--space-lg)", textAlign: "right", fontWeight: 600 }}>{row.distinctInstances}</td>
                <td className="text-body-sm" style={{ padding: "var(--space-md) var(--space-lg)", textAlign: "right", fontWeight: 600 }}>{row.enabledMerchants}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
