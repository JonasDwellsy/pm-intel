"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { marketIqClientReportingTab, marketIqProductArea } from "@/lib/market-iq/navigation";

const MARKET_INTELLIGENCE_ITEMS = [
  { id: "overview", href: "/market-iq/market", label: "Market overview" },
  { id: "briefing", href: "/market-iq/briefing", label: "Weekly briefing" },
] as const;

const CLIENT_REPORTING_ITEMS = [
  { id: "overview", href: "/market-iq/client-reporting", label: "Overview" },
  { id: "reports", href: "/market-iq/editions", label: "Reports" },
  { id: "recipients", href: "/market-iq/distribution", label: "Recipients" },
  { id: "delivery", href: "/market-iq/sharing", label: "Delivery" },
  { id: "performance", href: "/market-iq/performance", label: "Performance" },
] as const;

export function MarketIqSectionNavigation() {
  const pathname = usePathname() ?? "";
  const area = marketIqProductArea(pathname);
  if (area !== "market-intelligence" && area !== "client-reporting") return null;

  const items = area === "market-intelligence" ? MARKET_INTELLIGENCE_ITEMS : CLIENT_REPORTING_ITEMS;
  const activeId = area === "market-intelligence"
    ? pathname.startsWith("/market-iq/briefing") ? "briefing" : "overview"
    : marketIqClientReportingTab(pathname);

  return (
    <div className="border-b border-grid bg-white">
      <nav aria-label={area === "market-intelligence" ? "Market intelligence" : "Client reporting"} className="mx-auto flex min-h-12 max-w-[1440px] items-center gap-1 overflow-x-auto px-5 sm:px-7 lg:px-10">
        {items.map((item) => {
          const active = activeId === item.id;
          return (
            <Link
              key={item.id}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={active
                ? "whitespace-nowrap border-b-2 border-navy px-3 py-3 text-sm font-semibold text-navy"
                : "whitespace-nowrap border-b-2 border-transparent px-3 py-3 text-sm font-medium text-slate-500 hover:text-navy"}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
