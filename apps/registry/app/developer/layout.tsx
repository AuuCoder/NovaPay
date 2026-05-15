import type { ReactNode } from "react";
import Link from "next/link";

const navLinks = [
  { href: "/developer/plugins", label: "Plugins" },
  { href: "/developer/tokens", label: "API Tokens" },
  { href: "/developer/sales", label: "Sales" },
  { href: "/developer/docs", label: "Docs" },
];

export default function DeveloperLayout({ children }: { children: ReactNode }) {
  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <nav className="nav">
        <div className="nav-inner">
          <Link href="/developer/plugins" className="nav-brand">
            <span className="nav-brand-mark">N</span>
            <span>NovaPay Registry</span>
          </Link>
          <div className="nav-links">
            {navLinks.map((link) => (
              <Link key={link.href} href={link.href} className="nav-link">
                {link.label}
              </Link>
            ))}
          </div>
          <div className="nav-actions">
            <Link href="/developer/auth" className="btn btn-tertiary btn-sm">
              Sign in
            </Link>
            <Link href="/developer/auth" className="btn btn-primary btn-sm">
              Get started
            </Link>
          </div>
        </div>
      </nav>

      <main style={{ flex: 1 }}>{children}</main>

      <footer className="footer">
        <div className="container" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 48 }}>
          <div>
            <div className="nav-brand" style={{ color: "var(--color-canvas-soft)" }}>
              <span className="nav-brand-mark">N</span>
              <span>NovaPay Registry</span>
            </div>
            <p className="text-body-sm" style={{ marginTop: 12, color: "var(--color-mute)", maxWidth: 280 }}>
              The independent plugin marketplace for NovaPay deployments.
              Sign your code, ship your work, get paid.
            </p>
          </div>
          <div className="flex-col">
            <p className="text-eyebrow" style={{ color: "var(--color-primary)" }}>Build</p>
            <Link href="/developer/plugins" className="text-body-sm">Plugins</Link>
            <Link href="/developer/tokens" className="text-body-sm">API tokens</Link>
            <Link href="/developer/docs" className="text-body-sm">Documentation</Link>
          </div>
          <div className="flex-col">
            <p className="text-eyebrow" style={{ color: "var(--color-primary)" }}>Earn</p>
            <Link href="/developer/sales" className="text-body-sm">Sales dashboard</Link>
            <Link href="/developer/payouts" className="text-body-sm">Payouts</Link>
          </div>
          <div className="flex-col">
            <p className="text-eyebrow" style={{ color: "var(--color-primary)" }}>Trust</p>
            <Link href="/.well-known/trust.json" className="text-body-sm">trust.json</Link>
            <Link href="/security" className="text-body-sm">Security policy</Link>
          </div>
        </div>
        <div className="container" style={{ marginTop: 48, paddingTop: 32, borderTop: "1px solid rgba(255,255,255,0.08)" }}>
          <p className="text-caption" style={{ color: "var(--color-mute)" }}>
            © {new Date().getFullYear()} NovaPay Registry · Powered by Ed25519 signatures.
          </p>
        </div>
      </footer>
    </div>
  );
}
