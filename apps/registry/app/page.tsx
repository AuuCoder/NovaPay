import Link from "next/link";

export default function HomePage() {
  return (
    <main>
      <section className="hero-band" style={{ paddingTop: 96, paddingBottom: 96 }}>
        <div className="container">
          <p className="text-eyebrow">NovaPay Plugin Registry</p>
          <h1 className="text-display-xxl" style={{ marginTop: 16, maxWidth: 900 }}>
            The signed marketplace for every NovaPay deployment.
          </h1>
          <p className="text-lead" style={{ marginTop: 32, maxWidth: 640 }}>
            Independent registry for payment-channel plugins. Free or paid, signed
            with Ed25519, verified offline, settled in CNY.
          </p>

          <div style={{ display: "flex", gap: 16, marginTop: 40, flexWrap: "wrap" }}>
            <Link href="/developer/plugins" className="btn btn-primary">Open developer portal</Link>
            <Link href="/api/registry/plugins" className="btn btn-tertiary">Browse public catalog</Link>
          </div>

          <div className="grid-3" style={{ marginTop: 80 }}>
            <div className="card-feature-sage">
              <p className="text-display-md" style={{ marginBottom: 12 }}>Sign</p>
              <p className="text-body-md text-body-color">
                Every release ships a checksum + Ed25519 signature. Rotate the master key any time;
                consumers keep verifying historical bundles for 30 days.
              </p>
            </div>
            <div className="card-feature-green">
              <p className="text-display-md" style={{ marginBottom: 12 }}>Sell</p>
              <p className="text-body-md text-body-color">
                Set a per-instance price or a per-merchant subscription. Licenses are JWS, scoped,
                and revocable from the admin console.
              </p>
            </div>
            <div className="card-feature-dark">
              <p className="text-display-md" style={{ marginBottom: 12, color: "var(--color-primary)" }}>Earn</p>
              <p className="text-body-md" style={{ color: "var(--color-canvas-soft)" }}>
                70% revenue share by default. Payouts are reviewed and settled to your linked
                bank account on approval.
              </p>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
