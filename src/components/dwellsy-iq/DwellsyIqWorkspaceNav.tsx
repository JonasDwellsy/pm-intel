"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const workspaceItems = [
  { href: "/today", label: "Today", match: (path: string) => path === "/today" },
  { href: "/portfolio-iq", label: "My Portfolio", match: (path: string) => path === "/portfolio-iq" },
  { href: "/market-iq", label: "Markets", match: (path: string) => path.startsWith("/market-iq") },
  { href: "/portfolio-iq#properties", label: "Properties & Comps", match: (path: string) => path.startsWith("/portfolio-iq/properties") },
  { href: "/property-managers", label: "Operators", match: (path: string) => path.startsWith("/property-managers") || path.startsWith("/operators") },
  { href: "/watch-lists", label: "Watchlists", match: (path: string) => path.startsWith("/watch-lists") },
  { href: "/today#briefing", label: "Reports", match: () => false },
] as const;

export function DwellsyIqWorkspaceNav() {
  const pathname = usePathname() ?? "";

  return (
    <nav aria-label="Dwellsy IQ Online workspace" className="mb-8 border-b border-grid pb-4">
      <div className="flex items-center gap-3">
        <p className="shrink-0 text-[10px] font-bold uppercase tracking-[0.14em] text-teal-700">
          Dwellsy IQ Online
        </p>
        <span className="h-4 w-px bg-grid" aria-hidden />
        <div className="min-w-0 flex-1 overflow-x-auto">
          <div className="flex min-w-max items-center gap-1">
            {workspaceItems.map((item) => {
              const active = item.match(pathname);
              return (
                <Link
                  key={item.label}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={active
                    ? "rounded-md bg-navy px-3 py-2 text-sm font-semibold text-white"
                    : "rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-surface-soft hover:text-navy"}
                >
                  {item.label}
                </Link>
              );
            })}
          </div>
        </div>
        <span className="hidden shrink-0 rounded-full bg-orange-soft px-3 py-1 text-[10px] font-bold uppercase tracking-[0.1em] text-orange-700 sm:inline-flex">
          Internal preview
        </span>
      </div>
    </nav>
  );
}
