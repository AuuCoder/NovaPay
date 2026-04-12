"use client";

import { usePathname } from "next/navigation";
import { AdminNavLink } from "@/app/admin/ui";

export interface AdminNavItem {
  href: string;
  label: string;
  detail: string;
}

export function AdminNav({ items }: { items: AdminNavItem[] }) {
  const pathname = usePathname();

  return (
    <div className="space-y-3">
      {items.map((item) => (
        <AdminNavLink
          key={item.href}
          href={item.href}
          label={item.label}
          detail={item.detail}
          active={pathname === item.href || pathname.startsWith(`${item.href}/`)}
        />
      ))}
    </div>
  );
}
