interface TokenRow {
  id: string;
  name: string;
  prefix: string;
  createdAt: string;
  lastUsedAt: string | null;
  status: "ACTIVE" | "REVOKED";
}

const tokens: TokenRow[] = [
  { id: "tok_1", name: "CI Pipeline", prefix: "nvreg_******a3f9", createdAt: "Jan 15, 2025", lastUsedAt: "12 minutes ago", status: "ACTIVE" },
  { id: "tok_2", name: "Local laptop", prefix: "nvreg_******2e7c", createdAt: "Mar 02, 2025", lastUsedAt: "5 days ago", status: "ACTIVE" },
  { id: "tok_3", name: "Old release bot", prefix: "nvreg_******8b21", createdAt: "Sep 11, 2024", lastUsedAt: null, status: "REVOKED" },
];

export default function DeveloperTokensPage() {
  return (
    <>
      <section className="hero-band">
        <div className="container">
          <p className="text-eyebrow">Credentials</p>
          <div className="flex-between" style={{ alignItems: "flex-end", marginTop: 12 }}>
            <div style={{ minWidth: 280 }}>
              <h1 className="text-display-lg">API tokens</h1>
              <p className="text-lead" style={{ marginTop: 12, maxWidth: 580 }}>
                Personal access tokens authenticate the Developer API for CI / CD. Tokens are
                shown once on creation — store them safely.
              </p>
            </div>
            <button className="btn btn-primary">Create token</button>
          </div>
        </div>
      </section>

      <section className="content-band">
        <div className="container" style={{ display: "grid", gridTemplateColumns: "minmax(0, 2fr) minmax(0, 1fr)", gap: 32 }}>
          <div className="card" style={{ padding: 0, overflow: "hidden" }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Token</th>
                  <th>Created</th>
                  <th>Last used</th>
                  <th>Status</th>
                  <th style={{ textAlign: "right" }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {tokens.map((token) => (
                  <tr key={token.id}>
                    <td className="text-body-md-strong">{token.name}</td>
                    <td>
                      <code style={{ fontFamily: "ui-monospace, monospace", fontSize: 13, color: "var(--color-body)" }}>
                        {token.prefix}
                      </code>
                    </td>
                    <td className="text-body-sm text-mute">{token.createdAt}</td>
                    <td className="text-body-sm text-mute">{token.lastUsedAt ?? "—"}</td>
                    <td>
                      <span className={`badge ${token.status === "ACTIVE" ? "badge-positive" : "badge-negative"}`}>
                        {token.status}
                      </span>
                    </td>
                    <td style={{ textAlign: "right" }}>
                      {token.status === "ACTIVE" ? (
                        <button className="btn btn-tertiary btn-sm">Revoke</button>
                      ) : (
                        <span className="text-caption">Revoked</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="card-feature-sage" style={{ padding: 32 }}>
            <p className="text-eyebrow">Security tip</p>
            <h3 className="text-display-xs" style={{ marginTop: 12 }}>Treat tokens like passwords.</h3>
            <p className="text-body-md text-body-color" style={{ marginTop: 12 }}>
              Rotate any token that may have leaked, and prefer per-environment tokens so revocation
              never breaks production.
            </p>
            <ul style={{ marginTop: 20, listStyle: "none", display: "flex", flexDirection: "column", gap: 12 }}>
              {["60 req/min limit per token", "Revoke takes effect within 5s", "Last-used time updates on every call"].map((item) => (
                <li key={item} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--color-primary)", marginTop: 8, flexShrink: 0 }} />
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
