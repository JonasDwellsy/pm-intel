"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  MARKET_IQ_CLIENT_REPORTING_ROUTES,
  MARKET_IQ_MARKET_INTELLIGENCE_ROUTES,
  marketIqClientReportingTab,
  marketIqProductArea,
} from "@/lib/market-iq/navigation";

const MARKET_INTELLIGENCE_ITEMS = [
  { id: "daily", href: MARKET_IQ_MARKET_INTELLIGENCE_ROUTES.daily, label: "Daily edition" },
  { id: "alerts", href: MARKET_IQ_MARKET_INTELLIGENCE_ROUTES.alerts, label: "Alerts" },
  { id: "overview", href: MARKET_IQ_MARKET_INTELLIGENCE_ROUTES.overview, label: "Market overview" },
] as const;

const CLIENT_REPORTING_ITEMS = [
  { id: "overview", href: MARKET_IQ_CLIENT_REPORTING_ROUTES.overview, label: "Overview" },
  { id: "reports", href: MARKET_IQ_CLIENT_REPORTING_ROUTES.reports, label: "Reports" },
  { id: "recipients", href: MARKET_IQ_CLIENT_REPORTING_ROUTES.recipients, label: "Recipients" },
  { id: "delivery", href: MARKET_IQ_CLIENT_REPORTING_ROUTES.delivery, label: "Delivery" },
  { id: "performance", href: MARKET_IQ_CLIENT_REPORTING_ROUTES.performance, label: "Performance" },
] as const;

export function MarketIqSectionNavigation() {
  const pathname = usePathname() ?? "";
  const area = marketIqProductArea(pathname);
  const [openAlertCount, setOpenAlertCount] = useState<number | null>(null);
  useEffect(() => {
    if (area !== "market-intelligence" || typeof fetch !== "function") return;
    const controller = new AbortController();
    void fetch("/api/market-iq/alerts/count", { signal: controller.signal })
      .then((response) => response.ok ? response.json() : null)
      .then((value: { count?: unknown } | null) => {
        if (typeof value?.count === "number") setOpenAlertCount(value.count);
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [area]);
  if (area !== "market-intelligence" && area !== "client-reporting") return null;

  const items = area === "market-intelligence" ? MARKET_INTELLIGENCE_ITEMS : CLIENT_REPORTING_ITEMS;
  const activeId = area === "market-intelligence"
    ? pathname.startsWith("/market-iq/daily") || pathname.startsWith("/market-iq/competitive-sets") ? "daily" : pathname.startsWith("/market-iq/alerts") ? "alerts" : "overview"
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
              {item.label}{item.id === "alerts" && openAlertCount !== null && <span className={`ml-2 rounded-full px-2 py-0.5 text-[10px] font-bold ${active ? "bg-white/20 text-white" : "bg-violet-100 text-violet-800"}`}>{openAlertCount > 999 ? "999+" : openAlertCount}</span>}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
