import { buildDailyEventHeadlines, type MarketIqDailyEventHeadline } from "@/lib/market-iq/daily-events";
import type { MarketIqMarketActivityAvailability } from "@/lib/market-iq/listing-events";

const MAX_HEADLINES_PER_SECTION = 6;

function dateTime(value: string, timeZone: string) {
  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone,
    timeZoneName: "short",
  });
}

function Headline({ headline, timeZone }: { headline: MarketIqDailyEventHeadline; timeZone: string }) {
  const timeLabel = headline.event.eventType === "aging_threshold" ? "Crossed" : "Observed";
  const content = <>
    <div className="flex flex-wrap items-start justify-between gap-2">
      <h3 className="max-w-xl text-sm font-semibold leading-5 text-[var(--report-primary)]">{headline.headline}</h3>
      <time dateTime={headline.observedAt} className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400">
        {timeLabel} {dateTime(headline.observedAt, timeZone)}
      </time>
    </div>
    <p className="mt-1.5 text-xs leading-5 text-slate-500">{headline.detail}</p>
  </>;

  return <article className="border-b border-slate-100 py-4 first:pt-0 last:border-0 last:pb-0">
    {headline.event.listingUrl
      ? <a href={headline.event.listingUrl} target="_blank" rel="noreferrer" className="block rounded-md outline-none focus-visible:ring-2 focus-visible:ring-teal-600">{content}</a>
      : content}
  </article>;
}

function DailySection({
  title,
  description,
  emptyMessage,
  headlines,
  timeZone,
}: {
  title: string;
  description: string;
  emptyMessage: string;
  headlines: MarketIqDailyEventHeadline[];
  timeZone: string;
}) {
  const visible = headlines.slice(0, MAX_HEADLINES_PER_SECTION);
  return <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_12px_35px_rgba(15,23,42,0.04)]" aria-label={title}>
    <div className="border-b border-slate-100 pb-4">
      <div className="flex items-start justify-between gap-4">
        <div><h2 className="text-xl font-semibold text-[var(--report-primary)]">{title}</h2><p className="mt-1 text-xs leading-5 text-slate-500">{description}</p></div>
        <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">{headlines.length}</span>
      </div>
    </div>
    <div className="pt-4">
      {visible.length
        ? visible.map((headline) => <Headline key={headline.id} headline={headline} timeZone={timeZone} />)
        : <p className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm leading-6 text-slate-500">{emptyMessage}</p>}
    </div>
    {headlines.length > visible.length && <p className="mt-4 text-xs text-slate-400">Showing the latest {visible.length} of {headlines.length} observed events.</p>}
  </section>;
}

export function MarketIqDailyEvents({
  availability,
  marketName = "the market",
  timeZone = "America/New_York",
}: {
  availability: MarketIqMarketActivityAvailability;
  marketName?: string;
  timeZone?: string;
}) {
  if (availability.state === "unavailable") {
    return <section className="rounded-2xl border border-amber-200 bg-amber-50 px-6 py-7" aria-label={`Daily ${marketName} listing events unavailable`}>
      <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-amber-800">Daily listing events</p>
      <h2 className="mt-2 text-xl font-semibold text-[var(--report-primary)]">No events were observed for the period.</h2>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">The listing-event source read was unavailable. No monthly trend, seeded example, or other substitute has been placed in these daily sections.</p>
      <p className="mt-3 text-xs text-slate-500">Read attempted {dateTime(availability.attemptedAt, timeZone)}.</p>
    </section>;
  }

  const headlines = buildDailyEventHeadlines(availability.activity.events);
  const newListings = headlines.filter((headline) => headline.section === "new_to_market");
  const rentChanges = headlines.filter((headline) => headline.section === "rent_changes");
  const delistings = headlines.filter((headline) => headline.section === "off_market");
  const agingWatch = headlines.filter((headline) => headline.section === "aging_watch");

  return <section aria-label={`Daily ${marketName} listing events`}>
    <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
      <div><p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--report-accent)]">Daily edition</p><h2 className="mt-1 text-2xl font-semibold text-[var(--report-primary)]">What changed in {marketName}</h2></div>
      <p className="text-xs text-slate-500">Source current through {dateTime(availability.activity.asOf, timeZone)}</p>
    </div>
    <div className="grid gap-4 lg:grid-cols-2">
      <DailySection title="New to market" description="Listings first observed in the current source window." emptyMessage="No new listings were observed for the period." headlines={newListings} timeZone={timeZone} />
      <DailySection title="Rent changes" description="Confirmed changes in advertised asking rent." emptyMessage="No confirmed asking-rent changes were observed for the period." headlines={rentChanges} timeZone={timeZone} />
      <DailySection title="Off the market" description="Leased or withdrawn, undetermined. These listings were observed leaving the market." emptyMessage="No listings were observed leaving the market for the period." headlines={delistings} timeZone={timeZone} />
      <DailySection title="The aging watch" description="Listings crossing 30, 60, or 90 days while still active. Live age, not days on market." emptyMessage="No active listings crossed an aging threshold for the period." headlines={agingWatch} timeZone={timeZone} />
    </div>
  </section>;
}
