import Link from "next/link";
import type { MarketIqMarketDefinition } from "@/data/market-iq/markets";

export function MarketIqMarketSelector({
  markets,
  activeMarketId,
}: {
  markets: readonly MarketIqMarketDefinition[];
  activeMarketId: string;
}) {
  if (markets.length < 2) return null;

  return (
    <section aria-label="Choose a market" className="mb-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">Your markets</p>
          <p className="mt-1 text-sm text-slate-600">Switch the market used by this intelligence view.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {markets.map((market) => {
            const active = market.id === activeMarketId;
            return (
              <Link
                key={market.id}
                href={`/market-iq/market?market=${encodeURIComponent(market.id)}`}
                aria-current={active ? "page" : undefined}
                className={active
                  ? "rounded-full bg-navy px-4 py-2 text-sm font-semibold text-white"
                  : "rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-navy hover:border-teal-300 hover:text-teal-800"}
              >
                {market.shortLabel}
                {market.status === "preparing" ? <span className="ml-2 text-[10px] font-bold uppercase tracking-wider opacity-60">Next</span> : null}
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}

