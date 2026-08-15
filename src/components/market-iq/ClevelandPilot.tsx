"use client";

import { useState } from "react";
import Link from "next/link";
import { clevelandPilot } from "@/data/market-iq/cleveland-pilot";
import { fmtDate, fmtInt, fmtPct } from "@/lib/format";
import type { MarketIqWatchlistView } from "@/lib/market-iq/watchlists";
import type { HistoricalListingPulse } from "@/lib/market-iq/historical";
import type { MarketIqTrendPulse } from "@/lib/market-iq/trends";
import { MarketWatchlistBuilder } from "@/components/market-iq/MarketWatchlistBuilder";
import { MarketIqDigestPanel } from "@/components/market-iq/MarketIqDigestPanel";
import { MarketIqAlertHistory } from "@/components/market-iq/MarketIqAlertHistory";
import type { MarketIqAlertHistoryItem } from "@/lib/market-iq/alert-history.server";
import type { ClevelandLiveListingPulse } from "@/lib/market-iq/live-listings.server";
import { DwellsyIqWorkspaceNav } from "@/components/dwellsy-iq/DwellsyIqWorkspaceNav";

function MetricCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <article className="rounded-lg border border-grid bg-white p-5 shadow-sm">
      <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-3 text-[28px] font-semibold tracking-tight text-navy">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
    </article>
  );
}

