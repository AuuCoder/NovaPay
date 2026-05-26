"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function ConsoleNav(props: {
  links: Array<{ href: string; label: string }>;
}) {
  const pathname = usePathname();

  return (
    <nav className="console-nav">
      {props.links.map((link) => {
        const active =
          pathname === link.href ||
          (link.href !== "/" && pathname.startsWith(`${link.href}/`));

        return (
          <Link
            key={link.href}
            href={link.href}
            className={`console-nav-link ${active ? "console-nav-link-active" : ""}`}
            aria-current={active ? "page" : undefined}
          >
            <span className="console-nav-link-label">{link.label}</span>
            <span className="console-nav-link-indicator" aria-hidden="true" />
          </Link>
        );
      })}
    </nav>
  );
}

export function ConsoleBreadcrumb(props: {
  locale: "zh" | "en";
  labels?: Record<string, string>;
}) {
  const pathname = usePathname();
  const segments = pathname.split("/").filter(Boolean);

  if (segments.length === 0) {
    return null;
  }

  const crumbs = segments.map((segment, index) => {
    const href = `/${segments.slice(0, index + 1).join("/")}`;
    const fallbackLabel = segment
      .replace(/[-_]+/g, " ")
      .replace(/\b\w/g, (part) => part.toUpperCase());
    const label = props.labels?.[segment] ?? fallbackLabel;

    return { href, label };
  });

  return (
    <div className="console-breadcrumb">
      {crumbs.map((crumb, index) => (
        <span key={crumb.href} className="console-breadcrumb-item">
          {index > 0 ? <span className="console-breadcrumb-sep">/</span> : null}
          <Link href={crumb.href}>{crumb.label}</Link>
        </span>
      ))}
    </div>
  );
}
