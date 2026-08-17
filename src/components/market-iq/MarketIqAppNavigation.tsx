"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const PRIMARY_ITEMS = [
  { href: "/market-iq", label: "Home", match: (path: string) => path === "/market-iq" },
  { href: "/market-iq/market", label: "Market", match: (path: string) => path.startsWith("/market-iq/market") },
  { href: "/market-iq/market#local-areas", label: "Local areas", match: () => false },
  { href: "/market-iq/editions", label: "Editions", match: (path: string) => path.startsWith("/market-iq/editions") || path.startsWith("/market-iq/review") || path.startsWith("/market-iq/report") },
  { href: "/market-iq/distribution", label: "Clients", match: (path: string) => path.startsWith("/market-iq/distribution") },
] as const;

export function MarketIqAppNavigation() {
  const pathname = usePathname() ?? "";

  return (
    <>
      <nav aria-label="Market IQ" className="hidden items-center gap-1 lg:flex">
        {PRIMARY_ITEMS.map((item) => {
          const active = item.match(pathname);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={active
                ? "rounded-md bg-navy px-3 py-2 text-[13px] font-semibold text-white"
                : "rounded-md px-3 py-2 text-[13px] font-medium text-navy transition-colors hover:bg-surface-soft hover:text-teal-700"}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>

      <details className="relative lg:hidden">
        <summary className="flex h-10 w-10 cursor-pointer list-none items-center justify-center rounded-md border border-grid text-navy marker:content-none">
          <span className="sr-only">Open Market IQ navigation</span>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
            <path d="M4 7h16M4 12h16M4 17h16" />
          </svg>
        </summary>
        <nav aria-label="Market IQ mobile" className="absolute right-0 top-12 z-50 w-64 rounded-xl border border-grid bg-white p-2 shadow-xl">
          {PRIMARY_ITEMS.map((item) => {
            const active = item.match(pathname);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={active
                  ? "block rounded-md bg-navy px-4 py-3 text-sm font-semibold text-white"
                  : "block rounded-md px-4 py-3 text-sm font-medium text-navy hover:bg-surface-soft"}
              >
                {item.label}
              </Link>
            );
          })}
          <div className="my-2 border-t border-grid" />
          <Link href="/market-iq/get-started" className="block rounded-md px-4 py-3 text-sm font-medium text-navy hover:bg-surface-soft">Workspace setup</Link>
          <Link href="/market-iq/subscribe" className="block rounded-md px-4 py-3 text-sm font-medium text-navy hover:bg-surface-soft">Plan and billing</Link>
        </nav>
      </details>
    </>
  );
}
