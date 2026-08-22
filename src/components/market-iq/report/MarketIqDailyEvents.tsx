import type { ReactNode } from "react";
import { MarketIqDailyActivityMap } from "@/components/market-iq/report/MarketIqDailyActivityMap";
import { MarketIqDailyEventExplorer } from "@/components/market-iq/report/MarketIqDailyEventExplorer";
import { MarketIqDailyWatchlists } from "@/components/market-iq/report/MarketIqDailyWatchlists";
import type { MarketIqDailySavedViewFilters } from "@/lib/market-iq/daily-event-explorer";
import { buildDailyEventHeadlines, type MarketIqDailyEventHeadline } from "@/lib/market-iq/daily-events";
import type { MarketIqDailyWatchlistActionResult, MarketIqDailyWatchlistInput, MarketIqDailyWatchlistView } from "@/lib/market-iq/daily-watchlists";
import type { MarketIqLeaseUpAlert, MarketIqListingEvent, MarketIqMarketActivityAvailability } from "@/lib/market-iq/listing-events";

const PRIMARY_EVENT_LIMIT = 4;
const SECONDARY_EVENT_LIMIT = 3;
const DAILY_EVENT_SECTION_IDS = {
  newListings: "daily-new-listings",
  offMarket: "daily-off-market",
  rentMoves: "daily-rent-moves",
  concessions: "daily-concessions",
} as const;

type EventGroup = MarketIqDailyEventHeadline[];

function fullDateTime(value: string, timeZone: string) {
  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone,
    timeZoneName: "short",
  });
}

function timeOnly(value: string, timeZone: string) {
  return new Date(value).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  });
}

function editionDate(value: string, timeZone: string) {
  return new Date(value).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone,
  });
}

