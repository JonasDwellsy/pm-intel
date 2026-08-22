import Link from "next/link";

import type { MarketIqDailyEdition } from "@/lib/market-iq/daily-edition-archive";
import { MARKET_IQ_MARKET_INTELLIGENCE_ROUTES } from "@/lib/market-iq/navigation";

type EditionLink = MarketIqDailyEdition<unknown>;

function editionHref(marketId: string, editionId?: string) {
  const params = new URLSearchParams({ market: marketId });
  if (editionId) params.set("edition", editionId);
  return `${MARKET_IQ_MARKET_INTELLIGENCE_ROUTES.daily}?${params.toString()}`;
}

function editionLabel(edition: EditionLink, timeZone: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    month: "short",
    day: "numeric",
  }).format(new Date(edition.observedAt));
}

export function MarketIqDailyEditionArchive({
  marketId,
  current,
  latest,
  previous,
  next,
  recent,
  timeZone,
}: {
  marketId: string;
  current: EditionLink;
  latest: EditionLink;
  previous: EditionLink | null;
  next: EditionLink | null;
  recent: EditionLink[];
  timeZone: string;
}) {
  const isLatest = current.id === latest.id;

  return (
    <section aria-label="Daily edition archive" className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-4 sm:px-6">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">Edition archive</p>
          <p className="mt-1 text-sm font-semibold text-navy">
            {isLatest ? "Latest saved edition" : `Archived edition · ${editionLabel(current, timeZone)}`}
          </p>
        </div>
        <nav aria-label="Previous and next daily editions" className="flex flex-wrap items-center gap-2">
          {previous
            ? <Link href={editionHref(marketId, previous.id)} className="rounded-md border border-slate-300 px-3 py-2 text-xs font-semibold text-navy hover:border-teal-500 hover:text-teal-800">← Previous day</Link>
            : <span className="rounded-md border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-300">← Previous day</span>}
          {!isLatest && <Link href={editionHref(marketId)} className="rounded-md bg-navy px-3 py-2 text-xs font-semibold text-white">Latest</Link>}
          {next
            ? <Link href={editionHref(marketId, next.id)} className="rounded-md border border-slate-300 px-3 py-2 text-xs font-semibold text-navy hover:border-teal-500 hover:text-teal-800">Next day →</Link>
            : <span className="rounded-md border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-300">Next day →</span>}
        </nav>
      </div>
      <nav aria-label="Recent daily editions" className="flex gap-2 overflow-x-auto border-t border-slate-100 px-5 py-3 sm:px-6">
        {recent.map((edition) => {
          const active = edition.id === current.id;
          return <Link
            key={edition.id}
            href={edition.id === latest.id ? editionHref(marketId) : editionHref(marketId, edition.id)}
            aria-current={active ? "page" : undefined}
            className={active
              ? "shrink-0 rounded-full bg-navy px-3 py-1.5 text-xs font-semibold text-white"
              : "shrink-0 rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-200"}
          >
            {editionLabel(edition, timeZone)}{edition.state === "unavailable" ? " · read unavailable" : ""}
          </Link>;
        })}
      </nav>
    </section>
  );
}

export function MarketIqDailyEditionMissing({ marketId }: { marketId: string }) {
  return (
    <section className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 px-6 py-7" aria-label="Saved daily edition unavailable">
      <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-amber-800">Edition archive</p>
      <h1 className="mt-2 text-2xl font-semibold text-navy">That saved edition is not available.</h1>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">No historical edition has been reconstructed or substituted. Open the latest persisted edition for this market instead.</p>
      <Link href={editionHref(marketId)} className="mt-5 inline-flex rounded-md bg-navy px-4 py-2.5 text-sm font-semibold text-white">Open latest edition</Link>
    </section>
  );
}
