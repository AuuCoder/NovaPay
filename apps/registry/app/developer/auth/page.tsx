export default function DeveloperAuthPage() {
  return (
    <div style={{ maxWidth: "480px", margin: "0 auto", paddingTop: "var(--space-3xl)" }}>
      <div className="card" style={{ textAlign: "center" }}>
        <h1 className="text-display-sm" style={{ color: "var(--color-ink)" }}>
          Developer Portal
        </h1>
        <p className="text-body-md" style={{ color: "var(--color-body)", marginTop: "var(--space-sm)" }}>
          Register or sign in to start publishing plugins on the NovaPay marketplace.
        </p>

        <form style={{ marginTop: "var(--space-2xl)", display: "grid", gap: "var(--space-lg)" }}>
          <div style={{ textAlign: "left" }}>
            <label className="text-body-sm" style={{ fontWeight: 600, display: "block", marginBottom: "var(--space-xs)" }}>
              Email
            </label>
            <input
              type="email"
              name="email"
              className="input"
              placeholder="you@example.com"
            />
          </div>
          <div style={{ textAlign: "left" }}>
            <label className="text-body-sm" style={{ fontWeight: 600, display: "block", marginBottom: "var(--space-xs)" }}>
              Password
            </label>
            <input
              type="password"
              name="password"
              className="input"
              placeholder="Minimum 8 characters"
            />
          </div>
          <button type="submit" className="btn-primary" style={{ width: "100%", marginTop: "var(--space-sm)" }}>
            Sign In
          </button>
        </form>

        <p className="text-body-sm" style={{ color: "var(--color-mute)", marginTop: "var(--space-xl)" }}>
          Don&apos;t have an account?{" "}
          <a href="/developer/auth/register" style={{ color: "var(--color-ink)", fontWeight: 600 }}>
            Register
          </a>
        </p>
      </div>
    </div>
  );
}
