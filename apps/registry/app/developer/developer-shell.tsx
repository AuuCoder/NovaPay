"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

export function DeveloperShell(props: {
  children: ReactNode;
  brand: string;
  note: string;
  subtitle: string;
  workspaceLabel: string;
  navLinks: Array<{ href: string; label: string }>;
  localeSwitcher: ReactNode;
  sessionArea: ReactNode;
  topbarActions: ReactNode;
  breadcrumb: ReactNode;
  nav: ReactNode;
}) {
  const pathname = usePathname();

  if (pathname.startsWith("/developer/auth")) {
    return <>{props.children}</>;
  }

  return (
    <div className="console-shell">
      <aside className="console-sidebar">
        <div className="console-sidebar-brand">
          <span className="console-sidebar-mark">N</span>
          <div className="console-sidebar-copy">
            <span>{props.brand}</span>
            <span className="console-sidebar-note">{props.note}</span>
          </div>
        </div>

        <div className="console-sidebar-section">
          <p className="console-sidebar-label">{props.workspaceLabel}</p>
          {props.nav}
        </div>

        <div />

        <div className="console-user-card">{props.sessionArea}</div>
      </aside>

      <div className="console-main">
        <header className="console-topbar">
          <div className="console-topbar-copy">
            {props.breadcrumb}
            <p className="console-topbar-title">{props.brand}</p>
            <p className="console-topbar-subtitle">{props.subtitle}</p>
          </div>
          <div className="console-topbar-actions">
            {props.localeSwitcher}
            {props.topbarActions}
          </div>
        </header>

        <main className="console-content">{props.children}</main>
      </div>
    </div>
  );
}
