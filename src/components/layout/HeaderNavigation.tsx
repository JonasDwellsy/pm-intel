"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { SearchInput } from "@/components/search/SearchInput";
import { useSearchOverlay } from "@/components/search/SearchOverlay";
import { NAV_ITEMS, OWNER_NAV_ITEMS, type NavItem } from "@/lib/nav";

function ownerItemIsActive(pathname: string, item: NavItem): boolean {
  if (item.href === "/today") return pathname === "/today" || pathname.startsWith("/today/");
  if (item.label === "Properties") return pathname.startsWith("/portfolio-iq/properties");
  if (item.label === "Watchlists") return pathname.startsWith("/portfolio-iq/watchlists");
  if (item.label === "Reports") return pathname.startsWith("/portfolio-iq/reports");
  if (item.href === "/portfolio-iq") {
    return pathname.startsWith("/portfolio-iq")
      && !pathname.startsWith("/portfolio-iq/properties")
      && !pathname.startsWith("/portfolio-iq/watchlists")
      && !pathname.startsWith("/portfolio-iq/reports");
  }
  if (item.href === "/market-iq") return pathname.startsWith("/market-iq");
  if (item.href === "/property-managers") {
    return pathname.startsWith("/property-managers") || pathname.startsWith("/operators");
  }
  return pathname === item.href;
}

function SearchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-3.5-3.5" />
    </svg>
  );
}

export function HeaderNavigation({ ownerMode }: { ownerMode: boolean }) {
  const pathname = usePathname() ?? "";
  const { open: openSearch } = useSearchOverlay();
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!ownerMode) return;
    let active = true;
    fetch("/api/portfolio-iq/watch-activity/count", { cache: "no-store" })
      .then((response) => response.ok ? response.json() as Promise<{ count?: number }> : { count: 0 })
      .then((result) => { if (active) setUnreadCount(Math.max(0, result.count ?? 0)); })
      .catch(() => { if (active) setUnreadCount(0); });
    return () => { active = false; };
  }, [ownerMode]);

  if (!ownerMode) {
    return (
      <div className="hidden items-center gap-5 lg:flex">
        {NAV_ITEMS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="inline-flex items-center gap-1.5 whitespace-nowrap text-sm font-medium text-navy transition-colors hover:text-teal"
          >
            {item.label}
            {item.badge && <span aria-hidden className="inline-flex h-4 items-center rounded-sm bg-teal px-1 text-[9px] font-bold uppercase tracking-[0.06em] text-white">{item.badge}</span>}
          </Link>
        ))}
        <SearchInput />
      </div>
    );
  }

  return (
    <div className="hidden items-center gap-1 xl:flex">
      {OWNER_NAV_ITEMS.map((item) => {
        const active = ownerItemIsActive(pathname, item);
        return (
          <Link
            key={item.label}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={active
              ? "rounded-md bg-navy px-2.5 py-2 text-[13px] font-semibold text-white"
              : "rounded-md px-2.5 py-2 text-[13px] font-medium text-navy transition-colors hover:bg-surface-soft hover:text-teal"}
          >
            {item.label}
            {item.label === "Today" && unreadCount > 0 && (
              <span className={active
                ? "ml-1.5 rounded-full bg-orange-500 px-1.5 py-0.5 text-[10px] font-bold text-white"
                : "ml-1.5 rounded-full bg-orange-soft px-1.5 py-0.5 text-[10px] font-bold text-orange-700"}
              >
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            )}
          </Link>
        );
      })}
      <span className="mx-1.5 h-5 w-px bg-grid" aria-hidden />
      <button
        type="button"
        onClick={openSearch}
        aria-label="Search Dwellsy IQ"
        className="inline-flex h-9 items-center gap-2 rounded-md px-2.5 text-[13px] font-medium text-navy transition-colors hover:bg-surface-soft"
      >
        <SearchIcon />
        <span className="hidden 2xl:inline">Search</span>
      </button>
      <Link href="/ask" className="inline-flex h-9 items-center rounded-md px-2.5 text-[13px] font-semibold text-teal-700 transition-colors hover:bg-teal-soft">
        Ask IQ
      </Link>
    </div>
  );
}
