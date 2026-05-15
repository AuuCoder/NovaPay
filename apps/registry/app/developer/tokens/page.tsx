export default function DeveloperTokensPage() {
  // Phase 2 placeholder — will be wired to PAT store
  const tokens = [
    { id: "tok_1", name: "CI Pipeline", createdAt: "2025-01-15", lastUsedAt: "2025-05-14", status: "ACTIVE" as const },
  ];

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--space-2xl)" }}>
        <div>
          <h1 className="text-display-sm" style={{ color: "var(--color-ink)" }}>API Tokens</h1>
          <p className="text-body-md" style={{ color: "var(--color-body)", marginTop: "var(--space-sm)" }}>
            Create personal access tokens for CI/CD integration. Tokens are shown only once at creation.
          </p>
        </div>
        <button className="btn-primary">Create Token</button>
      </div>

      <div className="card">
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--color-canvas-soft)" }}>
              <th className="text-caption" style={{ textAlign: "left", padding: "var(--space-md) var(--space-lg)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Name</th>
              <th className="text-caption" style={{ textAlign: "left", padding: "var(--space-md) var(--space-lg)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Created</th>
              <th className="text-caption" style={{ textAlign: "left", padding: "var(--space-md) var(--space-lg)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Last Used</th>
              <th className="text-caption" style={{ textAlign: "left", padding: "var(--space-md) var(--space-lg)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Status</th>
              <th className="text-caption" style={{ textAlign: "right", padding: "var(--space-md) var(--space-lg)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {tokens.map((token) => (
              <tr key={token.id} style={{ borderBottom: "1px solid var(--color-canvas-soft)" }}>
                <td className="text-body-sm" style={{ padding: "var(--space-md) var(--space-lg)", fontWeight: 600 }}>{token.name}</td>
                <td className="text-body-sm text-mute" style={{ padding: "var(--space-md) var(--space-lg)" }}>{token.createdAt}</td>
                <td className="text-body-sm text-mute" style={{ padding: "var(--space-md) var(--space-lg)" }}>{token.lastUsedAt}</td>
                <td style={{ padding: "var(--space-md) var(--space-lg)" }}>
                  <span className={`badge ${token.status === "ACTIVE" ? "badge-positive" : "badge-negative"}`}>
                    {token.status}
                  </span>
                </td>
                <td style={{ padding: "var(--space-md) var(--space-lg)", textAlign: "right" }}>
                  <button className="btn-tertiary" style={{ padding: "var(--space-xs) var(--space-md)", fontSize: "14px" }}>
                    Revoke
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
