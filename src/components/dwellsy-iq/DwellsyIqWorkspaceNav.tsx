"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const workspaceItems = [
  { href: "/today", label: "Today", match: (path: string) => path === "/today" },
  { href: "/portfolio-iq/team", label: "My Work", match: (path: string) => path.startsWith("/portfolio-iq/team") },
  { href: "/portfolio-iq", label: "My Portfolio", match: (path: string) => path === "/portfolio-iq" },
  { href: "/portfolio-iq/launch-briefing", label: "Launch Briefing", match: (path: string) => path.startsWith("/portfolio-iq/launch-briefing") },
  { href: "/portfolio-iq/changes", label: "Changes", match: (path: string) => path.startsWith("/portfolio-iq/changes") },
  { href: "/portfolio-iq/collaboration", label: "Collaboration", match: (path: string) => path.startsWith("/portfolio-iq/collaboration") },
  { href: "/portfolio-iq/financial-impact", label: "Financial Impact", match: (path: string) => path.startsWith("/portfolio-iq/financial-impact") },
  { href: "/portfolio-iq/outcomes", label: "Outcomes", match: (path: string) => path.startsWith("/portfolio-iq/outcomes") },
  { href: "/onboarding", label: "Setup", match: (path: string) => path.startsWith("/onboarding") },
  { href: "/market-iq", label: "Markets", match: (path: string) => path.startsWith("/market-iq") },
  { href: "/portfolio-iq#properties", label: "Properties & Comps", match: (path: string) => path.startsWith("/portfolio-iq/properties") },
  { href: "/property-managers", label: "Operators", match: (path: string) => path.startsWith("/property-managers") || path.startsWith("/operators") },
  { href: "/portfolio-iq/watchlists", label: "Watchlists", match: (path: string) => path.startsWith("/portfolio-iq/watchlists") },
  { href: "/portfolio-iq/reports", label: "Reports", match: (path: string) => path.startsWith("/portfolio-iq/reports") },
] as const;

export function DwellsyIqWorkspaceNav() {
  const pathname = usePathname() ?? "";
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    let active = true;
    fetch("/api/portfolio-iq/watch-activity/count", { cache: "no-store" })
      .then((response) => response.ok ? response.json() as Promise<{ count?: number }> : { count: 0 })
      .then((result) => { if (active) setUnreadCount(Math.max(0, result.count ?? 0)); })
      .catch(() => { if (active) setUnreadCount(0); });
    return () => { active = false; };
  }, []);

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
                  {item.label === "Today" && unreadCount > 0 && <span className="ml-1.5 rounded-full bg-orange-500 px-1.5 py-0.5 text-[10px] font-bold text-white">{unreadCount > 99 ? "99+" : unreadCount}</span>}
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
