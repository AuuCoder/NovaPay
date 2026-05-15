import type { ReactNode } from "react";

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <div>
      <header style={{ padding: "1rem", borderBottom: "1px solid #eee" }}>
        <strong>NovaPay Plugin Registry — Admin</strong>
      </header>
      <main style={{ padding: "1rem" }}>{children}</main>
    </div>
  );
}