export function ClevelandPilot({
  historicalPulse,
  trendPulses,
  liveListingPulse,
  initialWatchlists = [],
  alertHistory = [],
}: {
  historicalPulse: HistoricalListingPulse;
  trendPulses: MarketIqTrendPulse[];
  liveListingPulse: ClevelandLiveListingPulse;
  initialWatchlists?: MarketIqWatchlistView[];
  alertHistory?: MarketIqAlertHistoryItem[];
}) {
  const data = { ...clevelandPilot, ...historicalPulse };
  const [selectedKey, setSelectedKey] = useState(
    trendPulses[0] ? `${trendPulses[0].trendSource.geographyType}:${trendPulses[0].trendSource.geographyValue}` : ""
  );
  const trendPulse = trendPulses.find(
    (pulse) => `${pulse.trendSource.geographyType}:${pulse.trendSource.geographyValue}` === selectedKey
  ) ?? trendPulses[0] ?? null;
  const selectedType = trendPulse?.trendSource.geographyType ?? "msa";
  const typePulses = trendPulses.filter((pulse) => pulse.trendSource.geographyType === selectedType);

  function selectType(type: string) {
    const first = trendPulses.find((pulse) => pulse.trendSource.geographyType === type);
    if (first) setSelectedKey(`${first.trendSource.geographyType}:${first.trendSource.geographyValue}`);
  }

  return (
    <main className="mx-auto w-full max-w-7xl px-5 py-8 sm:px-6 lg:px-10 lg:py-10">
      <DwellsyIqWorkspaceNav />

      <header className="grid gap-6 border-b border-grid pb-8 lg:grid-cols-[1fr_auto] lg:items-end">
        <div>
          <p className="dq-eyebrow">Market watchlist</p>
          <h1 className="dq-h1">{data.market}</h1>
          <p className="mt-3 max-w-3xl text-[15px] leading-6 text-muted-foreground">
            Asking-market intelligence for rent direction, listing supply, and product-segment performance. This view does not measure occupancy, signed leases, or effective rent.
          </p>
        </div>
        <div className="space-y-3"><div className="rounded-lg border border-teal/25 bg-teal-soft px-4 py-3 text-sm text-navy"><span className="font-semibold">Decision read:</span> {data.decisionRead}</div><Link href="/market-iq/editions" className="block rounded-md bg-navy px-4 py-3 text-center text-sm font-semibold text-white hover:bg-navy/90">Prepare next edition</Link><div className="flex justify-center gap-4"><Link href="/market-iq/distribution" className="text-xs font-semibold text-slate-500 hover:text-navy">Recipients and distribution</Link><Link href="/market-iq/subscribe" className="text-xs font-semibold text-slate-500 hover:text-navy">Plan and billing</Link></div></div>
      </header>

      <section aria-labelledby="overview-heading" className="mt-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="dq-eyebrow">Historical listing pulse</p>
            <h2 id="overview-heading" className="dq-h2">Supply is expanding, but not uniformly</h2>
          </div>
          <p className="text-xs text-muted-foreground">
            Export through {fmtDate(data.historicalSource.availableThrough)} · {fmtInt(data.historicalSource.recordCount)} records
          </p>
        </div>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="Active at cutoff" value={fmtInt(data.historical.activeAtCutoff)} detail="Active apartments and houses" />
          <MetricCard label="New listings · 30d" value={fmtInt(data.historical.newListings30d)} detail={`${fmtPct(data.historical.newListingsChange, 1, true)} versus prior 30 days`} />
          <MetricCard label="Median days on market" value={`${data.historical.medianDom.toFixed(0)} days`} detail="Active listings at export cutoff" />
          <MetricCard label="Median asking rent / sf" value={`$${data.historical.medianRentPerSqFt.toFixed(2)}`} detail="Active listings with square footage" />
        </div>
      </section>

      <section aria-labelledby="live-listings-heading" className="mt-10">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="dq-eyebrow">Current asking market</p>
            <h2 id="live-listings-heading" className="dq-h2">Live listing pulse</h2>
          </div>
          <p className="text-xs text-muted-foreground">
            {liveListingPulse.sourceAvailableThrough
              ? `Source observed ${fmtDate(liveListingPulse.sourceAvailableThrough.toISOString())}`
              : "Awaiting first synchronized snapshot"}
          </p>
        </div>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="Active listings" value={fmtInt(liveListingPulse.activeListings)} detail={`${fmtInt(liveListingPulse.apartmentListings)} apartments · ${fmtInt(liveListingPulse.houseListings)} houses`} />
          <MetricCard label="New and relisted" value={fmtInt(liveListingPulse.newEvents + liveListingPulse.relistedEvents)} detail={`${fmtInt(liveListingPulse.reactivatedEvents)} reactivated in latest refresh`} />
          <MetricCard label="Price changes" value={fmtInt(liveListingPulse.priceChangeEvents)} detail="Asking-rent changes in latest refresh" />
          <MetricCard label="Deactivated" value={fmtInt(liveListingPulse.deactivatedEvents)} detail="Listings removed since prior snapshot" />
        </div>
      </section>

      {trendPulse ? <section aria-labelledby="segments-heading" className="mt-10 grid gap-6 lg:grid-cols-[1.35fr_0.65fr]">
        <div className="rounded-lg border border-grid bg-white p-5 sm:p-6">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="dq-eyebrow">Asking-rent trends</p>
              <h2 id="segments-heading" className="dq-h2">Apartments versus houses</h2>
            </div>
            <p className="text-xs text-muted-foreground">Through {fmtDate(trendPulse.trendSource.availableThrough)}</p>
          </div>
          <div className="mt-5 grid gap-3 rounded-lg border border-grid bg-surface-soft p-4 sm:grid-cols-2">
            <label className="text-xs font-bold uppercase tracking-[0.08em] text-muted-foreground">
              Geography level
              <select value={selectedType} onChange={(event) => selectType(event.target.value)} className="mt-2 w-full rounded-md border border-grid bg-white px-3 py-2 text-sm font-normal normal-case tracking-normal text-navy">
                <option value="msa">Full market</option>
                <option value="city">City</option>
                <option value="zip">ZIP code</option>
              </select>
            </label>
            <label className="text-xs font-bold uppercase tracking-[0.08em] text-muted-foreground">
              Area
              <select value={selectedKey} onChange={(event) => setSelectedKey(event.target.value)} className="mt-2 w-full rounded-md border border-grid bg-white px-3 py-2 text-sm font-normal normal-case tracking-normal text-navy">
                {typePulses.map((pulse) => {
                  const key = `${pulse.trendSource.geographyType}:${pulse.trendSource.geographyValue}`;
                  return <option key={key} value={key}>{pulse.trendSource.displayLabel}</option>;
                })}
              </select>
            </label>
          </div>
          <div className="mt-6 divide-y divide-grid">
            {trendPulse.segments.map((segment) => (
              <div key={segment.label} className="grid grid-cols-[1fr_auto_auto] items-center gap-4 py-4 first:pt-0 last:pb-0">
                <div>
                  <p className="font-medium text-navy">{segment.label}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{fmtInt(segment.observations)} observations</p>
                </div>
                <p className="text-lg font-semibold tabular-nums text-navy">${fmtInt(segment.rent)}</p>
                <p className={`min-w-[74px] rounded-full px-2.5 py-1 text-center text-xs font-semibold tabular-nums ${segment.yoy >= 4 ? "bg-good-soft text-good" : "bg-surface-soft text-navy"}`}>
                  {fmtPct(segment.yoy, 1, true)} YoY
                </p>
              </div>
            ))}
          </div>
        </div>

        <aside className="rounded-lg border border-grid bg-surface-soft p-5 sm:p-6">
          <p className="dq-eyebrow">Watch signal</p>
          <h2 className="text-xl font-semibold tracking-tight text-navy">{trendPulse.signal.heading}</h2>
          <p className="mt-3 text-sm leading-6 text-foreground/75">
            {trendPulse.signal.narrative}
          </p>
          <p className="mt-5 border-t border-grid pt-4 text-xs leading-5 text-muted-foreground">
            Alert status is based on the latest available Dwellsy IQ trend month, not the historical listing-export cutoff.
          </p>
        </aside>
        {trendPulse.alerts.length > 0 && <div className="lg:col-span-2 rounded-lg border border-orange/25 bg-orange-soft p-5 sm:p-6">
          <p className="dq-eyebrow text-orange-700">Latest alerts</p>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            {trendPulse.alerts.map((alert) => <article key={alert.id} className="rounded-md border border-orange/20 bg-white p-4">
              <div className="flex items-start justify-between gap-3">
                <h3 className="font-semibold text-navy">{alert.headline}</h3>
                <span className="rounded-full bg-orange-soft px-2 py-1 text-[10px] font-bold uppercase text-orange-700">{alert.severity}</span>
              </div>
              <p className="mt-2 text-sm leading-5 text-foreground/75">{alert.narrative}</p>
            </article>)}
          </div>
        </div>}
      </section> : <section aria-labelledby="segments-heading" className="mt-10 rounded-lg border border-grid bg-surface-soft p-6">
        <p className="dq-eyebrow">Asking-rent trends</p>
        <h2 id="segments-heading" className="dq-h2">Trend snapshot refresh in progress</h2>
        <p className="mt-2 text-sm text-muted-foreground">No trend values are substituted while the authoritative Dwellsy IQ snapshot is being loaded.</p>
      </section>}

      <section aria-labelledby="places-heading" className="mt-10">
        <div>
          <p className="dq-eyebrow">City lens</p>
          <h2 id="places-heading" className="dq-h2">Where listing pressure is changing</h2>
        </div>
        <div className="mt-6 overflow-hidden rounded-lg border border-grid bg-white">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] text-left text-sm">
              <thead className="bg-surface-soft text-[11px] uppercase tracking-[0.1em] text-muted-foreground">
                <tr>
                  <th className="px-5 py-3 font-bold">City</th>
                  <th className="px-5 py-3 text-right font-bold">New listings · 30d</th>
                  <th className="px-5 py-3 text-right font-bold">Change</th>
                  <th className="px-5 py-3 text-right font-bold">Median DOM</th>
                  <th className="px-5 py-3 text-right font-bold">Rent / sf</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-grid">
                {data.places.map((place) => (
                  <tr key={place.name} className="hover:bg-surface-soft/60">
                    <td className="px-5 py-3.5 font-medium text-navy">{place.name}</td>
                    <td className="px-5 py-3.5 text-right tabular-nums">{fmtInt(place.newListings)}</td>
                    <td className={`px-5 py-3.5 text-right font-medium tabular-nums ${place.change < 0 ? "text-bad" : "text-good"}`}>{fmtPct(place.change, 1, true)}</td>
                    <td className="px-5 py-3.5 text-right tabular-nums">{place.medianDom.toFixed(1)} d</td>
                    <td className="px-5 py-3.5 text-right tabular-nums">${place.rentPerSqFt.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <MarketWatchlistBuilder
        key={selectedKey || "market-iq-watchlist"}
        initialWatchlists={initialWatchlists}
        selectedGeography={trendPulse ? {
          type: trendPulse.trendSource.geographyType as "msa" | "city" | "zip",
          value: trendPulse.trendSource.geographyValue,
          label: trendPulse.trendSource.displayLabel,
        } : undefined}
      />

      <MarketIqAlertHistory alerts={alertHistory} />

      <MarketIqDigestPanel />

      <section aria-labelledby="source-heading" className={`mt-10 rounded-lg border p-5 sm:p-6 ${liveListingPulse.status === "healthy" ? "border-teal/25 bg-teal-soft" : "border-orange/30 bg-orange-soft"}`}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-3xl">
            <p className={`dq-eyebrow ${liveListingPulse.status === "healthy" ? "text-teal" : "text-orange-700"}`}>Live source health</p>
            <h2 id="source-heading" className="text-xl font-semibold text-navy">{liveListingPulse.status === "healthy" ? "Direct Dwellsy listing feed connected" : "Current listing feed awaiting baseline"}</h2>
            <p className="mt-2 text-sm leading-6 text-foreground/75">{liveListingPulse.message}</p>
            <p className="mt-2 text-xs text-muted-foreground">Source: {liveListingPulse.sourceName}. Asking listings only, not occupancy, leases, or effective rent.</p>
          </div>
          <span className={`rounded-full border bg-white px-3 py-1.5 text-xs font-semibold ${liveListingPulse.status === "healthy" ? "border-teal/30 text-teal" : "border-orange/30 text-orange-700"}`}>{liveListingPulse.status === "healthy" ? "Healthy" : "Not synchronized"}</span>
        </div>
      </section>
    </main>
  );
}
