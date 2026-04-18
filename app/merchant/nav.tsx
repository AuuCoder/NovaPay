"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AdminNavLink } from "@/app/admin/ui";

export interface MerchantNavItem {
  href: string;
  label: string;
  detail: string;
  matchPaths?: string[];
  children?: MerchantNavItem[];
}

function isPathActive(pathname: string, item: MerchantNavItem) {
  const directMatch = item.children
    ? pathname === item.href
    : pathname === item.href || pathname.startsWith(`${item.href}/`);
  const extraMatch = (item.matchPaths ?? []).some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );

  return directMatch || extraMatch;
}

export function MerchantNav({ items }: { items: MerchantNavItem[] }) {
  const pathname = usePathname();

  return (
    <div className="space-y-3">
      {items.map((item) => (
        <div key={item.href}>
          <AdminNavLink
            href={item.href}
            label={item.label}
            detail={item.detail}
            active={isPathActive(pathname, item)}
          />
          {item.children && isPathActive(pathname, item) ? (
            <div className="ml-4 mt-3 space-y-2 border-l border-white/10 pl-3">
              {item.children.map((child) => {
                const childActive = isPathActive(pathname, child);
                return (
                  <Link
                    key={child.href}
                    href={child.href}
                    className={`block rounded-xl px-3 py-2 text-sm transition ${
                      childActive
                        ? "bg-white/12 text-white"
                        : "text-[#dac7b3] hover:bg-white/8 hover:text-white"
                    }`}
                  >
                    <p className="font-medium">{child.label}</p>
                    <p
                      className={`mt-1 text-xs leading-5 ${
                        childActive ? "text-white/80" : "text-[#c9b6a1]"
                      }`}
                    >
                      {child.detail}
                    </p>
                  </Link>
                );
              })}
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}
