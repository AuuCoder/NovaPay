import Link from "next/link";

export default function DeveloperAuthPage() {
  return (
    <section className="hero-band" style={{ minHeight: "calc(100vh - 80px)" }}>
      <div className="container" style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.1fr) minmax(380px, 0.9fr)", gap: 64, alignItems: "center" }}>
        <div>
          <p className="text-eyebrow">Developer Portal</p>
          <h1 className="text-display-xl" style={{ marginTop: 16 }}>
            Ship plugins.<br />Get paid.
          </h1>
          <p className="text-lead" style={{ marginTop: 24, maxWidth: 520 }}>
            Publish payment channel plugins to every NovaPay deployment from a single signed
            registry. Free or paid, with cryptographically verified licenses out of the box.
          </p>

          <div className="grid-3" style={{ marginTop: 40, gap: 16 }}>
            <div className="card-feature-sage">
              <p className="text-display-sm" style={{ marginBottom: 4 }}>Ed25519</p>
              <p className="text-body-sm text-mute">Every release is signed with a rotating registry key — verified offline by every NovaPay instance.</p>
            </div>
            <div className="card-feature-sage">
              <p className="text-display-sm" style={{ marginBottom: 4 }}>70%</p>
              <p className="text-body-sm text-mute">Default revenue share for paid plugin sales, settled to your payout account on approval.</p>
            </div>
            <div className="card-feature-sage">
              <p className="text-display-sm" style={{ marginBottom: 4 }}>30d</p>
              <p className="text-body-sm text-mute">Retired signing keys remain trusted for 30 days so historical bundles keep verifying cleanly.</p>
            </div>
          </div>
        </div>

        <div className="card card-lg" style={{ gap: 20 }}>
          <div>
            <h2 className="text-display-xs">Sign in</h2>
            <p className="text-body-sm text-body-color" style={{ marginTop: 4 }}>
              Or <Link href="/developer/auth/register" style={{ fontWeight: 600, color: "var(--color-positive-deep)", textDecoration: "underline", textUnderlineOffset: 3 }}>create a developer account</Link>
            </p>
          </div>

          <form className="flex-col" style={{ gap: 16 }}>
            <label className="label-block">
              <span className="label-text">Email</span>
              <input type="email" name="email" className="input" placeholder="you@example.com" />
            </label>
            <label className="label-block">
              <span className="label-text">Password</span>
              <input type="password" name="password" className="input" placeholder="At least 8 characters" />
            </label>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 13 }}>
              <label style={{ display: "inline-flex", alignItems: "center", gap: 8, color: "var(--color-body)" }}>
                <input type="checkbox" name="remember" /> Remember me
              </label>
              <Link href="/developer/auth/forgot" style={{ color: "var(--color-positive-deep)", fontWeight: 600 }}>
                Forgot password?
              </Link>
            </div>

            <button type="submit" className="btn btn-primary" style={{ width: "100%", marginTop: 8 }}>
              Sign in
            </button>
            <button type="button" className="btn btn-tertiary" style={{ width: "100%" }}>
              Continue with NovaPay merchant SSO
            </button>
          </form>

          <p className="text-caption" style={{ textAlign: "center" }}>
            Protected by registry rate limiting and audit logging.
          </p>
        </div>
      </div>
    </section>
  );
}
