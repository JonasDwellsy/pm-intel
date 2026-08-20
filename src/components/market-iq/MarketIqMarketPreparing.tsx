import Link from "next/link";
import type { MarketIqMarketDefinition } from "@/data/market-iq/markets";

export function MarketIqMarketPreparing({
  market,
  state = "preparing",
}: {
  market: MarketIqMarketDefinition;
  state?: "preparing" | "source_unavailable";
}) {
  const sourceUnavailable = state === "source_unavailable";
  return (
    <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      <div className="grid gap-8 p-7 sm:p-10 lg:grid-cols-[1fr_360px] lg:items-end lg:p-12">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-teal-700">
            {sourceUnavailable ? "Market data refresh" : "Market foundation"}
          </p>
          <h1 className="mt-3 text-4xl font-bold tracking-tight text-navy sm:text-5xl">{market.name}</h1>
          <p className="mt-5 max-w-3xl text-lg leading-8 text-slate-600">
            {sourceUnavailable
              ? "A verified saved market read is not available. Nothing has been substituted. Please try this market again after the source refresh completes."
              : "This market is registered and ready for its intelligence adapter. Trends coverage has been confirmed, but the city, ZIP, map, and narrative layers have not yet passed Market IQ review."}
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link href={`/market-iq/market?market=${market.id}`} className="rounded-md bg-navy px-5 py-3 text-sm font-semibold text-white">
              {sourceUnavailable ? "Try again" : "Return to market intelligence"}
            </Link>
            <Link href="/market-iq/account" className="rounded-md border border-navy bg-white px-5 py-3 text-sm font-semibold text-navy">View market access</Link>
          </div>
        </div>
        <aside className="rounded-2xl bg-slate-50 p-6">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">Analytical boundary</p>
          <dl className="mt-4 space-y-4 text-sm">
            <div><dt className="text-slate-500">CBSA</dt><dd className="mt-1 font-semibold text-navy">{market.cbsaCode}</dd></div>
            <div><dt className="text-slate-500">Market</dt><dd className="mt-1 font-semibold text-navy">{market.fullName}</dd></div>
            <div>
              <dt className="text-slate-500">Status</dt>
              <dd className="mt-1 font-semibold text-navy">
                {sourceUnavailable ? "Waiting for a verified saved Trends read" : "Geography and segment review"}
              </dd>
            </div>
          </dl>
        </aside>
      </div>
    </section>
  );
}
