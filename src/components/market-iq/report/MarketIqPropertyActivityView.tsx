import Link from "next/link";

import type { MarketIqPropertyActivityItem, MarketIqPropertyActivityView as PropertyActivityView } from "@/lib/market-iq/property-activity";

const ACTIVITY_LABELS: Record<MarketIqPropertyActivityItem["kind"], string> = {
  new_listing: "New listing",
  price_change: "Rent change",
  delisting: "Off market",
  aging_threshold: "Aging watch",
  concession: "Concession",
  lease_up: "Lease-up signal",
};

const ACTIVITY_STYLES: Record<MarketIqPropertyActivityItem["kind"], string> = {
  new_listing: "bg-teal-50 text-teal-800 ring-teal-200",
  price_change: "bg-sky-50 text-sky-800 ring-sky-200",
  delisting: "bg-orange-50 text-orange-800 ring-orange-200",
  aging_threshold: "bg-slate-100 text-slate-700 ring-slate-200",
  concession: "bg-amber-50 text-amber-800 ring-amber-200",
  lease_up: "bg-violet-50 text-violet-800 ring-violet-200",
};

function money(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function fullDateTime(value: string, timeZone: string) {
  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone,
    timeZoneName: "short",
  });
}

function rentRange(minimum: number, maximum: number) {
  return minimum === maximum ? money(minimum) : `${money(minimum)} to ${money(maximum)}`;
}

function bedroomLabel(bedrooms: number) {
  return bedrooms === 0 ? "Studio" : `${bedrooms} BR`;
}