function money(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function signedMoney(value: number) {
  const absolute = money(Math.abs(value));
  return `${value > 0 ? "+" : value < 0 ? "−" : ""}${absolute}`;
}

function propertyFacts(event: MarketIqListingEvent) {
  const bedrooms = event.bedrooms === 0 ? "Studio" : `${event.bedrooms} BR`;
  const type = event.propertyType === "house" ? "House" : "Apartment";
  return `${bedrooms} · ${type}`;
}

function eventAddress(event: MarketIqListingEvent) {
  return event.address?.trim() || `ZIP ${event.zip}`;
}

function EventTime({ headline, timeZone }: { headline: MarketIqDailyEventHeadline; timeZone: string }) {
  const verb = headline.event.eventType === "aging_threshold" ? "Crossed" : "Observed";
  return <time
    dateTime={headline.observedAt}
    aria-label={`${verb} ${fullDateTime(headline.observedAt, timeZone)}`}
    title={`${verb} ${fullDateTime(headline.observedAt, timeZone)}`}
    className="shrink-0 text-[11px] font-semibold tabular-nums text-slate-400"
  >
    {timeOnly(headline.observedAt, timeZone)}
  </time>;
}

function EventLink({ event, children }: { event: MarketIqListingEvent; children: ReactNode }) {
  return event.listingUrl
    ? <a href={event.listingUrl} target="_blank" rel="noreferrer" className="block rounded-lg outline-none transition-colors hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-teal-600">{children}</a>
    : <div>{children}</div>;
}

function ListingPhoto({ event, compact = false }: { event: MarketIqListingEvent; compact?: boolean }) {
  const size = compact ? "h-14 w-16" : "h-16 w-20";
  return <div className={`${size} shrink-0 overflow-hidden rounded-xl bg-slate-100 ring-1 ring-inset ring-slate-200`}>
    {event.imageUrl
      // eslint-disable-next-line @next/next/no-img-element -- source listing hosts vary and URLs are validated as HTTPS by the read-only adapter.
      ? <img src={event.imageUrl} alt={`Listing at ${eventAddress(event)}`} loading="lazy" className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" />
      : <div className="grid h-full place-items-center text-xl text-slate-300" aria-hidden="true">⌂</div>}
  </div>;
}

function PropertyContext({ event }: { event: MarketIqListingEvent }) {
  if (!event.propertyName && !event.propertyManagerName) return null;
  return <p className="mt-1 truncate text-[11px] text-slate-400">
    {event.propertyName && <span>{event.propertyName}</span>}
    {event.propertyName && event.propertyManagerName && <span aria-hidden="true"> · </span>}
    {event.propertyManagerName && <span>Managed by {event.propertyManagerName}</span>}
  </p>;
}

function NewListingRow({ headline, timeZone }: { headline: MarketIqDailyEventHeadline; timeZone: string }) {
  const event = headline.event;
  return <article className="border-b border-slate-100 py-4 first:pt-0 last:border-0 last:pb-0">
    <EventLink event={event}>
      <div className="group grid gap-3 px-1 sm:grid-cols-[80px_112px_1fr_auto] sm:items-center">
        <ListingPhoto event={event} />
        <p className="text-2xl font-semibold tracking-tight text-[var(--report-primary)]">{money(event.askingRent)}</p>
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-[0.08em] text-teal-700">{propertyFacts(event)}</p>
          <p className="mt-1 truncate text-sm font-semibold text-slate-700">{event.city} · {eventAddress(event)}</p>
          <PropertyContext event={event} />
        </div>
        <EventTime headline={headline} timeZone={timeZone} />
      </div>
    </EventLink>
  </article>;
}

function RentChangeRow({ headlines, timeZone }: { headlines: EventGroup; timeZone: string }) {
  const headline = headlines[0];
  if (!headline) return null;
  const event = headline.event;
  const previousRent = event.previousRent ?? event.askingRent;
  const delta = event.askingRent - previousRent;
  const percentage = previousRent > 0 ? (delta / previousRent) * 100 : 0;
  const direction = delta > 0 ? "increase" : delta < 0 ? "decrease" : "no change";
  const badgeStyle = delta > 0 ? "bg-amber-50 text-amber-800 ring-amber-200" : delta < 0 ? "bg-sky-50 text-sky-800 ring-sky-200" : "bg-slate-50 text-slate-600 ring-slate-200";

  const content = <>
      <div className="group grid gap-4 px-1 sm:grid-cols-[80px_1fr]">
        <ListingPhoto event={event} />
        <div>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.08em] text-slate-500">{propertyFacts(event)} · {event.city}</p>
            <div className="mt-2 flex flex-wrap items-baseline gap-2">
              <span className="text-base text-slate-400 line-through decoration-slate-300">{money(previousRent)}</span>
              <span aria-hidden="true" className="text-slate-300">→</span>
              <strong className="text-2xl font-semibold tracking-tight text-[var(--report-primary)]">{money(event.askingRent)}</strong>
              <span aria-label={`Asking-rent ${direction} of ${signedMoney(delta)}, ${Math.abs(percentage).toFixed(1)} percent`} className={`rounded-full px-2.5 py-1 text-[11px] font-bold tabular-nums ring-1 ring-inset ${badgeStyle}`}>
                {signedMoney(delta)} · {delta > 0 ? "+" : delta < 0 ? "−" : ""}{Math.abs(percentage).toFixed(1)}%
              </span>
            </div>
          </div>
          <EventTime headline={headline} timeZone={timeZone} />
        </div>
        <p className="mt-2 text-xs text-slate-500">{eventAddress(event)} · Asking rent</p>
        <PropertyContext event={event} />
        {headlines.length > 1 && <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
          <span className="text-[11px] font-semibold text-slate-500">{headlines.length} listing records at this address</span>
          {headlines.flatMap((item, index) => item.event.listingUrl ? [<a key={item.id} href={item.event.listingUrl} target="_blank" rel="noreferrer" className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold text-teal-700 outline-none hover:bg-teal-50 focus-visible:ring-2 focus-visible:ring-teal-600">Open record {index + 1}</a>] : [])}
        </div>}
        </div>
      </div>
  </>;

  return <article className="border-b border-slate-100 py-4 first:pt-0 last:border-0 last:pb-0">
    {headlines.length === 1 ? <EventLink event={event}>{content}</EventLink> : content}
  </article>;
}

function OffMarketRow({ headline, timeZone }: { headline: MarketIqDailyEventHeadline; timeZone: string }) {
  const event = headline.event;
  if (event.eventType !== "delisting") return null;
  return <article className="border-b border-slate-100 py-4 first:pt-0 last:border-0 last:pb-0">
    <EventLink event={event}>
      <div className="group grid gap-4 px-1 sm:grid-cols-[80px_1fr]">
        <ListingPhoto event={event} />
        <div>
        <div className="flex items-start justify-between gap-3">
          <div><p className="text-sm font-semibold text-[var(--report-primary)]">{event.city} · {propertyFacts(event)}</p><p className="mt-1 text-xs text-slate-500">{eventAddress(event)} · Last asking {money(event.askingRent)}</p></div>
          <EventTime headline={headline} timeZone={timeZone} />
        </div>
        <PropertyContext event={event} />
        <span className="mt-2 inline-flex rounded-full bg-orange-50 px-2.5 py-1 text-[11px] font-bold text-orange-800 ring-1 ring-inset ring-orange-200">{event.listingAgeDays === 0 ? "Less than 1 day" : `${event.listingAgeDays.toLocaleString("en-US")} days listed`}</span>
        </div>
      </div>
    </EventLink>
  </article>;
}

function AgingRow({ headline, timeZone }: { headline: MarketIqDailyEventHeadline; timeZone: string }) {
  const event = headline.event;
  if (event.eventType !== "aging_threshold") return null;
  return <article className="border-b border-slate-100 py-4 first:pt-0 last:border-0 last:pb-0">
    <EventLink event={event}>
      <div className="group grid grid-cols-[64px_52px_1fr_auto] items-center gap-3 px-1">
        <ListingPhoto event={event} compact />
        <div className="rounded-xl bg-slate-900 px-2 py-2 text-center text-white"><strong className="block text-lg leading-none">{event.listingAgeDays}</strong><span className="text-[9px] font-bold uppercase tracking-wider text-slate-300">days</span></div>
        <div className="min-w-0"><p className="truncate text-sm font-semibold text-[var(--report-primary)]">{event.city} · {propertyFacts(event)}</p><p className="mt-1 truncate text-xs text-slate-500">{eventAddress(event)} · {money(event.askingRent)} asking</p><PropertyContext event={event} /></div>
        <EventTime headline={headline} timeZone={timeZone} />
      </div>
    </EventLink>
  </article>;
}

function ConcessionRow({ headline, timeZone }: { headline: MarketIqDailyEventHeadline; timeZone: string }) {
  const event = headline.event;
  if (event.eventType !== "concession") return null;
  return <article className="border-b border-slate-100 py-4 first:pt-0 last:border-0 last:pb-0">
    <EventLink event={event}>
      <div className="group grid gap-4 px-1 sm:grid-cols-[80px_1fr]">
        <ListingPhoto event={event} />
        <div><div className="flex items-start justify-between gap-3"><p className="text-sm font-semibold text-[var(--report-primary)]">{event.concession.label} · {event.city}</p><EventTime headline={headline} timeZone={timeZone} /></div>
        <blockquote className="mt-2 border-l-2 border-amber-400 pl-3 text-xs italic leading-5 text-slate-600">“{event.concession.evidence}”</blockquote>
        <p className="mt-2 text-[11px] font-semibold text-slate-400">{propertyFacts(event)} · {money(event.askingRent)} asking · Advertised, not verified</p>
        <PropertyContext event={event} /></div>
      </div>
    </EventLink>
  </article>;
}

function EventRow({ group, timeZone }: { group: EventGroup; timeZone: string }) {
  const headline = group[0];
  if (!headline) return null;
  if (headline.section === "new_to_market") return <NewListingRow headline={headline} timeZone={timeZone} />;
  if (headline.section === "rent_changes") return <RentChangeRow headlines={group} timeZone={timeZone} />;
  if (headline.section === "off_market") return <OffMarketRow headline={headline} timeZone={timeZone} />;
  if (headline.section === "aging_watch") return <AgingRow headline={headline} timeZone={timeZone} />;
  return <ConcessionRow headline={headline} timeZone={timeZone} />;
}

function EventSection({
  id,
  title,
  kicker,
  description,
  emptyMessage,
  groups,
  observedTotal,
  timeZone,
  primary = false,
  limit = SECONDARY_EVENT_LIMIT,
}: {
  id: string;
  title: string;
  kicker: string;
  description: string;
  emptyMessage: string;
  groups: EventGroup[];
  observedTotal: number;
  timeZone: string;
  primary?: boolean;
  limit?: number;
}) {
  const availableRecords = groups.reduce((total, group) => total + group.length, 0);
  const visible = groups.slice(0, limit);
  const remaining = groups.slice(limit);
  const recordsArePartial = availableRecords < observedTotal;
  return <section id={id} tabIndex={-1} className={`scroll-mt-20 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_12px_35px_rgba(15,23,42,0.04)] outline-none focus-visible:ring-2 focus-visible:ring-teal-600 ${primary ? "p-6 sm:p-7" : "p-5"}`} aria-label={title}>
    <header className="flex items-start justify-between gap-4 border-b border-slate-100 pb-4">
      <div><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--report-accent)]">{kicker}</p><h3 className={`${primary ? "mt-1 text-2xl" : "mt-1 text-xl"} font-semibold tracking-tight text-[var(--report-primary)]`}>{title}</h3><p className="mt-1 text-xs leading-5 text-slate-500">{description}</p></div>
      <span aria-label={recordsArePartial ? `${availableRecords} ${availableRecords === 1 ? "record" : "records"} available for ${observedTotal} observed events` : `${observedTotal} observed events`} className="shrink-0 rounded-full bg-slate-100 px-3 py-1 text-xs font-bold tabular-nums text-slate-600">{recordsArePartial ? `${availableRecords} of ${observedTotal}` : observedTotal}</span>
    </header>
    {recordsArePartial && <p className="border-b border-slate-100 bg-slate-50 px-2 py-2.5 text-[11px] leading-5 text-slate-500">Individual records are available for {availableRecords.toLocaleString("en-US")} of {observedTotal.toLocaleString("en-US")} observed events in this saved edition.</p>}
    <div className="pt-4">
      {visible.length
        ? visible.map((group) => <EventRow key={group.map((headline) => headline.id).join(":")} group={group} timeZone={timeZone} />)
        : <p className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm leading-6 text-slate-500">{observedTotal > 0 ? `${observedTotal.toLocaleString("en-US")} events were observed, but their individual records are not available in this saved edition.` : emptyMessage}</p>}
    </div>
    {remaining.length > 0 && <div className="mt-4 border-t border-slate-100 pt-4">
      <a href="#daily-event-explorer" className="flex items-center justify-between rounded-lg px-2 py-2 text-sm font-semibold text-teal-700 outline-none transition-colors hover:bg-teal-50 focus-visible:ring-2 focus-visible:ring-teal-600">
        <span>Explore {availableRecords.toLocaleString("en-US")} available records</span><span aria-hidden="true" className="text-base">↓</span>
      </a>
    </div>}
  </section>;
}

function ObservedFlow({ activity }: { activity: Extract<MarketIqMarketActivityAvailability, { state: "available" }>["activity"] }) {
  const metrics = [
    { label: "New listings", value: activity.newListings24h, detail: "Entered the market", accent: "bg-teal-400", href: `#${DAILY_EVENT_SECTION_IDS.newListings}` },
    { label: "Off market", value: activity.delistings24h, detail: "Leased or withdrawn", accent: "bg-orange-400", href: `#${DAILY_EVENT_SECTION_IDS.offMarket}` },
    { label: "Rent moves", value: activity.confirmedPriceChanges24h, detail: "Confirmed changes", accent: "bg-sky-400", href: `#${DAILY_EVENT_SECTION_IDS.rentMoves}` },
    { label: "Concessions", value: activity.advertisedConcessions24h, detail: "Advertised incentives", accent: "bg-amber-300", href: `#${DAILY_EVENT_SECTION_IDS.concessions}` },
  ];

  if (metrics.some((metric) => !Number.isFinite(metric.value))) return null;

  return <section className="mb-6 overflow-hidden rounded-2xl bg-[var(--report-primary)] text-white shadow-[0_20px_50px_rgba(15,23,42,0.16)]" aria-label="Observed 24-hour flow">
    <div className="flex flex-wrap items-end justify-between gap-3 border-b border-white/10 px-6 py-5">
      <div><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/50">24-hour market tape</p><h3 className="mt-1 text-xl font-semibold">Today at a glance</h3></div>
      <p className="text-xs text-white/55">Observed events, not estimates</p>
    </div>
    <nav aria-label="Market tape sections" className="grid sm:grid-cols-2 xl:grid-cols-4">
      {metrics.map((metric) => <a key={metric.label} href={metric.href} aria-label={`View ${metric.label} section: ${metric.value.toLocaleString("en-US")} observed`} className="group relative border-b border-white/10 px-6 py-6 outline-none transition-colors hover:bg-white/[0.06] focus-visible:bg-white/[0.08] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white/70 sm:border-r sm:[&:nth-child(2)]:border-r-0 xl:border-b-0 xl:[&:nth-child(2)]:border-r xl:last:border-r-0">
        <span aria-hidden="true" className={`absolute left-6 top-0 h-1 w-10 rounded-full ${metric.accent}`} />
        <span className="flex items-center justify-between gap-3"><span className="text-xs font-semibold text-white/65 group-hover:text-white/80">{metric.label}</span><span aria-hidden="true" className="text-[10px] font-bold uppercase tracking-wider text-white/35 transition-colors group-hover:text-white/70">View ↓</span></span>
        <strong className="mt-1 block text-4xl font-semibold tracking-tight tabular-nums">{metric.value.toLocaleString("en-US")}</strong>
        <span className="mt-1 block text-[11px] text-white/45 group-hover:text-white/60">{metric.detail}</span>
      </a>)}
    </nav>
    <p className="border-t border-white/10 px-6 py-3 text-[11px] leading-5 text-white/45">Age-based stale deactivations are excluded from off-market totals. Standing active inventory and active-listing rent summaries remain withheld pending source reconciliation.</p>
  </section>;
}

function LeaseUpAlerts({ alerts, timeZone }: { alerts: MarketIqLeaseUpAlert[]; timeZone: string }) {
  if (!alerts.length) return null;
  return <section id="daily-lease-ups" className="mb-6 scroll-mt-20 overflow-hidden rounded-2xl border border-amber-200 bg-amber-50 shadow-[0_12px_35px_rgba(120,53,15,0.08)]" aria-label="Lease-up alerts">
    <header className="flex flex-wrap items-end justify-between gap-3 border-b border-amber-200 px-6 py-5">
      <div><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-amber-800">Lease-up alert</p><h3 className="mt-1 text-xl font-semibold text-[var(--report-primary)]">A large property-level arrival was observed</h3></div>
      <span className="rounded-full bg-amber-200/70 px-3 py-1 text-xs font-bold text-amber-950">{alerts.length} {alerts.length === 1 ? "property" : "properties"}</span>
    </header>
    <div className="divide-y divide-amber-200">{alerts.map((alert) => {
      const content = <div className="grid gap-4 px-6 py-5 sm:grid-cols-[112px_1fr_auto] sm:items-center">
        <div className="h-20 w-28 overflow-hidden rounded-xl bg-white ring-1 ring-inset ring-amber-200">
          {alert.imageUrl
            // eslint-disable-next-line @next/next/no-img-element -- source listing hosts vary and URLs are validated as HTTPS by the read-only adapter.
            ? <img src={alert.imageUrl} alt={`Property at ${alert.address ?? `${alert.city}, ${alert.zip}`}`} loading="lazy" className="h-full w-full object-cover" />
            : <div className="grid h-full place-items-center text-2xl text-amber-300" aria-hidden="true">⌂</div>}
        </div>
        <div><div className="flex flex-wrap items-center gap-2"><h4 className="font-semibold text-[var(--report-primary)]">{alert.propertyName}</h4><span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-amber-900 ring-1 ring-inset ring-amber-200">{alert.newListingCount} new listings</span></div><p className="mt-1 text-sm text-slate-600">{alert.address ? `${alert.address} · ` : ""}{alert.city}, {alert.zip}</p>{alert.propertyManagerName && <p className="mt-1 text-xs font-semibold text-slate-500">Managed by {alert.propertyManagerName}</p>}<p className="mt-2 text-xs leading-5 text-slate-500">At least 25 newly observed apartment listings appeared under one property within seven days. This is a lease-up signal from advertised inventory, not independent verification of construction status or occupancy.</p></div>
        <time dateTime={alert.observedAt} className="text-[11px] font-semibold tabular-nums text-slate-500">Observed {fullDateTime(alert.observedAt, timeZone)}</time>
      </div>;
      return alert.listingUrl
        ? <a key={alert.id} href={alert.listingUrl} target="_blank" rel="noreferrer" className="block outline-none transition-colors hover:bg-amber-100/60 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-amber-700">{content}</a>
        : <article key={alert.id}>{content}</article>;
    })}</div>
  </section>;
}

function rentMovePriority(headline: MarketIqDailyEventHeadline) {
  const previousRent = headline.event.previousRent;
  return previousRent === null ? 0 : Math.abs(headline.event.askingRent - previousRent);
}

function newestFirst(a: MarketIqDailyEventHeadline, b: MarketIqDailyEventHeadline) {
  return Date.parse(b.observedAt) - Date.parse(a.observedAt);
}

function singleEventGroups(headlines: MarketIqDailyEventHeadline[]): EventGroup[] {
  return headlines.map((headline) => [headline]);
}

function rentChangeGroups(headlines: MarketIqDailyEventHeadline[]): EventGroup[] {
  const groups = new Map<string, EventGroup>();
  for (const headline of headlines) {
    const event = headline.event;
    const key = [
      event.city.trim().toLocaleLowerCase("en-US"),
      eventAddress(event).trim().toLocaleLowerCase("en-US"),
      event.propertyType,
      event.bedrooms,
      event.previousRent,
      event.askingRent,
      headline.observedAt,
    ].join("|");
    const group = groups.get(key);
    if (group) group.push(headline);
    else groups.set(key, [headline]);
  }
  return [...groups.values()];
}

export function MarketIqDailyEvents({
  availability,
  marketId,
  marketName = "the market",
  timeZone = "America/New_York",
  headingLevel = "h2",
  comparison,
  initialExplorerFilters = null,
  saveExplorerPreference,
  clearExplorerPreference,
  initialWatchlists = [],
  saveWatchlist,
  deleteWatchlist,
}: {
  availability: MarketIqMarketActivityAvailability;
  marketId?: string;
  marketName?: string;
  timeZone?: string;
  headingLevel?: "h1" | "h2";
  comparison?: ReactNode;
  initialExplorerFilters?: MarketIqDailySavedViewFilters | null;
  saveExplorerPreference?: (marketId: string, filters: MarketIqDailySavedViewFilters) => Promise<{ ok: boolean; message?: string }>;
  clearExplorerPreference?: (marketId: string) => Promise<{ ok: boolean; message?: string }>;
  initialWatchlists?: MarketIqDailyWatchlistView[];
  saveWatchlist?: (marketId: string, input: MarketIqDailyWatchlistInput) => Promise<MarketIqDailyWatchlistActionResult>;
  deleteWatchlist?: (marketId: string, watchlistId: string) => Promise<MarketIqDailyWatchlistActionResult>;
}) {
  const Heading = headingLevel;
  if (availability.state === "unavailable") {
    return <>
      <section className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 px-6 py-7" aria-label={`Daily ${marketName} listing events unavailable`}>
        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-amber-800">Daily listing events</p>
        <Heading className="mt-2 text-xl font-semibold text-[var(--report-primary)]">No events were observed for the period.</Heading>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">The listing-event source read was unavailable. No monthly trend, seeded example, or other substitute has been placed in these daily sections.</p>
        <p className="mt-3 text-xs text-slate-500">Read attempted {fullDateTime(availability.attemptedAt, timeZone)}.</p>
      </section>
      {comparison}
    </>;
  }

  const headlines = buildDailyEventHeadlines(availability.activity.events);
  const newListings = headlines.filter((headline) => headline.section === "new_to_market").sort(newestFirst);
  const rentChanges = headlines.filter((headline) => headline.section === "rent_changes").sort((a, b) => rentMovePriority(b) - rentMovePriority(a) || newestFirst(a, b));
  const delistings = headlines.filter((headline) => headline.section === "off_market").sort(newestFirst);
  const agingWatch = headlines.filter((headline) => headline.section === "aging_watch").sort(newestFirst);
  const concessions = headlines.filter((headline) => headline.section === "concessions").sort(newestFirst);

  return <section aria-label={`Daily ${marketName} listing events`}>
    <header className="mb-5 flex flex-col gap-3 border-b border-slate-200 pb-5 sm:flex-row sm:items-end sm:justify-between">
      <div><p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--report-accent)]">Daily edition · {editionDate(availability.activity.asOf, timeZone)}</p><Heading className="mt-1 text-3xl font-semibold tracking-tight text-[var(--report-primary)]">What changed in {marketName}</Heading></div>
      <p className="text-xs text-slate-500">Source current through {fullDateTime(availability.activity.asOf, timeZone)}</p>
    </header>
    <ObservedFlow activity={availability.activity} />
    {marketId && saveWatchlist && deleteWatchlist && <MarketIqDailyWatchlists activity={availability.activity} marketId={marketId} timeZone={timeZone} initialWatchlists={initialWatchlists} saveWatchlist={saveWatchlist} deleteWatchlist={deleteWatchlist} />}
    <LeaseUpAlerts alerts={availability.activity.leaseUpAlerts ?? []} timeZone={timeZone} />
    {comparison}
    <MarketIqDailyActivityMap events={availability.activity.events} leaseUpAlerts={availability.activity.leaseUpAlerts} marketName={marketName} />
    <div className="grid gap-5 lg:grid-cols-[1.08fr_0.92fr] lg:items-start">
      <EventSection id={DAILY_EVENT_SECTION_IDS.rentMoves} title="Notable rent moves" kicker="Asking-rent changes" description="Largest confirmed dollar movements, with the most recent event breaking ties." emptyMessage="No confirmed asking-rent changes were observed for the period." groups={rentChangeGroups(rentChanges)} observedTotal={availability.activity.confirmedPriceChanges24h} timeZone={timeZone} primary limit={PRIMARY_EVENT_LIMIT} />
      <EventSection id={DAILY_EVENT_SECTION_IDS.newListings} title="New to market" kicker="Latest arrivals" description="Fresh listings presented as property facts rather than repeated headlines." emptyMessage="No new listings were observed for the period." groups={singleEventGroups(newListings)} observedTotal={availability.activity.newListings24h} timeZone={timeZone} primary limit={PRIMARY_EVENT_LIMIT} />
    </div>
    <div className="mt-5 grid gap-5 lg:grid-cols-3 lg:items-start">
      <EventSection id={DAILY_EVENT_SECTION_IDS.offMarket} title="Off the market" kicker="Observed departures" description="Leased or withdrawn, undetermined." emptyMessage="No listings were observed leaving the market for the period." groups={singleEventGroups(delistings)} observedTotal={availability.activity.delistings24h} timeZone={timeZone} />
      <EventSection id="daily-aging-watch" title="The aging watch" kicker="Calendar crossings" description="Live age thresholds, not days on market." emptyMessage="No active listings crossed an aging threshold for the period." groups={singleEventGroups(agingWatch)} observedTotal={availability.activity.agingThresholds24h} timeZone={timeZone} />
      <EventSection id={DAILY_EVENT_SECTION_IDS.concessions} title="Concessions" kicker="Advertised incentives" description="Listing language, advertised and not verified." emptyMessage="No concession language was observed in new-listing text for the period." groups={singleEventGroups(concessions)} observedTotal={availability.activity.advertisedConcessions24h} timeZone={timeZone} />
    </div>
    <MarketIqDailyEventExplorer activity={availability.activity} marketId={marketId} marketName={marketName} timeZone={timeZone} initialSavedFilters={initialExplorerFilters} savePreference={saveExplorerPreference} clearPreference={clearExplorerPreference} />
  </section>;
}
