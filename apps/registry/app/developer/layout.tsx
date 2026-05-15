import type { ReactNode } from "react";
import Link from "next/link";

const navLinks = [
  { href: "/developer/plugins", label: "My Plugins" },
  { href: "/developer/tokens", label: "API Tokens" },
  { href: "/developer/sales", label: "Sales" },
];

export default function DeveloperLayout({ children }: { children: ReactNode }) {
  return (
    <div style={{ minHeight: "100vh" }}>
      <nav
        style={{
          position: "sticky",
          top: 0,
          zIndex: 50,
          background: "var(--color-canvas)",
          padding: "var(--space-md) var(--space-xl)",
          borderBottom: "1px solid var(--color-canvas-soft)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Link
          href="/developer/plugins"
          style={{ fontWeight: 800, fontSize: "18px", color: "var(--color-ink)" }}
        >
          NovaPay Registry
        </Link>
        <div style={{ display: "flex", gap: "var(--space-xl)", alignItems: "center" }}>
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              style={{
                fontSize: "14px",
                fontWeight: 600,
                color: "var(--color-ink)",
              }}
            >
              {link.label}
            </Link>
          ))}
          <Link href="/developer/auth" className="btn-secondary" style={{ padding: "var(--space-sm) var(--space-lg)", fontSize: "14px" }}>
            Account
          </Link>
        </div>
      </nav>
      <main className="container" style={{ paddingTop: "var(--space-2xl)", paddingBottom: "var(--space-3xl)" }}>
        {children}
      </main>
    </div>
  );
}