export function MarketIqPropertyActivityView({
  view,
  marketId,
  marketName,
  timeZone,
}: {
  view: PropertyActivityView;
  marketId: string;
  marketName: string;
  timeZone: string;
}) {
  const title = view.propertyName ?? view.address ?? `${view.city} property`;
  const dailyPath = `/market-iq/daily?market=${encodeURIComponent(marketId)}`;

  return <>
    <nav aria-label="Breadcrumb" className="mb-5 text-sm font-semibold text-slate-500">
      <Link href={dailyPath} className="hover:text-teal-800">{marketName} Daily Edition</Link>
      <span className="mx-2 text-slate-300" aria-hidden="true">/</span>
      <span className="text-navy">Property activity</span>
    </nav>

    <section className="overflow-hidden rounded-3xl bg-navy text-white shadow-[0_22px_60px_rgba(15,23,42,0.2)]">
      <div className="grid lg:grid-cols-[360px_1fr]">
        <div className="h-64 bg-slate-800 lg:h-full lg:min-h-[330px]">
          {view.imageUrl
            // eslint-disable-next-line @next/next/no-img-element -- source media hosts vary and URLs are constrained to HTTPS by the adapter.
            ? <img src={view.imageUrl} alt={`Property at ${view.address ?? view.city}`} className="h-full w-full object-cover" />
            : <div className="grid h-full place-items-center text-6xl text-white/20" aria-hidden="true">⌂</div>}
        </div>
        <div className="p-7 sm:p-9">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-teal-300">Observed property activity</p>
            {view.leaseUpObserved && <span className="rounded-full bg-violet-300/15 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-violet-200 ring-1 ring-inset ring-violet-300/30">Lease-up signal observed</span>}
          </div>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h1>
          <p className="mt-3 text-base text-white/70">{view.address ? `${view.address} · ` : ""}{view.city}, {view.zip}</p>
          {view.propertyManagerName && <p className="mt-2 text-sm font-semibold text-white/75">Managed by {view.propertyManagerName}</p>}
          <p className="mt-6 max-w-3xl text-sm leading-6 text-white/60">This view assembles observed listing events retained in persisted Daily Editions. It does not infer occupancy, leases, construction status, or unobserved inventory.</p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link href={dailyPath} className="rounded-lg bg-white px-4 py-2.5 text-sm font-semibold text-navy hover:bg-slate-100">Back to Daily Edition</Link>
            {view.listingUrl && <a href={view.listingUrl} target="_blank" rel="noreferrer" className="rounded-lg border border-white/25 px-4 py-2.5 text-sm font-semibold text-white hover:bg-white/10">Open source property ↗</a>}
          </div>
        </div>
      </div>
    </section>

    <section className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Latest property facts">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">Active advertised listings</p><strong className="mt-2 block text-3xl font-semibold text-navy">{view.latestSummary ? view.latestSummary.activeListingCount.toLocaleString("en-US") : "Not available"}</strong><p className="mt-2 text-xs leading-5 text-slate-500">{view.latestSummary ? `At the source read on ${fullDateTime(view.latestSummary.observedAt, timeZone)}.` : "No current active-listing summary was retained."}</p></div>
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">Asking rent range</p><strong className="mt-2 block text-2xl font-semibold text-navy">{view.latestSummary ? rentRange(view.latestSummary.askingRentMin, view.latestSummary.askingRentMax) : "Not available"}</strong><p className="mt-2 text-xs leading-5 text-slate-500">Advertised asking rents only. No rent trend is calculated here.</p></div>
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">Bedroom availability</p><div className="mt-3 flex flex-wrap gap-2">{view.latestSummary?.bedroomCounts.length ? view.latestSummary.bedroomCounts.map((item) => <span key={item.bedrooms} className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-700">{bedroomLabel(item.bedrooms)} · {item.activeListings}</span>) : <strong className="text-xl font-semibold text-navy">Not available</strong>}</div><p className="mt-3 text-xs leading-5 text-slate-500">Counts of active advertised listing records.</p></div>
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">Observed history</p><strong className="mt-2 block text-3xl font-semibold text-navy">{view.activity.length.toLocaleString("en-US")}</strong><p className="mt-2 text-xs leading-5 text-slate-500">Unique retained events across {view.editionCount.toLocaleString("en-US")} {view.editionCount === 1 ? "Daily Edition" : "Daily Editions"}.</p></div>
    </section>

    <section className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_14px_40px_rgba(15,23,42,0.05)]" aria-label="Property activity history">
      <header className="border-b border-slate-200 bg-slate-50 px-6 py-6"><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-orange-700">Persisted evidence</p><h2 className="mt-1 text-2xl font-semibold tracking-tight text-navy">Activity history</h2><p className="mt-2 text-sm leading-6 text-slate-600">Every item keeps the observation time and Daily Edition in which it was retained. Repeated copies of the same source event are shown once.</p></header>
      <div className="divide-y divide-slate-100">{view.activity.map((item) => <article key={item.id} className="grid gap-4 px-6 py-5 lg:grid-cols-[150px_1fr_auto] lg:items-start">
        <div><span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.08em] ring-1 ring-inset ${ACTIVITY_STYLES[item.kind]}`}>{ACTIVITY_LABELS[item.kind]}</span></div>
        <div><h3 className="text-sm font-semibold leading-6 text-navy">{item.headline}</h3><p className="mt-1 text-xs leading-5 text-slate-500">{item.detail}</p><div className="mt-3 flex flex-wrap gap-3 text-xs font-semibold"><Link href={`${dailyPath}&edition=${encodeURIComponent(item.editionId)}`} className="text-teal-700 hover:text-teal-900">Open Daily Edition</Link>{item.listingUrl && <a href={item.listingUrl} target="_blank" rel="noreferrer" className="text-slate-500 hover:text-navy">Source listing ↗</a>}</div></div>
        <time dateTime={item.observedAt} className="text-[11px] font-semibold tabular-nums text-slate-400">Observed {fullDateTime(item.observedAt, timeZone)}</time>
      </article>)}</div>
    </section>

    <p className="mt-5 text-xs leading-5 text-slate-500">Property identity follows the source parent-property relationship. Active listing counts and asking-rent ranges are exact aggregates from the latest retained source read for this property. Off-market events mean leased or withdrawn, undetermined.</p>
  </>;
}
