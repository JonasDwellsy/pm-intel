"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const portfolioItems = [
  { href: "/portfolio-iq", label: "Overview", match: (path: string) => path === "/portfolio-iq" },
  { href: "/portfolio-iq/team", label: "Work queue", match: (path: string) => path.startsWith("/portfolio-iq/team") },
  { href: "/portfolio-iq/changes", label: "Changes", match: (path: string) => path.startsWith("/portfolio-iq/changes") },
  { href: "/portfolio-iq/financial-impact", label: "Financial impact", match: (path: string) => path.startsWith("/portfolio-iq/financial-impact") },
  { href: "/portfolio-iq/outcomes", label: "Outcomes", match: (path: string) => path.startsWith("/portfolio-iq/outcomes") },
] as const;

const moreItems = [
  { href: "/portfolio-iq/acceptance", label: "Launch acceptance" },
  { href: "/portfolio-iq/launch-briefing", label: "Launch briefing" },
  { href: "/portfolio-iq/collaboration", label: "Collaboration" },
  { href: "/onboarding", label: "Portfolio setup" },
] as const;

/**
 * Contextual navigation within Portfolio. Global product destinations now live
 * in the main header, so this component deliberately renders nothing on Today,
 * Markets, Watchlists, Reports, and Setup pages.
 */
export function DwellsyIqWorkspaceNav() {
  const pathname = usePathname() ?? "";
  const isPortfolioContext = pathname.startsWith("/portfolio-iq")
    && !pathname.startsWith("/portfolio-iq/watchlists")
    && !pathname.startsWith("/portfolio-iq/reports");

  if (!isPortfolioContext) return null;

  const moreActive = moreItems.some((item) => pathname.startsWith(item.href));

  return (
    <nav aria-label="Portfolio workspace" className="mb-8 border-b border-grid pb-3">
      <div className="flex flex-wrap items-center gap-1">
        <p className="mr-2 shrink-0 text-[10px] font-bold uppercase tracking-[0.14em] text-teal-700">
          Portfolio
        </p>
        {portfolioItems.map((item) => {
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
        <details className="group relative">
          <summary
            className={moreActive
              ? "cursor-pointer list-none rounded-md bg-navy px-3 py-2 text-sm font-semibold text-white marker:content-none"
              : "cursor-pointer list-none rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-surface-soft hover:text-navy marker:content-none"}
          >
            More <span aria-hidden className="ml-1 text-[10px]">▾</span>
          </summary>
          <div className="absolute right-0 top-full z-30 mt-2 min-w-[190px] overflow-hidden rounded-md border border-grid bg-white py-1 shadow-lg">
            {moreItems.map((item) => (
              <Link key={item.href} href={item.href} className="block px-4 py-2.5 text-sm font-medium text-navy transition-colors hover:bg-surface-soft">
                {item.label}
              </Link>
            ))}
          </div>
        </details>
        <span className="ml-auto hidden shrink-0 rounded-full bg-orange-soft px-3 py-1 text-[10px] font-bold uppercase tracking-[0.1em] text-orange-700 sm:inline-flex">
          Internal preview
        </span>
      </div>
    </nav>
  );
}
