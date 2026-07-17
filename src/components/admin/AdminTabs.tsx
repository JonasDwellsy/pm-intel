"use client";

// v0.21 — Admin panel tab nav.
//
// Client component so we can use usePathname() for the active-tab
// highlight. The link list is hard-coded — three or four entries
// at peak, no need for config-driven generation.

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/admin/markets", label: "Markets" },
  { href: "/admin/organizations", label: "Organizations" },
  { href: "/admin/usage", label: "Usage" },
  { href: "/admin/merges", label: "Merges" },
  { href: "/admin/names", label: "Names" },
  { href: "/admin/exclusions", label: "Exclusions" },
  { href: "/admin/settings", label: "Settings" },
] as const;

export function AdminTabs() {
  const pathname = usePathname() ?? "";
  return (
    <nav className="border-b border-grid">
      <ul className="flex gap-1">
        {TABS.map((tab) => {
          const isActive =
            pathname === tab.href || pathname.startsWith(`${tab.href}/`);
          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                className={
                  isActive
                    ? "inline-block px-4 py-2 text-[14px] font-semibold text-navy border-b-2 border-navy -mb-px"
                    : "inline-block px-4 py-2 text-[14px] font-medium text-grey-600 hover:text-navy border-b-2 border-transparent -mb-px"
                }
              >
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
