"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/market-iq/launch", label: "Launch", advisory: true, match: (path: string) => path.startsWith("/market-iq/launch") },
  { href: "/market-iq", label: "Market", advisory: false, match: (path: string) => path === "/market-iq" },
  { href: "/market-iq/review", label: "Review inbox", advisory: true, match: (path: string) => path.startsWith("/market-iq/review") },
  { href: "/market-iq/editions", label: "Editions", advisory: true, match: (path: string) => path.startsWith("/market-iq/editions") || path.startsWith("/market-iq/report") },
  { href: "/market-iq/distribution", label: "Distribution", advisory: true, match: (path: string) => path.startsWith("/market-iq/distribution") },
  { href: "/market-iq/get-started", label: "Setup", advisory: false, match: (path: string) => path.startsWith("/market-iq/get-started") },
] as const;

export function MarketIqWorkspaceNav({ clientAdvisoryEnabled = true }: { clientAdvisoryEnabled?: boolean }) {
  const pathname = usePathname() ?? "";

  return (
    <nav aria-label="Market IQ workspace" className="mb-7 border-b border-grid pb-3">
      <div className="flex flex-wrap items-center gap-1">
        <p className="mr-2 shrink-0 text-[10px] font-bold uppercase tracking-[0.14em] text-teal-700">
          Market IQ
        </p>
        {ITEMS.map((item) => {
          const active = item.match(pathname);
          const locked = item.advisory && !clientAdvisoryEnabled;
          return (
            <Link
              key={item.href}
              href={locked ? "/market-iq/subscribe?upgrade=client_advisory" : item.href}
              aria-current={active ? "page" : undefined}
              className={active
                ? "rounded-md bg-navy px-3 py-2 text-sm font-semibold text-white"
                : "rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-surface-soft hover:text-navy"}
            >
              {item.label}{locked ? " · Upgrade" : ""}
            </Link>
          );
        })}
        <span className="ml-auto hidden shrink-0 rounded-full bg-orange-soft px-3 py-1 text-[10px] font-bold uppercase tracking-[0.1em] text-orange-700 sm:inline-flex">
          Isolated preview
        </span>
      </div>
    </nav>
  );
}
