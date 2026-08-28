"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MARKET_IQ_CANONICAL_ROUTES, marketIqProductArea } from "@/lib/market-iq/navigation";
import { marketIqSignInPath } from "@/lib/market-iq/entry";

const INTELLIGENCE_ITEMS = [
  { href: MARKET_IQ_CANONICAL_ROUTES.home, label: "Home", area: "home" },
  { href: MARKET_IQ_CANONICAL_ROUTES.marketIntelligence, label: "Market intelligence", area: "market-intelligence" },
] as const;

const ADVISORY_ITEMS = [
  { href: MARKET_IQ_CANONICAL_ROUTES.clientReporting, label: "Client reporting", area: "client-reporting" },
] as const;

const INTERNAL_ITEMS = [
  { href: "/market-iq/internal/admin", label: "Admin overview", area: null },
  { href: "/market-iq/internal/readiness", label: "Operations readiness", area: null },
  { href: "/market-iq/internal/data-operations", label: "Data loading", area: null },
  { href: "/market-iq/internal/pilot-telemetry", label: "Pilot telemetry", area: null },
] as const;

const PUBLIC_ITEMS = [
  { href: "/market-iq/welcome#product", label: "Product" },
  { href: "/market-iq/welcome#workflow", label: "How it works" },
  { href: "/market-iq/welcome#plans", label: "Plans" },
  { href: "/reports/market/preview-cleveland-market-read", label: "Cleveland example" },
] as const;

export function MarketIqAppNavigation({ signedIn, hasProduct, clientAdvisoryEnabled }: { signedIn: boolean; hasProduct: boolean; clientAdvisoryEnabled: boolean }) {
  const pathname = usePathname() ?? "";
  const currentArea = marketIqProductArea(pathname);
  const internal = pathname.startsWith("/market-iq/internal/");
  const items = internal
    ? INTERNAL_ITEMS
    : signedIn && hasProduct
      ? [...INTELLIGENCE_ITEMS, ...(clientAdvisoryEnabled ? ADVISORY_ITEMS : [])]
      : signedIn
        ? [{ href: "/market-iq/subscribe", label: "Plans", area: null }]
        : PUBLIC_ITEMS.map((item) => ({ ...item, area: null }));

  return (
    <>
      <nav aria-label={internal ? "Market IQ administration" : "Market IQ"} className="hidden items-center gap-1 lg:flex">
        {items.map((item) => {
          const active = item.area ? currentArea === item.area : pathname.startsWith(item.href);
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
        <nav aria-label={internal ? "Market IQ administration mobile" : "Market IQ mobile"} className="absolute right-0 top-12 z-50 w-64 rounded-xl border border-grid bg-white p-2 shadow-xl">
          {items.map((item) => {
            const active = item.area ? currentArea === item.area : pathname.startsWith(item.href);
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
          {signedIn ? <><div className="my-2 border-t border-grid" />{hasProduct && <Link href="/market-iq/get-started" className="block rounded-md px-4 py-3 text-sm font-medium text-navy hover:bg-surface-soft">Workspace setup</Link>}{hasProduct ? <Link href="/market-iq/account" className="block rounded-md px-4 py-3 text-sm font-medium text-navy hover:bg-surface-soft">Account and billing</Link> : <Link href="/market-iq/subscribe" className="block rounded-md px-4 py-3 text-sm font-medium text-navy hover:bg-surface-soft">Plans</Link>}</> : <><div className="my-2 border-t border-grid" /><Link href={marketIqSignInPath()} className="block rounded-md bg-navy px-4 py-3 text-sm font-semibold text-white">Customer sign in</Link></>}
        </nav>
      </details>
    </>
  );
}
